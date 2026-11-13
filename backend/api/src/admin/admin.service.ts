import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { microToUsd } from "../wallet/money";

const DB_ERRORS: Record<string, [number, string]> = {
  not_permitted: [403, "forbidden"],
  super_admin_approval_required: [403, "super_admin_approval_required"],
  receipt_verification_required: [400, "receipt_verification_required"],
  deposit_not_found: [404, "not_found"],
  deposit_not_open: [409, "deposit_not_open"],
};
function mapDbError(e: unknown): never {
  const m = e instanceof Error ? e.message : "";
  const hit = DB_ERRORS[m];
  if (!hit) throw e;
  const [status, error] = hit;
  if (status === 403) throw new ForbiddenException({ error });
  if (status === 404) throw new NotFoundException({ error });
  if (status === 409) throw new ConflictException({ error });
  throw new BadRequestException({ error });
}

const note = (v: unknown, min: number, field: string): string => {
  if (typeof v !== "string" || v.trim().length < min || v.length > 500) throw new BadRequestException({ error: "validation_failed", fields: { [field]: `${min}-500 characters required` } });
  return v.trim();
};

/**
 * Money-moving staff actions. Support staff are refused here AND inside the SQL functions, which re-check the role
 * of the acting user: a bug in this file cannot let support approve a deposit.
 */
@Injectable()
export class AdminService {
  constructor(private readonly db: DbService) {}

  private requireMoneyStaff(ctx: AuthContext) {
    if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
  }
  private requireSuper(ctx: AuthContext) {
    if (ctx.role !== "super_admin") throw new ForbiddenException({ error: "forbidden" });
  }
  private id(v: string) { if (!isUuid(v)) throw new NotFoundException({ error: "not_found" }); return v; }

  async listDeposits(ctx: AuthContext, statusRaw: unknown) {
    this.requireMoneyStaff(ctx);
    const status = typeof statusRaw === "string" && ["requested", "under_review", "approved", "rejected"].includes(statusRaw) ? statusRaw : null;
    const r = await this.db.pool.query(
      `SELECT d.id, d.amount_micro_usd, d.method_note, d.status, d.receipt_verified, d.receipt_verification_note, d.created_at, d.decided_at,
              o.id AS organization_id, o.name AS organization_name,
              (SELECT a.status FROM approvals a WHERE a.action = 'wallet.deposit.approve' AND a.subject_id = d.id::text ORDER BY a.created_at DESC LIMIT 1) AS approval_status
       FROM deposits d JOIN wallets w ON w.id = d.wallet_id JOIN organizations o ON o.id = w.organization_id
       WHERE ($1::text IS NULL OR d.status = $1::text) ORDER BY d.created_at DESC LIMIT 100`, [status]);
    return r.rows.map((d) => ({
      id: d.id as string, amountUsd: microToUsd(BigInt(d.amount_micro_usd)), note: d.method_note as string | null, status: d.status as string,
      receiptVerified: d.receipt_verified as boolean, receiptNote: d.receipt_verification_note as string | null,
      organization: { id: d.organization_id as string, name: d.organization_name as string },
      approvalStatus: (d.approval_status as string | null) ?? null, createdAt: d.created_at, decidedAt: d.decided_at,
    }));
  }

  async approveDeposit(ctx: AuthContext, depositId: string, body: unknown, ip: string | undefined) {
    this.requireMoneyStaff(ctx);
    const id = this.id(depositId);
    const receiptNote = note((body as { receiptNote?: unknown } | null)?.receiptNote, 5, "receiptNote");
    try {
      return await this.db.tx(async (c) => {
        const r = await c.query("SELECT approve_deposit($1::uuid, $2::uuid, $3::text) AS credited", [id, ctx.userId, receiptNote]);
        await writeAudit(c, { actorId: ctx.userId, action: "admin.deposit_approved", subjectType: "deposit", subjectId: id, ip: cleanIp(ip), meta: { role: ctx.role } });
        return { status: "approved", credited: r.rows[0].credited as boolean };   // false = it was already approved; nothing credited twice
      });
    } catch (e) { mapDbError(e); }
  }

  async rejectDeposit(ctx: AuthContext, depositId: string, body: unknown, ip: string | undefined) {
    this.requireMoneyStaff(ctx);
    const id = this.id(depositId);
    const reason = note((body as { reason?: unknown } | null)?.reason, 5, "reason");
    try {
      return await this.db.tx(async (c) => {
        const r = await c.query("SELECT reject_deposit($1::uuid, $2::uuid, $3::text) AS changed", [id, ctx.userId, reason]);
        await writeAudit(c, { actorId: ctx.userId, action: "admin.deposit_rejected", subjectType: "deposit", subjectId: id, ip: cleanIp(ip) });
        return { status: "rejected", changed: r.rows[0].changed as boolean };
      });
    } catch (e) { mapDbError(e); }
  }

  /** Admin staff cannot approve alone: they ask a Super Admin, who decides. */
  async requestApproval(ctx: AuthContext, depositId: string, ip: string | undefined) {
    if (ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
    const id = this.id(depositId);
    return this.db.tx(async (c) => {
      const d = await c.query("SELECT status FROM deposits WHERE id = $1::uuid", [id]);
      if (!d.rows[0]) throw new NotFoundException({ error: "not_found" });
      if (!["requested", "under_review"].includes(d.rows[0].status)) throw new ConflictException({ error: "deposit_not_open" });
      const open = await c.query("SELECT id FROM approvals WHERE action = 'wallet.deposit.approve' AND subject_id = $1::text AND status = 'pending'", [id]);
      if (open.rows[0]) return { approvalId: open.rows[0].id as string, status: "pending" };
      const a = await c.query("INSERT INTO approvals(action, subject_type, subject_id, requested_by) VALUES ('wallet.deposit.approve','deposit',$1::text,$2::uuid) RETURNING id", [id, ctx.userId]);
      await writeAudit(c, { actorId: ctx.userId, action: "admin.approval_requested", subjectType: "deposit", subjectId: id, ip: cleanIp(ip) });
      return { approvalId: a.rows[0].id as string, status: "pending" };
    });
  }

  async listApprovals(ctx: AuthContext) {
    this.requireSuper(ctx);
    const r = await this.db.pool.query(
      `SELECT a.id, a.subject_id, a.status, a.created_at, u.email AS requested_by_email, d.amount_micro_usd, o.name AS organization_name
       FROM approvals a JOIN users u ON u.id = a.requested_by
       LEFT JOIN deposits d ON d.id::text = a.subject_id LEFT JOIN wallets w ON w.id = d.wallet_id LEFT JOIN organizations o ON o.id = w.organization_id
       WHERE a.action = 'wallet.deposit.approve' AND a.status = 'pending' ORDER BY a.created_at LIMIT 100`);
    return r.rows.map((a) => ({ id: a.id as string, depositId: a.subject_id as string, requestedBy: a.requested_by_email as string, organization: a.organization_name as string | null,
      amountUsd: a.amount_micro_usd ? microToUsd(BigInt(a.amount_micro_usd)) : null, createdAt: a.created_at }));
  }

  async decideApproval(ctx: AuthContext, approvalId: string, body: unknown, ip: string | undefined) {
    this.requireSuper(ctx);
    const id = this.id(approvalId);
    const b = (body ?? {}) as { decision?: unknown; note?: unknown };
    if (b.decision !== "approved" && b.decision !== "rejected") throw new BadRequestException({ error: "validation_failed", fields: { decision: "approved or rejected" } });
    const n = note(b.note, 5, "note");
    return this.db.tx(async (c) => {
      // The requester can never decide their own request.
      const r = await c.query("UPDATE approvals SET status = $2::text, decided_by = $3::uuid, decided_at = now(), decision_note = $4::text WHERE id = $1::uuid AND status = 'pending' AND requested_by <> $3::uuid RETURNING subject_id", [id, b.decision, ctx.userId, n]);
      if (!r.rows[0]) throw new ConflictException({ error: "approval_not_pending_or_own_request" });
      await writeAudit(c, { actorId: ctx.userId, action: `admin.approval_${b.decision}`, subjectType: "approval", subjectId: id, ip: cleanIp(ip) });
      return { status: b.decision };
    });
  }
}

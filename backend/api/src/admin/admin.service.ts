import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { microToUsd, MICRO } from "../wallet/money";

const DB_ERRORS: Record<string, [number, string]> = {
  not_permitted: [403, "forbidden"],
  customer_not_found: [404, "customer_not_found"],
  customer_not_active: [409, "customer_not_active"],
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

  /** Read-only directory of accounts. Never returns password hashes, secrets or MFA data. */
  async listUsers(ctx: AuthContext, qRaw: unknown) {
    this.requireMoneyStaff(ctx);
    const q = typeof qRaw === "string" ? qRaw.trim().slice(0, 100) : "";
    const like = q ? `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%` : null;
    const r = await this.db.pool.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at, o.name AS organization,
              COALESCE(w.paid_micro_usd + w.promo_micro_usd - w.reserved_micro_usd, 0)::text AS available_micro_usd
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner' LEFT JOIN organizations o ON o.id = m.organization_id
       LEFT JOIN wallets w ON w.organization_id = o.id
       WHERE ($1::text IS NULL OR u.email::text ILIKE $1::text ESCAPE '\\' OR u.display_name ILIKE $1::text ESCAPE '\\')
       ORDER BY u.created_at DESC LIMIT 100`, [like]);
    return r.rows.map((u) => ({ id: u.id as string, email: u.email as string, name: u.display_name as string, role: u.role as string, status: u.status as string, organization: (u.organization as string | null) ?? null, availableUsd: microToUsd(BigInt(u.available_micro_usd ?? "0")), createdAt: u.created_at }));
  }

  /** Only the Super Admin can grant wallet credit. Every grant is posted to the immutable ledger. */
  async creditCustomer(ctx: AuthContext, userIdRaw: string, body: unknown, ip: string | undefined) {
    this.requireSuper(ctx);
    const userId = this.id(userIdRaw);
    const b = (body ?? {}) as { amountUsd?: unknown; bucket?: unknown; reason?: unknown };
    const amountText = typeof b.amountUsd === "number" ? String(b.amountUsd) : b.amountUsd;
    if (typeof amountText !== "string" || !/^\\d{1,6}(\\.\\d{1,2})?$/.test(amountText.trim())) throw new BadRequestException({ error: "validation_failed", fields: { amountUsd: "Enter an amount greater than 0 and up to 10000 USD, with at most 2 decimals" } });
    const [whole = "0", fraction = ""] = amountText.trim().split(".");
    const amount = BigInt(whole) * MICRO + BigInt(fraction.padEnd(6, "0"));
    if (amount <= 0n || amount > 10_000n * MICRO) throw new BadRequestException({ error: "validation_failed", fields: { amountUsd: "Enter an amount greater than 0 and up to 10000 USD" } });
    if (b.bucket !== "paid" && b.bucket !== "promo") throw new BadRequestException({ error: "validation_failed", fields: { bucket: "Choose paid or promo" } });
    const reason = note(b.reason, 5, "reason");
    try {
      return await this.db.tx(async (c) => {
        const r = await c.query("SELECT admin_credit_customer($1::uuid, $2::uuid, $3::bigint, $4::text, $5::text) AS credited", [userId, ctx.userId, amount.toString(), b.bucket, reason]);
        const credited = r.rows[0].credited as boolean;
        if (credited) await writeAudit(c, { actorId: ctx.userId, action: "admin.wallet_credit", subjectType: "user", subjectId: userId, ip: cleanIp(ip), meta: { amountMicroUsd: amount.toString(), bucket: b.bucket, reason } });
        return { credited, amountUsd: microToUsd(amount), bucket: b.bucket };
      });
    } catch (e) { mapDbError(e); }
  }
  /** Newest audit events first. Metadata is deliberately not returned here. */
  async listAudit(ctx: AuthContext, actionRaw: unknown) {
    this.requireMoneyStaff(ctx);
    const action = typeof actionRaw === "string" && /^[a-z_.]{1,60}$/.test(actionRaw) ? actionRaw : null;
    const r = await this.db.pool.query(
      `SELECT e.id, e.action, e.subject_type, e.subject_id, e.ip::text AS ip, e.created_at, u.email AS actor
       FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id WHERE ($1::text IS NULL OR e.action = $1::text) ORDER BY e.id DESC LIMIT 100`, [action]);
    return r.rows.map((e) => ({ id: String(e.id), action: e.action as string, actor: (e.actor as string | null) ?? null, subjectType: (e.subject_type as string | null) ?? null, subjectId: (e.subject_id as string | null) ?? null, ip: (e.ip as string | null) ?? null, createdAt: e.created_at }));
  }

  /** Read-only: wallet buckets that do not equal the sum of their ledger entries. An empty list means the books agree. */
  async reconciliation(ctx: AuthContext) {
    this.requireMoneyStaff(ctx);
    const r = await this.db.pool.query("SELECT wallet_id, bucket, wallet_micro_usd::text AS wallet, ledger_micro_usd::text AS ledger FROM wallet_reconciliation() LIMIT 200");
    const w = await this.db.pool.query("SELECT count(*)::int AS n FROM wallets");
    return { checkedWallets: w.rows[0]?.n as number, mismatches: r.rows.map((x) => ({ walletId: x.wallet_id as string, bucket: x.bucket as string, walletMicroUsd: x.wallet as string, ledgerMicroUsd: x.ledger as string })) };
  }

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

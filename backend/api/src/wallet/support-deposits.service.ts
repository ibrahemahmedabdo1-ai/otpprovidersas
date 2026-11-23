import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { microToUsd } from "./money";

/** Support side of top-ups. Support can list requests and submit evidence for review; it can NEVER approve or credit. */
@Injectable()
export class SupportDepositsService {
  constructor(private readonly db: DbService) {}

  async list(ctx: AuthContext) {
    if (!["support_staff", "admin_staff", "super_admin"].includes(ctx.role)) throw new ForbiddenException({ error: "forbidden" });
    const r = await this.db.pool.query(`SELECT d.id, d.amount_micro_usd, d.status, d.support_evidence_note, d.created_at, d.ticket_id, o.name AS organization
      FROM deposits d JOIN wallets w ON w.id = d.wallet_id JOIN organizations o ON o.id = w.organization_id
      WHERE d.status IN ('requested','under_review')
        AND ($1::boolean = false OR d.ticket_id IS NULL OR EXISTS (
          SELECT 1 FROM tickets t WHERE t.id = d.ticket_id
            AND (t.assignee_id IS NULL OR t.assignee_id = $2::uuid)
        ))
      ORDER BY d.created_at ASC LIMIT 100`, [ctx.role === "support_staff", ctx.userId]);
    return r.rows.map((x) => ({
      id: x.id as string, amountUsd: microToUsd(BigInt(x.amount_micro_usd)), status: x.status as string,
      evidenceNote: x.support_evidence_note as string | null, ticketId: x.ticket_id as string | null,
      organization: x.organization as string, createdAt: x.created_at,
    }));
  }

  async submit(ctx: AuthContext, id: string, body: unknown, ip?: string) {
    if (ctx.role !== "support_staff") throw new ForbiddenException({ error: "forbidden" });
    const note = (body as { evidenceNote?: unknown } | null)?.evidenceNote;
    if (typeof note !== "string" || note.trim().length < 5 || note.trim().length > 500)
      throw new BadRequestException({ error: "validation_failed", fields: { evidenceNote: "5-500 characters required" } });
    return this.db.tx(async (c) => {
      const current = await c.query(`SELECT ticket_id FROM deposits
        WHERE id = $1::uuid AND status IN ('requested','under_review') FOR UPDATE`, [id]);
      if (!current.rows[0]) throw new ConflictException({ error: "deposit_not_open_or_not_found" });
      const ticketId = current.rows[0].ticket_id as string | null;
      if (ticketId) {
        const accessible = await c.query(`SELECT id FROM tickets
          WHERE id = $1::uuid AND (assignee_id IS NULL OR assignee_id = $2::uuid) FOR UPDATE`, [ticketId, ctx.userId]);
        if (!accessible.rows[0]) throw new NotFoundException({ error: "not_found" });
      }
      const r = await c.query(`UPDATE deposits SET status = 'under_review', support_submitted_by = $2::uuid, support_submitted_at = now(), support_evidence_note = $3::text
        WHERE id = $1::uuid AND status IN ('requested','under_review') RETURNING ticket_id`, [id, ctx.userId, note.trim()]);
      if (!r.rows[0]) throw new ConflictException({ error: "deposit_not_open_or_not_found" });
      if (ticketId) await c.query("UPDATE tickets SET status = 'escalated', updated_at = now() WHERE id = $1::uuid", [ticketId]);
      await c.query(`INSERT INTO notifications(user_id, kind, title, body)
        SELECT id, 'deposit_review_requested', 'Top-up awaiting approval', $1::text FROM users WHERE role IN ('admin_staff','super_admin') AND status = 'active'`,
        ["Support submitted deposit " + id + " for administrator review."]);
      await writeAudit(c, { actorId: ctx.userId, action: "support.deposit_submitted", subjectType: "deposit", subjectId: id, ip: cleanIp(ip), meta: { ticketId } });
      return { status: "under_review", ticketId };
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";

export const TICKET_STATUSES = ["open", "pending_customer", "escalated", "resolved", "closed"] as const;
const MAX_OPEN_PER_ORG = 20;

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;   // newlines and tabs are allowed in bodies
const text = (v: unknown, min: number, max: number, field: string): string => {
  if (typeof v !== "string") throw new BadRequestException({ error: "validation_failed", fields: { [field]: "text required" } });
  const s = v.trim();
  if (s.length < min || s.length > max || CTRL.test(s)) throw new BadRequestException({ error: "validation_failed", fields: { [field]: `${min}-${max} characters, no control characters` } });
  return s;
};
const oneLine = (s: string, field: string) => { if (/[\r\n]/.test(s)) throw new BadRequestException({ error: "validation_failed", fields: { [field]: "single line" } }); return s; };

/**
 * Support tickets. Customers see only their own organization's tickets and never internal notes or staff e-mail addresses.
 * Staff (support, admin, super admin) can read and reply. Nothing here touches wallets or secrets.
 */
@Injectable()
export class TicketsService {
  constructor(private readonly db: DbService) {}

  private id(v: string) { if (!isUuid(v)) throw new NotFoundException({ error: "not_found" }); return v; }
  private org(ctx: AuthContext): string {
    if ((ctx.role !== "customer" && ctx.role !== "super_admin") || !ctx.organizationId) throw new ForbiddenException({ error: "forbidden" });
    return ctx.organizationId;
  }
  private staff(ctx: AuthContext) {
    if (ctx.role !== "support_staff" && ctx.role !== "admin_staff" && ctx.role !== "super_admin") throw new ForbiddenException({ error: "forbidden" });
  }

  // ------------------------------------------------------------------ customer
  async customerList(ctx: AuthContext) {
    const org = this.org(ctx);
    const r = await this.db.pool.query("SELECT id, subject, status, priority, created_at, updated_at FROM tickets WHERE organization_id = $1::uuid ORDER BY updated_at DESC LIMIT 100", [org]);
    return r.rows.map((t) => ({ id: t.id as string, subject: t.subject as string, status: t.status as string, priority: t.priority as string, createdAt: t.created_at, updatedAt: t.updated_at }));
  }

  async customerCreate(ctx: AuthContext, body: unknown, ip: string | undefined) {
    const org = this.org(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    const subject = oneLine(text(b.subject, 3, 150, "subject"), "subject");
    const message = text(b.body, 1, 5000, "body");
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [`tickets:${org}`]);
      const open = await c.query("SELECT count(*)::int AS n FROM tickets WHERE organization_id = $1::uuid AND status <> 'closed' AND status <> 'resolved'", [org]);
      if ((open.rows[0]?.n as number) >= MAX_OPEN_PER_ORG) throw new ConflictException({ error: "too_many_open_tickets" });
      const t = await c.query("INSERT INTO tickets(organization_id, created_by, subject) VALUES ($1::uuid, $2::uuid, $3::text) RETURNING id", [org, ctx.userId, subject]);
      const tid = t.rows[0].id as string;
      const conv = await c.query("INSERT INTO conversations(ticket_id, organization_id) VALUES ($1::uuid, $2::uuid) RETURNING id", [tid, org]);
      await c.query("INSERT INTO messages(conversation_id, author_id, reply_identity, internal, body) VALUES ($1::uuid, $2::uuid, 'self', false, $3::text)", [conv.rows[0].id, ctx.userId, message]);
      await writeAudit(c, { actorId: ctx.userId, action: "ticket.created", subjectType: "ticket", subjectId: tid, ip: cleanIp(ip) });
      return { id: tid, status: "open" };
    });
  }

  async customerGet(ctx: AuthContext, ticketId: string) {
    const org = this.org(ctx);
    const id = this.id(ticketId);
    const t = await this.db.pool.query("SELECT id, subject, status, priority, created_at, updated_at FROM tickets WHERE id = $1::uuid AND organization_id = $2::uuid", [id, org]);
    if (!t.rows[0]) throw new NotFoundException({ error: "not_found" });
    const m = await this.db.pool.query(
      `SELECT m.id, m.body, m.created_at, m.author_id = $2::uuid AS mine FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.ticket_id = $1::uuid AND m.internal = false ORDER BY m.created_at, m.id`, [id, ctx.userId]);
    const x = t.rows[0];
    return {
      ticket: { id: x.id as string, subject: x.subject as string, status: x.status as string, priority: x.priority as string, createdAt: x.created_at, updatedAt: x.updated_at },
      messages: m.rows.map((r) => ({ id: r.id as string, from: (r.mine as boolean) ? "you" : "support", body: r.body as string, createdAt: r.created_at })),
    };
  }

  async customerReply(ctx: AuthContext, ticketId: string, body: unknown, ip: string | undefined) {
    const org = this.org(ctx);
    const id = this.id(ticketId);
    const message = text((body as { body?: unknown } | null)?.body, 1, 5000, "body");
    return this.db.tx(async (c) => {
      const t = await c.query("SELECT status FROM tickets WHERE id = $1::uuid AND organization_id = $2::uuid FOR UPDATE", [id, org]);
      if (!t.rows[0]) throw new NotFoundException({ error: "not_found" });
      if (t.rows[0].status === "closed") throw new ConflictException({ error: "ticket_closed" });
      const conv = await c.query("SELECT id FROM conversations WHERE ticket_id = $1::uuid LIMIT 1", [id]);
      await c.query("INSERT INTO messages(conversation_id, author_id, reply_identity, internal, body) VALUES ($1::uuid, $2::uuid, 'self', false, $3::text)", [conv.rows[0].id, ctx.userId, message]);
      await c.query("UPDATE tickets SET status = CASE WHEN status IN ('pending_customer','resolved') THEN 'open' ELSE status END WHERE id = $1::uuid", [id]);
      await writeAudit(c, { actorId: ctx.userId, action: "ticket.customer_reply", subjectType: "ticket", subjectId: id, ip: cleanIp(ip) });
      return { ok: true };
    });
  }

  // --------------------------------------------------------------------- staff
  async staffList(ctx: AuthContext, statusRaw: unknown) {
    this.staff(ctx);
    const status = typeof statusRaw === "string" && (TICKET_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : null;
    const r = await this.db.pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at, u.email AS requester, a.email AS assignee, o.name AS organization
       FROM tickets t JOIN users u ON u.id = t.created_by LEFT JOIN users a ON a.id = t.assignee_id JOIN organizations o ON o.id = t.organization_id
       WHERE ($1::text IS NULL OR t.status = $1::text) ORDER BY t.updated_at DESC LIMIT 100`, [status]);
    return r.rows.map((t) => ({ id: t.id as string, subject: t.subject as string, status: t.status as string, priority: t.priority as string, requester: t.requester as string, organization: t.organization as string, assignee: (t.assignee as string | null) ?? null, createdAt: t.created_at, updatedAt: t.updated_at }));
  }

  async staffGet(ctx: AuthContext, ticketId: string) {
    this.staff(ctx);
    const id = this.id(ticketId);
    const t = await this.db.pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at, u.email AS requester, a.email AS assignee
       FROM tickets t JOIN users u ON u.id = t.created_by LEFT JOIN users a ON a.id = t.assignee_id WHERE t.id = $1::uuid`, [id]);
    if (!t.rows[0]) throw new NotFoundException({ error: "not_found" });
    const m = await this.db.pool.query(
      `SELECT m.id, m.body, m.internal, m.created_at, u.email AS author FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN users u ON u.id = m.author_id
       WHERE c.ticket_id = $1::uuid ORDER BY m.created_at, m.id`, [id]);
    const x = t.rows[0];
    return {
      ticket: { id: x.id as string, subject: x.subject as string, status: x.status as string, priority: x.priority as string, requester: x.requester as string, assignee: (x.assignee as string | null) ?? null, createdAt: x.created_at, updatedAt: x.updated_at },
      messages: m.rows.map((r) => ({ id: r.id as string, kind: (r.internal as boolean) ? "internal" : "public", author: r.author as string, body: r.body as string, createdAt: r.created_at })),
    };
  }

  async staffPost(ctx: AuthContext, ticketId: string, internal: boolean, body: unknown, ip: string | undefined) {
    this.staff(ctx);
    const id = this.id(ticketId);
    const message = text((body as { body?: unknown } | null)?.body, 1, 5000, "body");
    const identity = ctx.role === "support_staff" ? "support" : "admin";
    return this.db.tx(async (c) => {
      const t = await c.query("SELECT status FROM tickets WHERE id = $1::uuid FOR UPDATE", [id]);
      if (!t.rows[0]) throw new NotFoundException({ error: "not_found" });
      if (t.rows[0].status === "closed") throw new ConflictException({ error: "ticket_closed" });
      const conv = await c.query("SELECT id FROM conversations WHERE ticket_id = $1::uuid LIMIT 1", [id]);
      await c.query("INSERT INTO messages(conversation_id, author_id, reply_identity, internal, body) VALUES ($1::uuid, $2::uuid, $3::text, $4::boolean, $5::text)", [conv.rows[0].id, ctx.userId, identity, internal, message]);
      if (!internal) await c.query("UPDATE tickets SET status = CASE WHEN status = 'open' THEN 'pending_customer' ELSE status END WHERE id = $1::uuid", [id]);
      else await c.query("UPDATE tickets SET updated_at = now() WHERE id = $1::uuid", [id]);
      await writeAudit(c, { actorId: ctx.userId, action: internal ? "ticket.internal_note" : "ticket.staff_reply", subjectType: "ticket", subjectId: id, ip: cleanIp(ip) });
      return { ok: true };
    });
  }

  async assignToMe(ctx: AuthContext, ticketId: string, ip: string | undefined) {
    this.staff(ctx);
    const id = this.id(ticketId);
    return this.db.tx(async (c) => {
      const r = await c.query("UPDATE tickets SET assignee_id = $2::uuid WHERE id = $1::uuid RETURNING id", [id, ctx.userId]);
      if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
      await writeAudit(c, { actorId: ctx.userId, action: "ticket.assigned", subjectType: "ticket", subjectId: id, ip: cleanIp(ip) });
      return { ok: true };
    });
  }

  async setStatus(ctx: AuthContext, ticketId: string, body: unknown, ip: string | undefined) {
    this.staff(ctx);
    const id = this.id(ticketId);
    const s = (body as { status?: unknown } | null)?.status;
    if (typeof s !== "string" || !(TICKET_STATUSES as readonly string[]).includes(s)) throw new BadRequestException({ error: "validation_failed", fields: { status: TICKET_STATUSES.join(", ") } });
    return this.db.tx(async (c) => {
      const r = await c.query("UPDATE tickets SET status = $2::text WHERE id = $1::uuid RETURNING id", [id, s]);
      if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
      await writeAudit(c, { actorId: ctx.userId, action: "ticket.status_changed", subjectType: "ticket", subjectId: id, ip: cleanIp(ip), meta: { status: s } });
      return { status: s };
    });
  }
}

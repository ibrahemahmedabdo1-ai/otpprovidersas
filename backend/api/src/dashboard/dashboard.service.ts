import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth.service";
import { DbService } from "../db.service";
import { microToUsd } from "../wallet/money";

@Injectable()
export class DashboardService {
  constructor(private readonly db: DbService) {}
  private staff(ctx: AuthContext) {
    if (!["support_staff", "admin_staff", "super_admin"].includes(ctx.role)) throw new ForbiddenException({ error: "forbidden" });
  }
  async support(ctx: AuthContext) {
    this.staff(ctx);
    const assigned = await this.db.pool.query("SELECT t.status, count(*)::int AS n FROM tickets t WHERE t.assignee_id = $1::uuid GROUP BY t.status", [ctx.userId]);
    const recent = await this.db.pool.query("SELECT t.id, t.subject, t.status, t.priority, t.updated_at, o.name AS organization, u.email AS requester, COALESCE(w.paid_micro_usd,0)::text AS paid_micro_usd, COALESCE(w.promo_micro_usd,0)::text AS promo_micro_usd, COALESCE(w.reserved_micro_usd,0)::text AS reserved_micro_usd FROM tickets t JOIN organizations o ON o.id=t.organization_id JOIN users u ON u.id=t.created_by LEFT JOIN wallets w ON w.organization_id=o.id WHERE t.assignee_id=$1::uuid ORDER BY t.updated_at DESC LIMIT 12", [ctx.userId]);
    const statusCounts = Object.fromEntries(assigned.rows.map(r => [r.status as string, Number(r.n)]));
    const customers = recent.rows.map(r => ({ ticketId:r.id, subject:r.subject, status:r.status, priority:r.priority, updatedAt:r.updated_at, organization:r.organization, email:r.requester, paidBalanceUsd:microToUsd(BigInt(r.paid_micro_usd)), giftBalanceUsd:microToUsd(BigInt(r.promo_micro_usd)), reservedUsd:microToUsd(BigInt(r.reserved_micro_usd)) }));
    return { assignedTickets:assigned.rows.reduce((n,r)=>n+Number(r.n),0), openTickets:statusCounts.open ?? 0, waitingTickets:statusCounts.pending_customer ?? 0, escalatedTickets:statusCounts.escalated ?? 0, resolvedTickets:statusCounts.resolved ?? 0, customers };
  }
  async admin(ctx: AuthContext) {
    this.staff(ctx);
    if (ctx.role === "support_staff") throw new ForbiddenException({ error: "forbidden" });
    const [users, otp, wallet, tickets, deposits, providers, recent] = await Promise.all([
      this.db.pool.query("SELECT count(*) FILTER (WHERE role='customer')::int AS customers, count(*) FILTER (WHERE role='customer' AND status='active')::int AS active_customers FROM users"),
      this.db.pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('sent','verified'))::int AS successful, count(*) FILTER (WHERE status='failed')::int AS failed, count(*) FILTER (WHERE channel='email')::int AS email, count(*) FILTER (WHERE channel='whatsapp')::int AS whatsapp FROM otp_requests WHERE created_at >= now() - interval '30 days' AND mode='live'"),
      this.db.pool.query("SELECT COALESCE(sum(paid_micro_usd),0)::text AS paid, COALESCE(sum(promo_micro_usd),0)::text AS promo FROM wallets"),
      this.db.pool.query("SELECT count(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS open, count(*) FILTER (WHERE status='escalated')::int AS escalated FROM tickets"),
      this.db.pool.query("SELECT count(*)::int AS pending FROM deposits WHERE status IN ('requested','under_review')"),
      this.db.pool.query("SELECT p.key,p.channel,p.enabled,p.maintenance,h.status,h.checked_at FROM providers p LEFT JOIN LATERAL (SELECT status,checked_at FROM provider_health ph WHERE ph.provider_id=p.id ORDER BY checked_at DESC LIMIT 1) h ON true ORDER BY p.channel,p.priority"),
      this.db.pool.query("SELECT action,subject_type,subject_id,created_at FROM audit_events ORDER BY id DESC LIMIT 8")
    ]);
    const u=users.rows[0], o=otp.rows[0], w=wallet.rows[0], t=tickets.rows[0], d=deposits.rows[0];
    return { customers:Number(u.customers), activeCustomers:Number(u.active_customers), otp30d:{total:Number(o.total),successful:Number(o.successful),failed:Number(o.failed),email:Number(o.email),whatsapp:Number(o.whatsapp)}, wallet:{paidUsd:microToUsd(BigInt(w.paid)),giftUsd:microToUsd(BigInt(w.promo))}, tickets:{open:Number(t.open),escalated:Number(t.escalated)}, pendingDeposits:Number(d.pending), providers:providers.rows.map(p=>({key:p.key,channel:p.channel,enabled:p.enabled,maintenance:p.maintenance,health:p.status ?? "unknown",checkedAt:p.checked_at})), recentActivity:recent.rows };
  }
}
import { ForbiddenException, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { DEFAULT_LOW_BALANCE_MICRO_USD, deliveryRate, fillDays, isLowBalance, microToUsd } from "./stats-util";

const DAYS = 30;
const CHANNELS = ["email", "whatsapp"] as const;

/**
 * Read-only dashboard statistics. Every number is aggregated from the live tables
 * (otp_requests, otp_deliveries, ledger_entries, wallets, deposits, tickets, providers); nothing is estimated or seeded.
 * "Delivery rate" = confirmed delivered / (delivered + failed + unknown). Queued and in-flight attempts are excluded.
 */
@Injectable()
export class StatsService {
  constructor(private readonly db: DbService) {}

  private customerOrg(ctx: AuthContext): string {
    if ((ctx.role !== "customer" && ctx.role !== "super_admin") || !ctx.organizationId) throw new ForbiddenException({ error: "forbidden" });
    return ctx.organizationId;
  }
  private adminOnly(ctx: AuthContext) {
    if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
  }

  private async lowBalanceThreshold(): Promise<number> {
    const r = await this.db.pool.query("SELECT value FROM system_settings WHERE key = 'low_balance_threshold_micro_usd'");
    const v = Number(r.rows[0]?.value);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_LOW_BALANCE_MICRO_USD;
  }

  // ------------------------------------------------------------------ customer
  async customer(ctx: AuthContext) {
    const org = this.customerOrg(ctx);
    const now = new Date();
    const since = `now() - interval '${DAYS} days'`;
    const [wallet, req, del, spend, totals, threshold] = await Promise.all([
      this.db.pool.query("SELECT (paid_micro_usd + promo_micro_usd - reserved_micro_usd)::text AS available FROM wallets WHERE organization_id = $1::uuid", [org]),
      this.db.pool.query(
        `SELECT (r.created_at AT TIME ZONE 'UTC')::date::text AS day, r.channel, count(*)::int AS requests, count(*) FILTER (WHERE r.status = 'verified')::int AS verified
         FROM otp_requests r JOIN projects p ON p.id = r.project_id
         WHERE p.organization_id = $1::uuid AND r.mode = 'live' AND r.created_at >= ${since} GROUP BY 1, 2`, [org]),
      this.db.pool.query(
        `SELECT (d.created_at AT TIME ZONE 'UTC')::date::text AS day, r.channel,
                count(*) FILTER (WHERE d.status = 'delivered')::int AS delivered, count(*) FILTER (WHERE d.status = 'failed')::int AS failed,
                count(*) FILTER (WHERE d.status = 'unknown')::int AS unknown, count(*) FILTER (WHERE d.status IN ('queued','submitted'))::int AS in_flight
         FROM otp_deliveries d JOIN otp_requests r ON r.id = d.otp_request_id JOIN projects p ON p.id = r.project_id
         WHERE p.organization_id = $1::uuid AND r.mode = 'live' AND d.created_at >= ${since} GROUP BY 1, 2`, [org]),
      this.db.pool.query(
        `SELECT (l.created_at AT TIME ZONE 'UTC')::date::text AS day, (-SUM(l.amount_micro_usd))::text AS spent
         FROM ledger_entries l JOIN wallets w ON w.id = l.wallet_id
         WHERE w.organization_id = $1::uuid AND l.entry_type IN ('charge','refund') AND l.bucket IN ('paid','promo') AND l.created_at >= ${since} GROUP BY 1`, [org]),
      this.db.pool.query(
        `SELECT count(*) FILTER (WHERE r.mode = 'live')::int AS live, count(*) FILTER (WHERE r.mode = 'test')::int AS test
         FROM otp_requests r JOIN projects p ON p.id = r.project_id WHERE p.organization_id = $1::uuid AND r.created_at >= ${since}`, [org]),
      this.lowBalanceThreshold(),
    ]);

    const availableMicro = Number(wallet.rows[0]?.available ?? 0);
    const reqByDay = new Map<string, number>();
    for (const r of req.rows) reqByDay.set(r.day as string, (reqByDay.get(r.day as string) ?? 0) + (r.requests as number));
    const delByDay = new Map<string, { delivered: number; failed: number }>();
    for (const r of del.rows) {
      const cur = delByDay.get(r.day as string) ?? { delivered: 0, failed: 0 };
      cur.delivered += r.delivered as number; cur.failed += r.failed as number; delByDay.set(r.day as string, cur);
    }
    const series = fillDays(
      [...new Set([...reqByDay.keys(), ...delByDay.keys()])].map((day) => ({ day, sent: reqByDay.get(day) ?? 0, delivered: delByDay.get(day)?.delivered ?? 0, failed: delByDay.get(day)?.failed ?? 0 })),
      DAYS, now, ["sent", "delivered", "failed"] as const);

    const channels = CHANNELS.map((ch) => {
      const rr = req.rows.filter((r) => r.channel === ch);
      const dd = del.rows.filter((r) => r.channel === ch);
      const sum = (rows: Record<string, unknown>[], k: string) => rows.reduce((n, r) => n + Number(r[k] ?? 0), 0);
      const delivered = sum(dd, "delivered"), failed = sum(dd, "failed"), unknown = sum(dd, "unknown");
      return { channel: ch, requests: sum(rr, "requests"), verified: sum(rr, "verified"), delivered, failed, unknown, inFlight: sum(dd, "in_flight"), deliveryRatePct: deliveryRate(delivered, failed, unknown) };
    });

    const spentByDay = fillDays(spend.rows.map((r) => ({ day: r.day, spent: microToUsd(r.spent) })), DAYS, now, ["spent"] as const);
    const spentTotalMicro = spend.rows.reduce((n, r) => n + Number(r.spent ?? 0), 0);
    return {
      periodDays: DAYS,
      generatedAt: now.toISOString(),
      balance: { availableUsd: microToUsd(availableMicro), lowBalance: isLowBalance(availableMicro, threshold), thresholdUsd: microToUsd(threshold) },
      requests: { live: Number(totals.rows[0]?.live ?? 0), test: Number(totals.rows[0]?.test ?? 0) },
      series,
      channels,
      spend: { totalUsd: microToUsd(spentTotalMicro), byDay: spentByDay },
    };
  }

  // ---------------------------------------------------------------------- admin
  async admin(ctx: AuthContext) {
    this.adminOnly(ctx);
    const now = new Date();
    const since = `now() - interval '${DAYS} days'`;
    const [customers, verifs, otp, daily, money, deposits, providers, devices, tickets, incidents] = await Promise.all([
      this.db.pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*) FILTER (WHERE status = 'suspended')::int AS suspended FROM users WHERE role = 'customer'"),
      this.db.pool.query("SELECT count(*)::int AS pending FROM customer_verifications WHERE status IN ('pending','needs_info')"),
      this.db.pool.query(
        `SELECT r.channel, count(DISTINCT r.id)::int AS requests,
                count(DISTINCT r.id) FILTER (WHERE d.status = 'delivered')::int AS delivered, count(DISTINCT r.id) FILTER (WHERE r.status = 'failed')::int AS failed
         FROM otp_requests r LEFT JOIN otp_deliveries d ON d.otp_request_id = r.id WHERE r.mode = 'live' AND r.created_at >= ${since} GROUP BY r.channel`),
      this.db.pool.query(
        `SELECT (r.created_at AT TIME ZONE 'UTC')::date::text AS day, count(DISTINCT r.id)::int AS sent, count(DISTINCT r.id) FILTER (WHERE d.status = 'delivered')::int AS delivered
         FROM otp_requests r LEFT JOIN otp_deliveries d ON d.otp_request_id = r.id WHERE r.mode = 'live' AND r.created_at >= ${since} GROUP BY 1`),
      this.db.pool.query(
        `SELECT
           COALESCE(SUM(amount_micro_usd) FILTER (WHERE entry_type = 'deposit' AND created_at >= ${since}), 0)::text AS deposits_30d,
           COALESCE(SUM(-amount_micro_usd) FILTER (WHERE entry_type IN ('charge','refund') AND bucket IN ('paid','promo') AND created_at >= ${since}), 0)::text AS usage_revenue_30d,
           COALESCE(SUM(-amount_micro_usd) FILTER (WHERE entry_type IN ('charge','refund') AND bucket IN ('paid','promo')), 0)::text AS usage_revenue_all,
           (SELECT COALESCE(SUM(paid_micro_usd), 0) FROM wallets)::text AS liabilities_paid,
           (SELECT COALESCE(SUM(promo_micro_usd), 0) FROM wallets)::text AS liabilities_promo
         FROM ledger_entries`),
      this.db.pool.query("SELECT count(*)::int AS n, COALESCE(SUM(amount_micro_usd), 0)::text AS amount FROM deposits WHERE status IN ('requested','under_review')"),
      this.db.pool.query(
        `SELECT p.key, p.channel, p.enabled, p.maintenance, h.status AS health, h.success_rate::float8 AS success_rate, h.checked_at
         FROM providers p LEFT JOIN LATERAL (SELECT status, success_rate, checked_at FROM provider_health WHERE provider_id = p.id ORDER BY checked_at DESC LIMIT 1) h ON true ORDER BY p.channel, p.key`),
      this.db.pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE state = 'connected')::int AS connected, count(*) FILTER (WHERE routing_eligible)::int AS eligible FROM whatsapp_devices"),
      this.db.pool.query("SELECT status, count(*)::int AS n FROM tickets WHERE status NOT IN ('resolved','closed') GROUP BY status"),
      this.db.pool.query("SELECT count(*)::int AS n FROM incidents WHERE status <> 'resolved'"),
    ]);

    const rows = daily.rows.map((r) => ({ day: r.day as string, sent: r.sent as number, delivered: r.delivered as number }));
    const m = money.rows[0] ?? {};
    const byStatus: Record<string, number> = {};
    for (const t of tickets.rows) byStatus[t.status as string] = t.n as number;
    const ch = CHANNELS.map((c) => {
      const r = otp.rows.find((x) => x.channel === c);
      const requests = Number(r?.requests ?? 0), delivered = Number(r?.delivered ?? 0), failed = Number(r?.failed ?? 0);
      return { channel: c, requests, delivered, failed, deliveryRatePct: deliveryRate(delivered, failed, Math.max(0, requests - delivered - failed)) };
    });
    return {
      periodDays: DAYS,
      generatedAt: now.toISOString(),
      customers: { total: customers.rows[0]?.total ?? 0, active: customers.rows[0]?.active ?? 0, pendingEmailVerification: customers.rows[0]?.pending ?? 0, suspended: customers.rows[0]?.suspended ?? 0, pendingOrganizationReview: verifs.rows[0]?.pending ?? 0 },
      otp: { channels: ch, requests: ch.reduce((n, c) => n + c.requests, 0), delivered: ch.reduce((n, c) => n + c.delivered, 0), failed: ch.reduce((n, c) => n + c.failed, 0) },
      daily: fillDays(rows, DAYS, now, ["sent", "delivered"] as const),
      money: {
        depositsUsd30d: microToUsd(m.deposits_30d), usageRevenueUsd30d: microToUsd(m.usage_revenue_30d), usageRevenueUsdAllTime: microToUsd(m.usage_revenue_all),
        walletLiabilitiesPaidUsd: microToUsd(m.liabilities_paid), walletLiabilitiesPromoUsd: microToUsd(m.liabilities_promo),
      },
      pendingDeposits: { count: deposits.rows[0]?.n ?? 0, amountUsd: microToUsd(deposits.rows[0]?.amount) },
      providers: providers.rows.map((p) => ({ key: p.key as string, channel: p.channel as string, enabled: p.enabled as boolean, maintenance: p.maintenance as boolean, health: (p.health as string | null) ?? "unknown", successRate: (p.success_rate as number | null) ?? null, checkedAt: p.checked_at ?? null })),
      whatsappDevices: { total: devices.rows[0]?.total ?? 0, connected: devices.rows[0]?.connected ?? 0, routingEligible: devices.rows[0]?.eligible ?? 0 },
      tickets: { open: byStatus.open ?? 0, escalated: byStatus.escalated ?? 0, pendingCustomer: byStatus.pending_customer ?? 0 },
      openIncidents: incidents.rows[0]?.n ?? 0,
    };
  }
}

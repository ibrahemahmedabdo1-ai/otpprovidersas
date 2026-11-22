import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { RateLimiter } from "../common/rate-limit";
import { microToUsd, parseUsdAmount, walletView, type WalletRow } from "./money";

const rowToWallet = (r: Record<string, string>): WalletRow => ({ paid: BigInt(r.paid_micro_usd ?? 0), promo: BigInt(r.promo_micro_usd ?? 0), reserved: BigInt(r.reserved_micro_usd ?? 0), pending: BigInt(r.pending_micro_usd ?? 0) });

@Injectable()
export class WalletService {
  constructor(private readonly db: DbService) {}
  private readonly couponLimit = new RateLimiter(10, 3_600_000);

  private org(ctx: AuthContext): string {
    if ((ctx.role !== "customer" && ctx.role !== "super_admin") || !ctx.organizationId) throw new ForbiddenException({ error: "forbidden" });
    return ctx.organizationId;
  }
  private async wallet(orgId: string) {
    const r = await this.db.pool.query("SELECT id, paid_micro_usd, promo_micro_usd, reserved_micro_usd, pending_micro_usd FROM wallets WHERE organization_id = $1", [orgId]);
    if (!r.rows[0]) throw new NotFoundException({ error: "wallet_not_found" });
    return r.rows[0] as Record<string, string>;
  }

  async balance(ctx: AuthContext) { return walletView(rowToWallet(await this.wallet(this.org(ctx)))); }

  /** Developer API (API key): balance for the key's wallet. */
  async balanceByWalletId(walletId: string) {
    const r = await this.db.pool.query("SELECT paid_micro_usd, promo_micro_usd, reserved_micro_usd, pending_micro_usd FROM wallets WHERE id = $1", [walletId]);
    if (!r.rows[0]) throw new NotFoundException({ error: "wallet_not_found" });
    const v = walletView(rowToWallet(r.rows[0]));
    return { currency: v.currency, available: v.available, reserved: v.reserved };
  }

  /** Cursor pagination: newest first; pass the returned nextBefore as `before` for the next page. */
  async transactions(ctx: AuthContext, limitRaw: unknown, beforeRaw: unknown) {
    const w = await this.wallet(this.org(ctx));
    const limit = Math.min(Math.max(Number.parseInt(String(limitRaw ?? "25"), 10) || 25, 1), 100);
    const before = beforeRaw === undefined || beforeRaw === "" ? null : String(beforeRaw);
    if (before !== null && !/^\d{1,18}$/.test(before)) throw new BadRequestException({ error: "validation_failed", message: "before must be a ledger entry id" });
    const r = await this.db.pool.query(
      "SELECT id, entry_type, bucket, amount_micro_usd, memo, created_at FROM ledger_entries WHERE wallet_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint) ORDER BY id DESC LIMIT $3::int",
      [(w as unknown as { id: string }).id, before, limit + 1]);
    const page = r.rows.slice(0, limit);
    return {
      items: page.map((e) => ({ id: String(e.id), type: e.entry_type as string, bucket: e.bucket as string, amountMicroUsd: Number(e.amount_micro_usd), amountUsd: microToUsd(e.amount_micro_usd), memo: e.memo as string | null, createdAt: e.created_at })),
      nextBefore: r.rows.length > limit ? String(page[page.length - 1]!.id) : null,
    };
  }

  /** Records a top-up REQUEST only. The application never collects payment: the customer contacts Support for instructions,
   *  and only an authorised admin can approve after independently confirming the funds arrived. */
  async requestDeposit(ctx: AuthContext, body: unknown, ip: string | undefined) {
    const orgId = this.org(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    const amount = parseUsdAmount(b.amountUsd);
    if (!amount.ok) throw new BadRequestException({ error: "validation_failed", message: amount.error });
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(note)) throw new BadRequestException({ error: "validation_failed", message: "note contains invalid characters" });
    const w = (await this.wallet(orgId)) as unknown as { id: string };
    try {
      return await this.db.tx(async (c) => {
        const r = await c.query("SELECT request_deposit($1::uuid, $2::bigint, $3::text) AS id", [w.id, amount.value.toString(), note]);
        const id = r.rows[0].id as string;
        await writeAudit(c, { actorId: ctx.userId, action: "deposit.request", subjectType: "deposit", subjectId: id, ip: cleanIp(ip), meta: { amountMicroUsd: amount.value.toString() } });
        return { id, status: "requested", amountUsd: microToUsd(amount.value), message: "Request recorded. Contact Support to receive manual payment instructions. Your balance is credited only after an administrator confirms the funds have arrived." };
      });
    } catch (e) {
      if ((e as Error).message === "too_many_open_deposits") throw new HttpException({ error: "too_many_open_deposits" }, HttpStatus.TOO_MANY_REQUESTS);
      throw e;
    }
  }

  /** Redeem a coupon for promo credit. The database function enforces every rule and posts one idempotent ledger entry. */
  async redeemCoupon(ctx: AuthContext, body: unknown, ip: string | undefined) {
    this.org(ctx);
    const t = this.couponLimit.take(ctx.userId);
    if (!t.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: t.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code !== "string" || !/^[A-Za-z0-9_-]{3,32}$/.test(code.trim())) throw new BadRequestException({ error: "coupon_invalid" });
    try {
      const micro = await this.db.tx(async (c) => {
        const r = await c.query("SELECT redeem_coupon($1::uuid, $2::text) AS micro", [ctx.userId, code.trim()]);
        await writeAudit(c, { actorId: ctx.userId, action: "coupon.redeemed", subjectType: "coupon", subjectId: ctx.userId, ip: cleanIp(ip), meta: { code: code.trim().toUpperCase() } });
        return BigInt(r.rows[0].micro as string);
      });
      return { creditedUsd: microToUsd(micro), bucket: "promotional" };
    } catch (e) {
      const m = (e as Error).message;
      if (m === "coupon_invalid" || m === "coupon_exhausted" || m === "coupon_already_used") throw new BadRequestException({ error: m });
      if (m === "not_permitted") throw new ForbiddenException({ error: "forbidden" });
      throw e;
    }
  }

  async deposits(ctx: AuthContext) {
    const w = (await this.wallet(this.org(ctx))) as unknown as { id: string };
    const r = await this.db.pool.query("SELECT id, amount_micro_usd, status, method_note, created_at, decided_at FROM deposits WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 50", [w.id]);
    return r.rows.map((d) => ({ id: d.id as string, amountUsd: microToUsd(d.amount_micro_usd), status: d.status as string, note: d.method_note as string | null, createdAt: d.created_at, decidedAt: d.decided_at }));
  }

  /** Developer API: OTP request counts per day, channel and mode for the key's project (last 30 days). */
  async usage(projectId: string) {
    const r = await this.db.pool.query(
      `SELECT date_trunc('day', created_at)::date AS day, channel, mode, count(*)::int AS requests, (count(*) FILTER (WHERE status = 'verified'))::int AS verified
       FROM otp_requests WHERE project_id = $1 AND created_at >= now() - interval '30 days' GROUP BY 1,2,3 ORDER BY 1 DESC, 2, 3`, [projectId]);
    return { periodDays: 30, items: r.rows.map((u) => ({ day: u.day, channel: u.channel as string, mode: u.mode as string, requests: u.requests as number, verified: u.verified as number })) };
  }
}

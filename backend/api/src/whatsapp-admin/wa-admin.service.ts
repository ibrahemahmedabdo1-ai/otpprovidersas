import { BadRequestException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, ForbiddenException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { RateLimiter } from "../common/rate-limit";
import { isMessageId, isUuid, maskRecipient, normalizeRecipient, parseAllowlist, validTestMessage } from "./wa-admin-util";

type Res = { ok: boolean; status: number; json(): Promise<unknown> };
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Res>;
const realFetch: Fetch = (url, init) => (globalThis as unknown as { fetch: Fetch }).fetch(url, init);

/** Admin-only access to the WhatsApp linked-device gateway. The gateway token never leaves the server and is never logged. */
@Injectable()
export class WhatsAppAdminService {
  private readonly limit = new RateLimiter(5, 10 * 60_000);
  /** Replaceable in tests; kept off the constructor so Nest does not try to inject it. */
  fetchImpl: Fetch = realFetch;
  constructor(private readonly db: DbService) {}

  private staff(ctx: AuthContext) {
    if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
  }
  private async gateway(path: string, method: "GET" | "POST", body?: unknown) {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) throw new ServiceUnavailableException({ error: "gateway_token_not_configured" });
    const p = await this.db.pool.query("SELECT config->>'gateway_url' AS url FROM providers WHERE key='whatsapp_linked_device' LIMIT 1");
    const base = (p.rows[0]?.url as string | undefined) ?? "";
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new ServiceUnavailableException({ error: "gateway_url_not_configured" });
    const ctl = new (globalThis as unknown as { AbortController: new () => { signal: AbortSignal; abort(): void } }).AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
      const r = await this.fetchImpl(base + path, { method, headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
      const data = await r.json().catch(() => ({}));
      return { status: r.status, data: data as Record<string, unknown> };
    } catch {
      throw new ServiceUnavailableException({ error: "gateway_unreachable" });
    } finally { clearTimeout(timer); }
  }

  async devices(ctx: AuthContext) {
    this.staff(ctx);
    const r = await this.gateway("/admin/devices", "GET");
    if (r.status !== 200 || !Array.isArray(r.data)) throw new ServiceUnavailableException({ error: "gateway_error", status: r.status });
    return (r.data as Array<Record<string, unknown>>).map((d) => ({ id: d.id, label: d.label, state: d.state, lastActivityAt: d.last_activity_at ?? null }));
  }

  async testSend(ctx: AuthContext, body: unknown, ip?: string) {
    this.staff(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    const to = normalizeRecipient(b.to), message = validTestMessage(b.message);
    if (!to || !message || !isUuid(b.deviceId)) throw new BadRequestException({ error: "validation_failed" });
    const allow = parseAllowlist(process.env.WA_TEST_RECIPIENTS);
    if (allow.length && !allow.includes(to)) throw new ForbiddenException({ error: "recipient_not_allowlisted" });
    const t = this.limit.take(ctx.userId);
    if (!t.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: t.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
    const r = await this.gateway("/admin/test-send", "POST", { to, deviceId: b.deviceId, message });
    const messageId = typeof r.data.messageId === "string" ? r.data.messageId : null;
    await this.db.tx(async (c) => writeAudit(c, { actorId: ctx.userId, action: "admin.whatsapp_test_send", subjectType: "whatsapp_device", subjectId: b.deviceId as string, ip: cleanIp(ip), meta: { to: maskRecipient(to), gatewayStatus: r.status, messageId } }));
    if (r.status !== 202) throw new HttpException({ error: typeof r.data.error === "string" ? r.data.error : "gateway_rejected", status: r.status }, r.status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.CONFLICT);
    return { accepted: true, messageId, note: "Accepted by WhatsApp. This is NOT a delivery receipt: check receipts for the message." };
  }

  async receipts(ctx: AuthContext, messageId: string) {
    this.staff(ctx);
    if (!isMessageId(messageId)) throw new BadRequestException({ error: "validation_failed" });
    const r = await this.gateway("/admin/receipts?messageId=" + encodeURIComponent(messageId), "GET");
    if (r.status === 404) throw new HttpException({ error: "receipts_endpoint_not_deployed" }, HttpStatus.NOT_IMPLEMENTED);
    if (r.status !== 200 || !Array.isArray(r.data)) throw new ServiceUnavailableException({ error: "gateway_error", status: r.status });
    return { messageId, events: (r.data as Array<Record<string, unknown>>).map((e) => ({ status: e.status, at: e.created_at })) };
  }
}

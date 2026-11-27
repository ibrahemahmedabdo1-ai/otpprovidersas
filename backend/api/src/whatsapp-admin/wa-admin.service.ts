import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { buildKvHealth, KV_HEALTH_SQL, KV_TABLE_SIZE_SQL, type KvTypeRow } from "./wa-kv-health";
import { isMessageId, isRecipientAllowlisted, isUuid, maskRecipient, normalizeRecipient, parseAllowlist, validTestMessage } from "./wa-admin-util";

type Res = { ok: boolean; status: number; json(): Promise<unknown> };
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Res>;
const realFetch: Fetch = (url, init) => (globalThis as unknown as { fetch: Fetch }).fetch(url, init);

/** Admin-only access to the WhatsApp linked-device gateway. The gateway token never leaves the server and is never logged. */
@Injectable()
export class WhatsAppAdminService {
  /** Replaceable in tests; kept off the constructor so Nest does not try to inject it. */
  fetchImpl: Fetch = realFetch;
  constructor(private readonly db: DbService) {}

  /** Read-only size monitoring of the gateway session store. Sizes only; no values and no key ids. */
  async kvHealth(ctx: AuthContext) {
    this.staff(ctx);
    const t = await this.db.pool.query(KV_TABLE_SIZE_SQL);
    const row = t.rows[0] as { present: boolean; total_bytes: string | number };
    const types = row.present ? await this.db.pool.query(KV_HEALTH_SQL) : { rows: [] };
    return buildKvHealth(row.present, row.total_bytes, types.rows as KvTypeRow[]);
  }
  private staff(ctx: AuthContext) {
    if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
  }
  /** Reserve one of five test-send slots per Admin user in PostgreSQL, shared across serverless instances. */
  private async reserveTestSend(ctx: AuthContext, deviceId: string, to: string, ip?: string) {
    return this.db.tx(async (c) => {
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('otp-wa-admin-test-send'), hashtext($1))",
        [ctx.userId],
      );
      const q = await c.query(
        "SELECT count(*)::int AS count, " +
        "GREATEST(1, COALESCE(CEIL(EXTRACT(EPOCH FROM (MIN(created_at) + INTERVAL '10 minutes' - NOW())))::int, 600)) AS retry_after_sec " +
        "FROM audit_events WHERE actor_id = $1::uuid AND action = 'admin.whatsapp_test_send_attempt' " +
        "AND created_at >= NOW() - INTERVAL '10 minutes'",
        [ctx.userId],
      );
      const row = q.rows[0] as { count?: number | string; retry_after_sec?: number | string } | undefined;
      if (Number(row?.count ?? 0) >= 5) {
        return { allowed: false as const, retryAfterSec: Number(row?.retry_after_sec ?? 600) };
      }
      await writeAudit(c, {
        actorId: ctx.userId,
        action: "admin.whatsapp_test_send_attempt",
        subjectType: "whatsapp_device",
        subjectId: deviceId,
        ip: cleanIp(ip),
        meta: { to: maskRecipient(to) },
      });
      return { allowed: true as const, retryAfterSec: 0 };
    });
  }

  private async auditTestSendResult(ctx: AuthContext, deviceId: string, ip: string | undefined, result: string, gatewayStatus?: number, messageId?: string | null) {
    await this.db.tx(async (c) => writeAudit(c, {
      actorId: ctx.userId,
      action: "admin.whatsapp_test_send_result",
      subjectType: "whatsapp_device",
      subjectId: deviceId,
      ip: cleanIp(ip),
      meta: { result, ...(gatewayStatus === undefined ? {} : { gatewayStatus }), ...(messageId ? { messageId } : {}) },
    }));
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
    return (r.data as Array<Record<string, unknown>>).map((d) => ({ id: d.id, label: d.label, state: d.state, routingEligible: d.routing_eligible === true, lastActivityAt: d.last_activity_at ?? null }));
  }

  /** Only the Super Admin can explicitly mark a connected linked device eligible for customer routing. */
  async setRouting(ctx: AuthContext, deviceId: string, body: unknown, ip?: string) {
    if (ctx.role !== "super_admin") throw new ForbiddenException({ error: "forbidden" });
    if (!isUuid(deviceId)) throw new BadRequestException({ error: "validation_failed" });
    const b = (body ?? {}) as Record<string, unknown>;
    if (typeof b.enabled !== "boolean") throw new BadRequestException({ error: "validation_failed" });
    return this.db.tx(async (c) => {
      const current = await c.query("SELECT id,state,routing_eligible FROM whatsapp_devices WHERE id=$1::uuid FOR UPDATE", [deviceId]);
      const row = current.rows[0];
      if (!row) throw new NotFoundException({ error: "not_found" });
      if (b.enabled && row.state !== "connected") throw new ConflictException({ error: "device_not_connected" });
      const updated = await c.query(
        "UPDATE whatsapp_devices SET routing_eligible=$2::boolean,updated_at=now() WHERE id=$1::uuid RETURNING id,state,routing_eligible",
        [deviceId,b.enabled]
      );
      await writeAudit(c, {
        actorId: ctx.userId,
        action: b.enabled ? "admin.whatsapp_routing_enabled" : "admin.whatsapp_routing_disabled",
        subjectType: "whatsapp_device",
        subjectId: deviceId,
        ip: cleanIp(ip),
        meta: { previous: row.routing_eligible === true, enabled: b.enabled, state: row.state },
      });
      return { id: updated.rows[0].id, state: updated.rows[0].state, routingEligible: updated.rows[0].routing_eligible };
    });
  }

  async testSend(ctx: AuthContext, body: unknown, ip?: string) {
    this.staff(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    const to = normalizeRecipient(b.to), message = validTestMessage(b.message);
    if (!to || !message || !isUuid(b.deviceId)) throw new BadRequestException({ error: "validation_failed" });
    const allow = parseAllowlist(process.env.WA_TEST_RECIPIENTS);
    if (allow.length === 0) throw new ServiceUnavailableException({ error: "recipient_allowlist_not_configured" });
    if (!isRecipientAllowlisted(to, allow)) throw new ForbiddenException({ error: "recipient_not_allowlisted" });
    const slot = await this.reserveTestSend(ctx, b.deviceId, to, ip);
    if (!slot.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: slot.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);

    let r: { status: number; data: Record<string, unknown> };
    try {
      r = await this.gateway("/admin/test-send", "POST", { to, deviceId: b.deviceId, message });
    } catch (error) {
      try { await this.auditTestSendResult(ctx, b.deviceId, ip, "transport_error"); }
      catch { console.error("WHATSAPP_TEST_RESULT_AUDIT_FAILED"); }
      throw error;
    }
    const messageId = typeof r.data.messageId === "string" ? r.data.messageId : null;
    try {
      await this.auditTestSendResult(ctx, b.deviceId, ip, r.status === 202 ? "accepted" : "rejected", r.status, messageId);
    } catch {
      // The immutable attempt event was already committed before the gateway call.
      // Do not turn a possibly accepted send into a retry-inducing HTTP failure.
      console.error("WHATSAPP_TEST_RESULT_AUDIT_FAILED");
    }
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

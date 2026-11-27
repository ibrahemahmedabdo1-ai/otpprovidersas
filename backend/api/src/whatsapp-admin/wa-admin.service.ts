import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { buildKvHealth, KV_HEALTH_SQL, KV_TABLE_SIZE_SQL, type KvTypeRow } from "./wa-kv-health";
import { isMessageId, isRecipientAllowlisted, isUuid, maskRecipient, normalizeRecipient, parseAllowlist, validTestMessage } from "./wa-admin-util";
import { classifyGatewayAnswer, staleTransition } from "./wa-test-job";

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

  private async gateway(path: string, method: "GET" | "POST", body?: unknown, timeoutMs = 20_000) {
    const token = process.env.WA_GATEWAY_TOKEN;
    if (!token) throw new ServiceUnavailableException({ error: "gateway_token_not_configured" });
    const p = await this.db.pool.query("SELECT config->>'gateway_url' AS url FROM providers WHERE key='whatsapp_linked_device' LIMIT 1");
    const base = (p.rows[0]?.url as string | undefined) ?? "";
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new ServiceUnavailableException({ error: "gateway_url_not_configured" });
    const ctl = new (globalThis as unknown as { AbortController: new () => { signal: AbortSignal; abort(): void } }).AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
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

  private jobView(row: Record<string, unknown>) {
    const status = String(row.status);
    return {
      jobId: row.id as string,
      requestId: row.request_id as string,
      status,
      messageId: (row.message_id as string | null) ?? null,
      error: (row.error_code as string | null) ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      note: status === "accepted"
        ? "Accepted by WhatsApp. This is NOT a delivery receipt: check receipts for the message."
        : status === "unknown"
          ? "The outcome could not be confirmed. The message may have been sent. Do NOT resend; check the receipts and the phone."
          : undefined,
    };
  }

  /** Compare-and-set so a job only ever moves forward and a late writer cannot overwrite a newer state. */
  private async moveJob(jobId: string, from: string[], to: string, error: string | null) {
    await this.db.pool.query(
      "UPDATE wa_admin_test_jobs SET status=$3::text, error_code=$4::text, updated_at=now() WHERE id=$1::uuid AND status = ANY($2::text[])",
      [jobId, from, to, error],
    );
  }

  private async findJob(userId: string, requestId: string) {
    const r = await this.db.pool.query("SELECT * FROM wa_admin_test_jobs WHERE requested_by=$1::uuid AND request_id=$2::uuid", [userId, requestId]);
    return r.rows[0] as Record<string, unknown> | undefined;
  }

  /**
   * Queue one test message and return immediately. Idempotent per (admin, requestId): replaying the same
   * requestId returns the existing job and never reaches the gateway again, so a slow or retried request
   * cannot produce a second WhatsApp message. A gateway timeout is never treated as a failed send.
   */
  async testSend(ctx: AuthContext, body: unknown, ip?: string) {
    this.staff(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    const to = normalizeRecipient(b.to), message = validTestMessage(b.message);
    if (!to || !message || !isUuid(b.deviceId) || !isUuid(b.requestId)) throw new BadRequestException({ error: "validation_failed" });
    const deviceId = b.deviceId, requestId = b.requestId;
    const allow = parseAllowlist(process.env.WA_TEST_RECIPIENTS);
    if (allow.length === 0) throw new ServiceUnavailableException({ error: "recipient_allowlist_not_configured" });
    if (!isRecipientAllowlisted(to, allow)) throw new ForbiddenException({ error: "recipient_not_allowlisted" });

    const replay = await this.findJob(ctx.userId, requestId);
    if (replay) return this.jobView(replay);

    const slot = await this.reserveTestSend(ctx, deviceId, to, ip);
    if (!slot.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: slot.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);

    const inserted = await this.db.pool.query(
      "INSERT INTO wa_admin_test_jobs(request_id, requested_by, device_id, recipient_masked) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::text) ON CONFLICT (requested_by, request_id) DO NOTHING RETURNING id",
      [requestId, ctx.userId, deviceId, maskRecipient(to)],
    );
    if (!inserted.rows[0]) {
      const raced = await this.findJob(ctx.userId, requestId);
      if (raced) return this.jobView(raced);
      throw new ConflictException({ error: "job_conflict" });
    }
    const jobId = inserted.rows[0].id as string;

    try {
      const r = await this.gateway("/admin/test-send", "POST", { to, deviceId, message, jobId }, 8_000);
      const answer = classifyGatewayAnswer(r.status, r.data);
      if (answer.action === "fail") await this.moveJob(jobId, ["queued"], "failed", answer.error);
    } catch (error) {
      // Configuration errors mean the gateway was never contacted: nothing could have been sent.
      const resp = error instanceof ServiceUnavailableException ? (error.getResponse() as { error?: string }) : undefined;
      if (resp?.error === "gateway_token_not_configured" || resp?.error === "gateway_url_not_configured") {
        await this.moveJob(jobId, ["queued"], "failed", resp.error);
        throw error;
      }
      // Transport timeout or error: the gateway may already own the job. Leave it queued; never resend.
    }
    const row = await this.db.pool.query("SELECT * FROM wa_admin_test_jobs WHERE id=$1::uuid", [jobId]);
    return this.jobView(row.rows[0] as Record<string, unknown>);
  }

  /** Poll a test-send job. Time-based rules close jobs the gateway never claimed or never finished. */
  async testJob(ctx: AuthContext, jobId: string) {
    this.staff(ctx);
    if (!isUuid(jobId)) throw new BadRequestException({ error: "validation_failed" });
    const q = "SELECT *, EXTRACT(EPOCH FROM (now() - updated_at))::int AS age_sec FROM wa_admin_test_jobs WHERE id=$1::uuid";
    let r = await this.db.pool.query(q, [jobId]);
    let row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row || (ctx.role !== "super_admin" && row.requested_by !== ctx.userId)) throw new NotFoundException({ error: "not_found" });
    const t = staleTransition(String(row.status), Number(row.age_sec ?? 0));
    if (t) {
      await this.moveJob(jobId, [String(row.status)], t.to, t.error);
      r = await this.db.pool.query(q, [jobId]);
      row = r.rows[0] as Record<string, unknown>;
    }
    return this.jobView(row);
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

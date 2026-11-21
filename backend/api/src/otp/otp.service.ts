import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { enqueueWebhookEvent } from "../webhooks/webhooks.service";
import { DbService } from "../db.service";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { decryptString, encryptString, generateOtp, hashOtp, hmacHex, safeEqualHex } from "../common/crypto";
import { sha256 } from "../auth/tokens";
import { isUuid, parseLocale } from "../auth/validators";
import type { ApiKeyContext } from "./api-key.guard";
import { decideResend, decideVerify } from "./otp-rules";
import { LiveOtpDeliveryService } from "./live-otp-delivery.service";
import { isOtpCode, maskRecipient, parseIdempotencyKey, parseRecipient, type Channel } from "./recipient";

const SANDBOX_NOTE = "Sandbox mode: no message was sent and no balance was charged.";
const RECIPIENT_WINDOW_LIMIT = 5;          // sends per recipient per 10 minutes

@Injectable()
export class OtpService {
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: AppConfig, private readonly live: LiveOtpDeliveryService) {}

  private tooMany(error: string, retryAfterSec?: number) {
    return new HttpException({ error, ...(retryAfterSec ? { retryAfterSec } : {}) }, HttpStatus.TOO_MANY_REQUESTS);
  }
  private requireTest(k: ApiKeyContext) {
    // Live delivery needs an activated provider, a verified customer and funded wallet. Until then live keys cannot send.
    if (k.mode !== "test") throw new ForbiddenException({ error: "live_mode_not_enabled", message: "Live sending is not enabled yet. Use a test API key." });
  }

  async send(k: ApiKeyContext, body: unknown, idemHeader: string | undefined, correlationId: string, ip: string | undefined) {
    const b = (body ?? {}) as Record<string, unknown>;
    const rec = parseRecipient(b.channel, b.to);
    if (!rec.ok) throw new BadRequestException({ error: "validation_failed", message: rec.error });
    const locale = parseLocale(b.locale);
    if (!locale.ok) throw new BadRequestException({ error: "validation_failed", message: locale.error });
    const idem = parseIdempotencyKey(idemHeader);
    if (!idem.ok) throw new BadRequestException({ error: "validation_failed", message: idem.error });
    const { channel, to } = rec.value;
    if ((channel === "email" && !k.emailEnabled) || (channel === "whatsapp" && !k.whatsappEnabled)) {
      throw new ForbiddenException({ error: "channel_disabled", message: `The ${channel} channel is disabled for this project.` });
    }
    if (k.mode === "live") return this.live.send(k, { channel, to, locale: locale.value }, idemHeader, correlationId, ip);
    this.requireTest(k);

    const rhash = hmacHex(this.cfg.otpPepper, `recipient:${channel}:${to}`);
    if (k.dailyLimit !== null) {
      const d = await this.db.pool.query("SELECT count(*)::int AS n FROM otp_requests WHERE project_id = $1 AND created_at >= date_trunc('day', now())", [k.projectId]);
      if (d.rows[0].n >= k.dailyLimit) throw this.tooMany("daily_limit_reached");
    }
    const rr = await this.db.pool.query("SELECT count(*)::int AS n FROM otp_requests WHERE project_id = $1 AND recipient_hash = $2 AND created_at > now() - interval '10 minutes'", [k.projectId, rhash]);
    if (rr.rows[0].n >= RECIPIENT_WINDOW_LIMIT) throw this.tooMany("recipient_rate_limited", 600);

    const requestHash = sha256(`${channel}|${to}`);
    const id = randomUUID(), code = generateOtp(k.otpLength);
    const out = await this.db.tx(async (c) => {
      if (idem.value) {
        const claim = await c.query("INSERT INTO idempotency_keys(project_id, key, request_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key", [k.projectId, idem.value, requestHash]);
        if (!claim.rows[0]) {
          const prev = await c.query("SELECT request_hash, response FROM idempotency_keys WHERE project_id = $1 AND key = $2", [k.projectId, idem.value]);
          const p = prev.rows[0];
          if (!p || p.request_hash !== requestHash) return { kind: "conflict" as const };
          return { kind: "replay" as const, body: p.response as Record<string, unknown> };
        }
      }
      const ins = await c.query(
        `INSERT INTO otp_requests(id, project_id, wallet_id, mode, channel, recipient_hash, recipient_encrypted, code_hash, status, max_attempts, last_sent_at, expires_at, correlation_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,'test',$4::text,$5::text,$6::text,$7::text,'sent',$8::int, now(), now() + make_interval(secs => $9::int), $10::text)
         RETURNING created_at, expires_at`,
        [id, k.projectId, k.walletId, channel, rhash, encryptString(to, this.cfg.encryptionKey), hashOtp(this.cfg.otpPepper, id, code), k.maxAttempts, k.ttlSeconds, correlationId]);
      const publicBody = { id, channel, status: "sent", mode: "test", createdAt: ins.rows[0].created_at, expiresAt: ins.rows[0].expires_at };
      if (idem.value) await c.query("UPDATE idempotency_keys SET response = $3::jsonb WHERE project_id = $1 AND key = $2", [k.projectId, idem.value, JSON.stringify(publicBody)]);   // never stores the code
      await writeAudit(c, { actorId: null, action: "otp.send", subjectType: "otp_request", subjectId: id, ip: cleanIp(ip), meta: { channel, mode: "test", projectId: k.projectId, correlationId } });
      return { kind: "created" as const, body: publicBody };
    });
    if (out.kind === "conflict") throw new UnprocessableEntityException({ error: "idempotency_conflict", message: "This Idempotency-Key was already used with a different request." });
    if (out.kind === "replay") return { status: 200, body: out.body };
    return { status: 201, body: { ...out.body, sandbox: { code, message: SANDBOX_NOTE } } };
  }

  async verify(k: ApiKeyContext, body: unknown, ip: string | undefined) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (!isUuid(b.id)) throw new NotFoundException({ error: "not_found" });
    if (!isOtpCode(b.code)) throw new BadRequestException({ error: "validation_failed", message: "code must be 4-8 digits" });
    const id = b.id, code = b.code;
    const result = await this.db.tx(async (c) => {
      // Row lock: concurrent guesses are serialised, so attempt counting cannot be raced.
      const r = await c.query("SELECT status, attempts, max_attempts, expires_at, code_hash, channel, mode FROM otp_requests WHERE id = $1 AND project_id = $2 FOR UPDATE", [id, k.projectId]);
      const row = r.rows[0];
      if (!row) return { kind: "not_found" as const };
      const matches = safeEqualHex(hashOtp(this.cfg.otpPepper, id, code), row.code_hash);
      const d = decideVerify({ status: row.status, attempts: row.attempts, maxAttempts: row.max_attempts, expiresAt: row.expires_at }, new Date(), matches);
      const addr = cleanIp(ip);
      if (d.kind === "verified") {
        await c.query("UPDATE otp_requests SET status = 'verified', attempts = $2::int, verified_at = now() WHERE id = $1", [id, d.attempts]);
        await c.query("INSERT INTO otp_attempts(otp_request_id, success, ip) VALUES ($1,true,$2::inet)", [id, addr]);
        await enqueueWebhookEvent(c, k.projectId, "otp.verified", { otpRequestId: id, channel: row.channel, mode: row.mode });
      } else if (d.kind === "invalid" || d.kind === "locked") {
        await c.query("UPDATE otp_requests SET attempts = $2::int, status = $3::text WHERE id = $1", [id, d.attempts, d.kind === "locked" ? "locked" : row.status]);
        await c.query("INSERT INTO otp_attempts(otp_request_id, success, ip) VALUES ($1,false,$2::inet)", [id, addr]);
      } else if (d.kind === "expired" && row.status !== "expired") {
        await c.query("UPDATE otp_requests SET status = 'expired' WHERE id = $1", [id]);
      }
      return d;
    });
    switch (result.kind) {   // outcomes are returned (not thrown) from the transaction so failed attempts are committed
      case "verified": return { verified: true };
      case "invalid": throw new BadRequestException({ error: "invalid_code", attemptsLeft: result.attemptsLeft });
      case "locked": case "already_locked": throw this.tooMany("too_many_attempts");
      case "expired": throw new HttpException({ error: "expired" }, HttpStatus.GONE);
      case "not_pending": throw new ConflictException({ error: "not_pending" });
      default: throw new NotFoundException({ error: "not_found" });
    }
  }

  async resend(k: ApiKeyContext, body: unknown, ip: string | undefined) {
    const id = (body as { id?: unknown } | null)?.id;
    if (!isUuid(id)) throw new NotFoundException({ error: "not_found" });
    if (k.mode === "live") return this.live.resend(k, id, ip);
    this.requireTest(k);
    const code = generateOtp(k.otpLength);
    const result = await this.db.tx(async (c) => {
      const r = await c.query("SELECT status, expires_at, last_sent_at, resend_count FROM otp_requests WHERE id = $1 AND project_id = $2 FOR UPDATE", [id, k.projectId]);
      const row = r.rows[0];
      if (!row) return { kind: "not_found" as const };
      const d = decideResend({ status: row.status, expiresAt: row.expires_at, lastSentAt: row.last_sent_at, resendCount: row.resend_count }, new Date(), k.resendCooldownSeconds);
      if (d.kind !== "ok") return d;
      // A new code replaces the old one, which stops working immediately.
      await c.query("UPDATE otp_requests SET code_hash = $2::text, resend_count = resend_count + 1, attempts = 0, last_sent_at = now(), status = 'sent' WHERE id = $1", [id, hashOtp(this.cfg.otpPepper, id, code)]);
      await writeAudit(c, { actorId: null, action: "otp.resend", subjectType: "otp_request", subjectId: id, ip: cleanIp(ip), meta: { projectId: k.projectId } });
      return d;
    });
    switch (result.kind) {
      case "ok": return { id, status: "sent", sandbox: { code, message: SANDBOX_NOTE } };
      case "cooldown": throw this.tooMany("resend_cooldown", result.retryAfterSec);
      case "max_resends": throw this.tooMany("max_resends");
      case "expired": throw new HttpException({ error: "expired" }, HttpStatus.GONE);
      case "not_pending": throw new ConflictException({ error: "not_pending" });
      default: throw new NotFoundException({ error: "not_found" });
    }
  }

  async cancel(k: ApiKeyContext, body: unknown, ip: string | undefined) {
    const id = (body as { id?: unknown } | null)?.id;
    if (!isUuid(id)) throw new NotFoundException({ error: "not_found" });
    const result = await this.db.tx(async (c) => {
      const r = await c.query("SELECT status, mode FROM otp_requests WHERE id = $1 AND project_id = $2 FOR UPDATE", [id, k.projectId]);
      const row = r.rows[0];
      if (!row) return "not_found" as const;
      if (row.status === "verified") return "conflict" as const;
      if (row.mode === "live") {
        const delivery = await c.query("SELECT status FROM otp_deliveries WHERE otp_request_id=$1 ORDER BY attempt_no DESC LIMIT 1", [id]);
        if (["queued", "submitted", "unknown"].includes(String(delivery.rows[0]?.status ?? ""))) return "delivery_pending" as const;
      }
      if (row.status !== "cancelled") {
        await c.query("UPDATE otp_requests SET status = 'cancelled' WHERE id = $1", [id]);
        await writeAudit(c, { actorId: null, action: "otp.cancel", subjectType: "otp_request", subjectId: id, ip: cleanIp(ip), meta: { projectId: k.projectId } });
      }
      return "ok" as const;
    });
    if (result === "not_found") throw new NotFoundException({ error: "not_found" });
    if (result === "conflict") throw new ConflictException({ error: "not_pending" });
    if (result === "delivery_pending") throw new ConflictException({ error: "delivery_pending", message: "The provider has not confirmed delivery or failure yet; cancellation is blocked to protect billing accuracy." });
    return { id, status: "cancelled" };
  }

  /** Status only: never returns the code, its hash, or the full recipient. */
  async get(k: ApiKeyContext, id: string) {
    if (!isUuid(id)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query(
      "SELECT id, channel, mode, status, attempts, max_attempts, resend_count, recipient_encrypted, created_at, expires_at, verified_at FROM otp_requests WHERE id = $1 AND project_id = $2", [id, k.projectId]);
    const row = r.rows[0];
    if (!row) throw new NotFoundException({ error: "not_found" });
    const expired = (row.status === "pending" || row.status === "sent") && new Date(row.expires_at) <= new Date();
    return {
      id: row.id as string, channel: row.channel as Channel, mode: row.mode as string, status: expired ? "expired" : (row.status as string),
      recipient: maskRecipient(row.channel, decryptString(row.recipient_encrypted, this.cfg.encryptionKey)),
      attempts: row.attempts as number, maxAttempts: row.max_attempts as number, resendCount: row.resend_count as number,
      createdAt: row.created_at, expiresAt: row.expires_at, verifiedAt: row.verified_at,
    };
  }
}

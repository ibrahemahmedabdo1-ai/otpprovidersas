import { generateOtp, hashOtp, safeEqual, sha256 } from "@otp/security";

export type Channel = "email" | "whatsapp";
export type OtpStatus = "pending" | "sent" | "verified" | "expired" | "cancelled" | "failed" | "locked";
export type DeliveryOutcome =
  | { kind: "delivered"; providerMessageId: string; evidence: Record<string, unknown> }
  | { kind: "failed"; reason: string; permanent: boolean }
  | { kind: "unknown"; reason: string };           // timeout / ambiguous: MUST go to reconciliation

/** Channel-agnostic provider contract. Customer API never sees which provider is behind it. */
export interface DeliveryProvider {
  id: string; channel: Channel;
  send(msg: { to: string; code: string; locale: string; correlationId: string; requestId: string }): Promise<DeliveryOutcome>;
}
export interface OtpRecord {
  id: string; projectId: string; channel: Channel; recipient: string; codeHash: string; status: OtpStatus;
  attempts: number; maxAttempts: number; resendCount: number; lastSentAt: number; expiresAt: number; correlationId: string;
  delivery: "queued" | "delivered" | "failed" | "unknown";
}
export interface OtpConfig { length: number; ttlSec: number; maxAttempts: number; resendCooldownSec: number; maxResends: number; pepper: string }
export type OtpError = "cooldown" | "not_found" | "expired" | "locked" | "not_pending" | "idempotency_conflict" | "delivery_unknown" | "max_resends" | "provider_unavailable";
export class OtpEngineError extends Error {
  code: OtpError; retryAfterSec?: number;
  constructor(code: OtpError, retryAfterSec?: number) { super(code); this.code = code; this.retryAfterSec = retryAfterSec; }
}

export interface Clock { now(): number }
export interface Ids { next(): string }

export class OtpEngine {
  private store = new Map<string, OtpRecord>();
  private idem = new Map<string, { hash: string; id: string }>();
  private cfg: OtpConfig; private pick: (ch: Channel, failed: string[]) => DeliveryProvider | null;
  private clock: Clock; private ids: Ids; private onUnknown: (r: OtpRecord, reason: string) => void;
  constructor(cfg: OtpConfig, pick: (ch: Channel, failed: string[]) => DeliveryProvider | null,
    clock: Clock = { now: Date.now }, ids: Ids = { next: () => crypto.randomUUID() },
    onUnknown: (r: OtpRecord, reason: string) => void = () => {}) {
    this.cfg = cfg; this.pick = pick; this.clock = clock; this.ids = ids; this.onUnknown = onUnknown;
  }

  get(id: string): OtpRecord | undefined { return this.store.get(id); }

  /** Idempotent: same key + same body returns the original request; same key + different body is a conflict. */
  async send(input: { projectId: string; channel: Channel; to: string; locale?: string; idempotencyKey?: string; correlationId?: string }) {
    const bodyHash = sha256(`${input.projectId}|${input.channel}|${input.to}`);
    if (input.idempotencyKey) {
      const k = `${input.projectId}:${input.idempotencyKey}`, prev = this.idem.get(k);
      if (prev) { if (prev.hash !== bodyHash) throw new OtpEngineError("idempotency_conflict"); return { id: prev.id, replayed: true }; }
    }
    const id = this.ids.next(), code = generateOtp(this.cfg.length), now = this.clock.now();
    const rec: OtpRecord = { id, projectId: input.projectId, channel: input.channel, recipient: input.to, codeHash: hashOtp(this.cfg.pepper, id, code),
      status: "pending", attempts: 0, maxAttempts: this.cfg.maxAttempts, resendCount: 0, lastSentAt: 0, expiresAt: now + this.cfg.ttlSec * 1000,
      correlationId: input.correlationId ?? id, delivery: "queued" };
    this.store.set(id, rec);
    if (input.idempotencyKey) this.idem.set(`${input.projectId}:${input.idempotencyKey}`, { hash: bodyHash, id });
    await this.deliver(rec, code, input.locale ?? "en");
    return { id, replayed: false };
  }

  /** Resend generates a NEW code (old one invalidated). Refused while the previous outcome is unknown. */
  async resend(id: string, locale = "en") {
    const r = this.mustGet(id), now = this.clock.now();
    if (r.delivery === "unknown") throw new OtpEngineError("delivery_unknown");
    if (r.status !== "pending" && r.status !== "sent") throw new OtpEngineError("not_pending");
    if (now >= r.expiresAt) { r.status = "expired"; throw new OtpEngineError("expired"); }
    const wait = r.lastSentAt + this.cfg.resendCooldownSec * 1000 - now;
    if (wait > 0) throw new OtpEngineError("cooldown", Math.ceil(wait / 1000));
    if (r.resendCount >= this.cfg.maxResends) throw new OtpEngineError("max_resends");
    const code = generateOtp(this.cfg.length);
    r.codeHash = hashOtp(this.cfg.pepper, r.id, code); r.resendCount++; r.attempts = 0; r.delivery = "queued";
    await this.deliver(r, code, locale);
  }

  verify(id: string, code: string): { ok: true } | { ok: false; reason: "invalid" | "expired" | "locked" | "not_pending"; attemptsLeft?: number } {
    const r = this.store.get(id); if (!r) return { ok: false, reason: "invalid" };   // no distinction => no enumeration
    if (r.status === "verified" || r.status === "cancelled" || r.status === "failed") return { ok: false, reason: "not_pending" };
    if (r.status === "locked") return { ok: false, reason: "locked" };
    if (this.clock.now() >= r.expiresAt) { r.status = "expired"; return { ok: false, reason: "expired" }; }
    r.attempts++;
    if (safeEqual(hashOtp(this.cfg.pepper, r.id, code), r.codeHash)) { r.status = "verified"; return { ok: true }; }   // one-time
    if (r.attempts >= r.maxAttempts) { r.status = "locked"; return { ok: false, reason: "locked" }; }
    return { ok: false, reason: "invalid", attemptsLeft: r.maxAttempts - r.attempts };
  }

  cancel(id: string) { const r = this.mustGet(id); if (r.status === "verified") throw new OtpEngineError("not_pending"); r.status = "cancelled"; }

  private async deliver(r: OtpRecord, code: string, locale: string) {
    const failed: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = this.pick(r.channel, failed);
      if (!p) { r.delivery = "failed"; r.status = "failed"; throw new OtpEngineError("provider_unavailable"); }
      const out = await p.send({ to: r.recipient, code, locale, correlationId: r.correlationId, requestId: r.id });
      r.lastSentAt = this.clock.now();
      if (out.kind === "delivered") { r.delivery = "delivered"; r.status = "sent"; return; }
      if (out.kind === "unknown") {                // never fail over / resend: the message may already be on its way
        r.delivery = "unknown"; r.status = "sent"; this.onUnknown(r, out.reason); return;
      }
      failed.push(p.id);                           // confirmed failure => safe to fail over
      r.delivery = "failed";
    }
    r.status = "failed"; throw new OtpEngineError("provider_unavailable");
  }
  private mustGet(id: string) { const r = this.store.get(id); if (!r) throw new OtpEngineError("not_found"); return r; }
}

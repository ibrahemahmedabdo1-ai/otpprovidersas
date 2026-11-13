import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { RateLimiter } from "../common/rate-limit";
import { decryptString, encryptString, hmacHex } from "../common/crypto";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { STAFF_SESSION_HOURS, SESSION_DAYS, type AuthContext } from "./auth.service";
import { newRecoveryCodes, newTotpSecret, normalizeRecovery, otpauthUri, verifyTotp } from "./totp";

@Injectable()
export class MfaService {
  /** 5 wrong codes per user per 10 minutes (in-memory: single API instance). On exhaustion the session is revoked. */
  private attempts = new RateLimiter(5, 10 * 60_000);
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  private recoveryHash = (code: string) => hmacHex(this.cfg.otpPepper, `recovery:${normalizeRecovery(code)}`);

  async setup(ctx: AuthContext, ip: string | undefined) {
    const has = await this.db.pool.query("SELECT 1 FROM mfa_factors WHERE user_id = $1::uuid AND type = 'totp' AND confirmed_at IS NOT NULL", [ctx.userId]);
    if (has.rows[0]) throw new ConflictException({ error: "mfa_already_enrolled" });
    const secret = newTotpSecret();
    await this.db.tx(async (c) => {
      await c.query("DELETE FROM mfa_factors WHERE user_id = $1::uuid AND type = 'totp' AND confirmed_at IS NULL", [ctx.userId]);
      await c.query("INSERT INTO mfa_factors(user_id, type, secret_encrypted) VALUES ($1::uuid, 'totp', $2)", [ctx.userId, encryptString(secret, this.cfg.encryptionKey)]);
      await writeAudit(c, { actorId: ctx.userId, action: "auth.mfa_setup_started", subjectType: "user", subjectId: ctx.userId, ip: cleanIp(ip) });
    });
    return { secret, otpauthUri: otpauthUri(secret, ctx.email) };   // shown once, to the person who just authenticated with a password
  }

  async confirm(ctx: AuthContext, body: unknown, ip: string | undefined) {
    const code = this.codeFrom(body);
    this.throttle(ctx);
    const f = await this.db.pool.query("SELECT id, secret_encrypted FROM mfa_factors WHERE user_id = $1::uuid AND type = 'totp' AND confirmed_at IS NULL ORDER BY created_at DESC LIMIT 1", [ctx.userId]);
    const row = f.rows[0];
    if (!row) throw new BadRequestException({ error: "mfa_setup_not_started" });
    const step = verifyTotp(decryptString(row.secret_encrypted, this.cfg.encryptionKey), code, Date.now(), null);
    if (step === null) { await this.failed(ctx, ip, "confirm"); throw new BadRequestException({ error: "invalid_code" }); }

    const codes = newRecoveryCodes();
    await this.db.tx(async (c) => {
      await c.query("UPDATE mfa_factors SET confirmed_at = now(), last_step = $2 WHERE id = $1::uuid", [row.id, step]);
      await c.query("DELETE FROM mfa_factors WHERE user_id = $1::uuid AND type = 'recovery_code'", [ctx.userId]);
      for (const rc of codes) await c.query("INSERT INTO mfa_factors(user_id, type, code_hash, confirmed_at) VALUES ($1::uuid, 'recovery_code', $2, now())", [ctx.userId, this.recoveryHash(rc)]);
      await this.markVerified(c, ctx);
      await writeAudit(c, { actorId: ctx.userId, action: "auth.mfa_enrolled", subjectType: "user", subjectId: ctx.userId, ip: cleanIp(ip) });
    });
    return { enrolled: true, recoveryCodes: codes };   // shown once; only hashes are stored
  }

  async verify(ctx: AuthContext, body: unknown, ip: string | undefined) {
    const b = (body ?? {}) as Record<string, unknown>;
    this.throttle(ctx);
    const ok = typeof b.recoveryCode === "string" ? await this.useRecovery(ctx, b.recoveryCode) : await this.useTotp(ctx, this.codeFrom(body));
    if (!ok) { await this.failed(ctx, ip, "verify"); throw new ForbiddenException({ error: "invalid_code" }); }
    await this.db.tx(async (c) => {
      await this.markVerified(c, ctx);
      await writeAudit(c, { actorId: ctx.userId, action: typeof b.recoveryCode === "string" ? "auth.mfa_verified_recovery" : "auth.mfa_verified", subjectType: "user", subjectId: ctx.userId, ip: cleanIp(ip) });
    });
    return { verified: true };
  }

  private async useTotp(ctx: AuthContext, code: string): Promise<boolean> {
    const f = await this.db.pool.query("SELECT id, secret_encrypted, last_step FROM mfa_factors WHERE user_id = $1::uuid AND type = 'totp' AND confirmed_at IS NOT NULL", [ctx.userId]);
    const row = f.rows[0];
    if (!row) return false;
    const last = row.last_step === null ? null : Number(row.last_step);
    const step = verifyTotp(decryptString(row.secret_encrypted, this.cfg.encryptionKey), code, Date.now(), last);
    if (step === null) return false;
    // Compare-and-set: two concurrent requests with the same code cannot both succeed.
    const r = await this.db.pool.query("UPDATE mfa_factors SET last_step = $2 WHERE id = $1::uuid AND (last_step IS NULL OR last_step < $2) RETURNING id", [row.id, step]);
    return r.rows.length === 1;
  }

  private async useRecovery(ctx: AuthContext, code: string): Promise<boolean> {
    if (code.length > 32) return false;
    const r = await this.db.pool.query("UPDATE mfa_factors SET used_at = now() WHERE user_id = $1::uuid AND type = 'recovery_code' AND code_hash = $2 AND used_at IS NULL RETURNING id", [ctx.userId, this.recoveryHash(code)]);
    return r.rows.length === 1;
  }

  private async markVerified(c: { query(t: string, v?: unknown[]): Promise<unknown> }, ctx: AuthContext) {
    const hours = ctx.role === "customer" ? SESSION_DAYS * 24 : STAFF_SESSION_HOURS;
    await c.query("UPDATE sessions SET mfa_verified = true, expires_at = now() + ($2 || ' hours')::interval WHERE id = $1::uuid", [ctx.sessionId, String(hours)]);
  }

  private codeFrom(body: unknown): string {
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) throw new BadRequestException({ error: "invalid_code" });
    return code.trim();
  }
  private throttle(ctx: AuthContext) {
    const t = this.attempts.take(ctx.userId);
    if (!t.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: t.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }
  private async failed(ctx: AuthContext, ip: string | undefined, phase: string) {
    await writeAudit(this.db.pool, { actorId: ctx.userId, action: "auth.mfa_failed", subjectType: "user", subjectId: ctx.userId, ip: cleanIp(ip), meta: { phase } });
  }
}

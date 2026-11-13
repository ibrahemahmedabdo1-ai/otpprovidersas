import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { DbService } from "../db.service";
import { RateLimiter } from "../common/rate-limit";
import { hmacHex } from "../common/crypto";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";

export interface ApiKeyContext {
  keyId: string; mode: "test" | "live"; projectId: string; organizationId: string; walletId: string;
  otpLength: number; ttlSeconds: number; maxAttempts: number; resendCooldownSeconds: number; dailyLimit: number | null;
  emailEnabled: boolean; whatsappEnabled: boolean;
}
export interface ApiRequest extends Request { apiKey?: ApiKeyContext }

const KEY_RE = /^Bearer (otp_(?:test|live)_[A-Za-z0-9_-]{20,100})$/;

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private limiter = new RateLimiter(120, 60_000);     // 120 requests / minute / key
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const m = KEY_RE.exec(req.header("authorization") ?? "");
    const unauthorized = () => new UnauthorizedException({ error: "invalid_api_key" });   // one answer for every failure reason
    if (!m || !m[1]) throw unauthorized();

    const r = await this.db.pool.query(
      `SELECT k.id AS key_id, k.mode, p.id AS project_id, p.organization_id, w.id AS wallet_id, o.status AS org_status,
              p.otp_length, p.otp_ttl_seconds, p.max_attempts, p.resend_cooldown_seconds, p.daily_limit, p.email_enabled, p.whatsapp_enabled
       FROM api_keys k
       JOIN projects p ON p.id = k.project_id
       JOIN organizations o ON o.id = p.organization_id
       JOIN wallets w ON w.organization_id = o.id
       WHERE k.key_hash = $1 AND k.revoked_at IS NULL`, [hmacHex(this.cfg.apiKeyPepper, m[1])]);
    const row = r.rows[0];
    if (!row || row.org_status !== "active") throw unauthorized();

    const lim = this.limiter.take(row.key_id);
    if (!lim.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: lim.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
    await this.db.pool.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')", [row.key_id]);

    req.apiKey = {
      keyId: row.key_id, mode: row.mode, projectId: row.project_id, organizationId: row.organization_id, walletId: row.wallet_id,
      otpLength: row.otp_length, ttlSeconds: row.otp_ttl_seconds, maxAttempts: row.max_attempts, resendCooldownSeconds: row.resend_cooldown_seconds,
      dailyLimit: row.daily_limit, emailEnabled: row.email_enabled, whatsappEnabled: row.whatsapp_enabled,
    };
    return true;
  }
}

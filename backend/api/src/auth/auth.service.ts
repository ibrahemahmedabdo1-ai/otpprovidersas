import { isIP } from "node:net";
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DbService } from "../db.service";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { Mailer } from "./mailer";
import { burnPasswordTime, hashPassword, verifyPassword } from "./password";
import { isTokenShape, isUuid, parseDisplayName, parseEmail, parseLocale, parsePassword } from "./validators";
import { newToken, sha256 } from "./tokens";

/** Anything with a query(text, values) method: a pool or a transaction client. */
type Queryable = { query(text: string, values?: unknown[]): Promise<unknown> };

export const SESSION_DAYS = 30;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface AuthContext { userId: string; sessionId: string; email: string; displayName: string; role: string; organizationId: string | null; mfaVerified: boolean }

function cleanIp(ip: string | undefined): string | null {
  const v = (ip ?? "").replace(/^::ffff:/, "");
  return isIP(v) ? v : null;
}

@Injectable()
export class AuthService {
  private log = new Logger("AuthService");
  constructor(private readonly db: DbService, private readonly mailer: Mailer, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  private async audit(c: Queryable, action: string, userId: string | null, ip: string | null, meta: Record<string, unknown> = {}) {
    await c.query("INSERT INTO audit_events(actor_id, action, subject_type, subject_id, ip, metadata) VALUES ($1::uuid,$2,'user',$1::uuid::text,$3::inet,$4::jsonb)",
      [userId, action, ip, JSON.stringify(meta)]);
  }

  /** Always answers the same way whether or not the email already exists (no account enumeration). */
  async register(body: unknown, ip: string | undefined): Promise<void> {
    const b = (body ?? {}) as Record<string, unknown>;
    const email = parseEmail(b.email), name = parseDisplayName(b.name), locale = parseLocale(b.locale);
    const password = parsePassword(b.password, email.ok ? email.value : undefined);
    const fields: Record<string, string> = {};
    if (!email.ok) fields.email = email.error;
    if (!password.ok) fields.password = password.error;
    if (!name.ok) fields.name = name.error;
    if (!locale.ok) fields.locale = locale.error;
    if (!email.ok || !password.ok || !name.ok || !locale.ok) throw new BadRequestException({ error: "validation_failed", fields });

    const passwordHash = await hashPassword(password.value);       // always hash: equal timing for new and existing emails
    const tok = newToken();
    const created = await this.db.tx(async (c) => {
      const u = await c.query("INSERT INTO users(email, password_hash, display_name, locale, role, status) VALUES ($1,$2,$3,$4,'customer','pending') ON CONFLICT (email) DO NOTHING RETURNING id",
        [email.value, passwordHash, name.value, locale.value]);
      const userId: string | undefined = u.rows[0]?.id;
      if (!userId) return false;
      const org = await c.query("INSERT INTO organizations(name, owner_user_id) VALUES ($1,$2) RETURNING id", [name.value || email.value, userId]);
      await c.query("INSERT INTO memberships(organization_id, user_id, role) VALUES ($1,$2,'owner')", [org.rows[0].id, userId]);
      await c.query("INSERT INTO wallets(organization_id) VALUES ($1)", [org.rows[0].id]);
      await c.query("INSERT INTO email_tokens(user_id, purpose, token_hash, expires_at) VALUES ($1,'verify_email',$2, now() + interval '24 hours')", [userId, tok.hash]);
      await this.audit(c, "auth.register", userId, cleanIp(ip));
      return true;
    });
    if (created) {
      try { await this.mailer.sendVerification(email.value, `${this.cfg.appBaseUrl}/verify-email?token=${tok.token}`); }
      catch (e) { this.log.error(`verification mail failed: ${e instanceof Error ? e.message : "unknown"}`); }
    }
  }

  async verifyEmail(token: unknown): Promise<void> {
    if (!isTokenShape(token)) throw new BadRequestException({ error: "invalid_or_expired_token" });
    await this.db.tx(async (c) => {
      const t = await c.query("UPDATE email_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > now() RETURNING user_id", [sha256(token)]);
      const userId: string | undefined = t.rows[0]?.user_id;
      if (!userId) throw new BadRequestException({ error: "invalid_or_expired_token" });
      await c.query("UPDATE users SET email_verified_at = now(), status = 'active' WHERE id = $1 AND status = 'pending'", [userId]);
      await this.audit(c, "auth.email_verified", userId, null);
    });
  }

  async login(body: unknown, ip: string | undefined, userAgent: string | undefined, issueToken: boolean) {
    const b = (body ?? {}) as Record<string, unknown>;
    const email = parseEmail(b.email);
    const password = typeof b.password === "string" && b.password.length <= 128 ? b.password : null;
    const addr = cleanIp(ip);
    const invalid = () => new UnauthorizedException({ error: "invalid_credentials" });
    if (!email.ok || password === null) { await burnPasswordTime(password ?? "x"); throw invalid(); }

    const r = await this.db.pool.query("SELECT id, email, display_name, role, status, password_hash, locked_until FROM users WHERE email = $1", [email.value]);
    const u = r.rows[0];
    const fail = async (reason: string, userId: string | null) => {
      await this.db.pool.query("INSERT INTO login_history(user_id, email_attempted, success, failure_reason, ip, user_agent) VALUES ($1,$2,false,$3,$4,$5)",
        [userId, email.value, reason, addr, userAgent?.slice(0, 300) ?? null]);
    };
    if (!u || !u.password_hash) { await burnPasswordTime(password); await fail("unknown_or_no_password", u?.id ?? null); throw invalid(); }
    if (u.locked_until && new Date(u.locked_until) > new Date()) { await fail("locked", u.id); throw invalid(); }   // same answer as a wrong password

    if (!(await verifyPassword(u.password_hash, password))) {
      await this.db.pool.query(
        `UPDATE users SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
                          locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
         WHERE id = $1`, [u.id, MAX_FAILED_LOGINS, String(LOCK_MINUTES)]);
      await fail("bad_password", u.id);
      throw invalid();
    }
    if (u.status === "pending") throw new ForbiddenException({ error: "email_not_verified" });
    if (u.status !== "active") throw new ForbiddenException({ error: "account_disabled" });
    // Staff and Super Admin require MFA, which is not implemented yet: refuse rather than create a weaker session.
    if (u.role !== "customer") throw new ForbiddenException({ error: "mfa_setup_required" });

    const tok = newToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await this.db.tx(async (c) => {
      await c.query("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1", [u.id]);
      await c.query("INSERT INTO sessions(user_id, token_hash, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5)", [u.id, tok.hash, addr, userAgent?.slice(0, 300) ?? null, expires]);
      await c.query("INSERT INTO login_history(user_id, email_attempted, success, ip, user_agent) VALUES ($1,$2,true,$3,$4)", [u.id, email.value, addr, userAgent?.slice(0, 300) ?? null]);
      await this.audit(c, "auth.login", u.id, addr);
    });
    return { token: tok.token, expires, issueToken, user: { id: u.id as string, email: u.email as string, name: u.display_name as string, role: u.role as string } };
  }

  async authenticate(token: string): Promise<AuthContext | null> {
    if (!isTokenShape(token)) return null;
    const r = await this.db.pool.query(
      `SELECT s.id AS session_id, s.mfa_verified, u.id AS user_id, u.email, u.display_name, u.role,
              (SELECT organization_id FROM memberships m WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1) AS organization_id
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`, [sha256(token)]);
    const row = r.rows[0];
    if (!row) return null;
    await this.db.pool.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'", [row.session_id]);
    return { userId: row.user_id, sessionId: row.session_id, email: row.email, displayName: row.display_name, role: row.role, organizationId: row.organization_id ?? null, mfaVerified: row.mfa_verified };
  }

  async logout(ctx: AuthContext, ip: string | undefined) {
    await this.db.pool.query("UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout' WHERE id = $1 AND revoked_at IS NULL", [ctx.sessionId]);
    await this.audit(this.db.pool, "auth.logout", ctx.userId, cleanIp(ip));
  }

  async listSessions(ctx: AuthContext) {
    const r = await this.db.pool.query(
      "SELECT id, ip::text AS ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC", [ctx.userId]);
    return r.rows.map((s) => ({ id: s.id as string, ip: s.ip as string | null, userAgent: s.user_agent as string | null, createdAt: s.created_at, lastSeenAt: s.last_seen_at, expiresAt: s.expires_at, current: s.id === ctx.sessionId }));
  }

  /** Scoped by user_id in the query itself: another user's session id behaves exactly like a nonexistent one (no IDOR). */
  async revokeSession(ctx: AuthContext, sessionId: string, ip: string | undefined) {
    if (!isUuid(sessionId)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query("UPDATE sessions SET revoked_at = now(), revoked_reason = 'user_revoked' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id", [sessionId, ctx.userId]);
    if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
    await this.audit(this.db.pool, "auth.session_revoked", ctx.userId, cleanIp(ip), { sessionId });
  }
}

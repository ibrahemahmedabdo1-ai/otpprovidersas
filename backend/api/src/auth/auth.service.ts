import { isIP } from "node:net";
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DbService } from "../db.service";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { Mailer } from "./mailer";
import { burnPasswordTime, hashPassword, verifyPassword } from "./password";
import { isTokenShape, isUuid, parseDisplayName, parseEmail, parseLocale, parsePassword } from "./validators";
import { newToken, sha256 } from "./tokens";
import { canOpenPanel } from "./panels";

/** Anything with a query(text, values) method: a pool or a transaction client. */
type Queryable = { query(text: string, values?: unknown[]): Promise<unknown> };

export const SESSION_DAYS = 30;
/** Staff: a password-only session lives 15 minutes (just long enough to finish MFA); after MFA it lives 12 hours. */
export const MFA_PENDING_MINUTES = 15;
export const STAFF_SESSION_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface AuthContext { userId: string; sessionId: string; email: string; displayName: string; role: string; organizationId: string | null; mfaVerified: boolean; mfaPending: boolean }

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


  /**
   * Password recovery is not self-service. Only an Admin or Super Admin (never Support) can send a customer a one-time
   * reset link (valid 1 hour). Staff passwords are never reset by e-mail. The action is audited under the acting admin.
   */
  async adminSendCustomerReset(ctx: AuthContext, userId: string, ip: string | undefined): Promise<{ ok: true }> {
    if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
    if (!isUuid(userId)) throw new NotFoundException({ error: "not_found" });
    const tok = newToken();
    const email = await this.db.tx(async (c) => {
      const u = await c.query("SELECT id, email FROM users WHERE id = $1 AND role = 'customer' AND status = 'active'", [userId]);
      if (!u.rows[0]) throw new NotFoundException({ error: "not_found" });
      await c.query("UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'reset_password' AND used_at IS NULL", [userId]);
      await c.query("INSERT INTO email_tokens(user_id, purpose, token_hash, expires_at) VALUES ($1,'reset_password',$2, now() + interval '1 hour')", [userId, tok.hash]);
      await c.query("INSERT INTO audit_events(actor_id, action, subject_type, subject_id, ip, metadata) VALUES ($1::uuid,'admin.customer_password_reset_sent','user',$2::text,$3::inet,'{}'::jsonb)", [ctx.userId, userId, cleanIp(ip)]);
      return u.rows[0].email as string;
    });
    try { await this.mailer.sendPasswordReset(email, `${this.cfg.appBaseUrl}/reset-password?token=${tok.token}`); }
    catch (e) {
      this.log.error(`password reset mail failed: ${e instanceof Error ? e.message : "unknown"}`);
      throw new ServiceUnavailableException({ error: "mail_failed" });
    }
    return { ok: true };
  }

  /** Single sign-in: a fully authenticated session (MFA done where required) gets a 30 s one-time code for one panel. */
  async ssoStart(ctx: AuthContext, body: unknown, ip: string | undefined): Promise<{ code: string }> {
    const target = (body as { target?: unknown } | null)?.target;
    if (!canOpenPanel(ctx.role, target)) throw new ForbiddenException({ error: "forbidden" });
    const tok = newToken();
    await this.db.tx(async (c) => {
      await c.query("DELETE FROM sso_handoffs WHERE expires_at < now() - interval '1 hour'");
      await c.query("INSERT INTO sso_handoffs(user_id, code_hash, target, expires_at) VALUES ($1,$2,$3, now() + interval '30 seconds')", [ctx.userId, tok.hash, target]);
      await this.audit(c, "auth.sso_started", ctx.userId, cleanIp(ip), { target });
    });
    return { code: tok.token };
  }

  /** Called by the panel itself (same-origin proxy), so the session cookie is set on the panel's own origin. */
  async ssoRedeem(body: unknown, ip: string | undefined, userAgent: string | undefined): Promise<{ token: string; expires: Date; user: { id: string; email: string; name: string; role: string } }> {
    const code = (body as { code?: unknown } | null)?.code;
    if (!isTokenShape(code)) throw new BadRequestException({ error: "invalid_or_expired_code" });
    const tok = newToken();
    const addr = cleanIp(ip);
    return this.db.tx(async (c) => {
      const h = await c.query("UPDATE sso_handoffs SET used_at = now() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id, target", [sha256(code)]);
      const row = h.rows[0];
      if (!row) throw new BadRequestException({ error: "invalid_or_expired_code" });
      const u = await c.query("SELECT id, email, display_name, role FROM users WHERE id = $1 AND status = 'active'", [row.user_id]);
      const user = u.rows[0];
      if (!user || !canOpenPanel(user.role as string, row.target)) throw new BadRequestException({ error: "invalid_or_expired_code" });
      const hours = user.role === "customer" ? SESSION_DAYS * 24 : STAFF_SESSION_HOURS;
      const expires = new Date(Date.now() + hours * 3_600_000);
      await c.query("INSERT INTO sessions(user_id, token_hash, ip, user_agent, mfa_verified, expires_at) VALUES ($1,$2,$3,$4,true,$5)", [user.id, tok.hash, addr, userAgent?.slice(0, 300) ?? null, expires]);
      await this.audit(c, "auth.sso_redeemed", user.id as string, addr, { target: row.target });
      return { token: tok.token, expires, user: { id: user.id as string, email: user.email as string, name: user.display_name as string, role: user.role as string } };
    });
  }

  /** One-time token. Success signs the account out everywhere and clears any lockout. */
  async resetPassword(body: unknown, ip: string | undefined): Promise<void> {
    const b = (body ?? {}) as Record<string, unknown>;
    if (!isTokenShape(b.token)) throw new BadRequestException({ error: "invalid_or_expired_token" });
    const peek = await this.db.pool.query("SELECT u.email FROM email_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.purpose = 'reset_password' AND t.used_at IS NULL AND t.expires_at > now()", [sha256(b.token)]);
    if (!peek.rows[0]) throw new BadRequestException({ error: "invalid_or_expired_token" });
    const password = parsePassword(b.password, peek.rows[0].email as string);
    if (!password.ok) throw new BadRequestException({ error: "validation_failed", fields: { password: password.error } });
    const passwordHash = await hashPassword(password.value);
    await this.db.tx(async (c) => {
      const t = await c.query("UPDATE email_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = 'reset_password' AND used_at IS NULL AND expires_at > now() RETURNING user_id", [sha256(b.token as string)]);
      const userId: string | undefined = t.rows[0]?.user_id;
      if (!userId) throw new BadRequestException({ error: "invalid_or_expired_token" });
      await c.query("UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1", [userId, passwordHash]);
      await c.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
      await this.audit(c, "auth.password_reset", userId, cleanIp(ip));
    });
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
    const f = await this.db.pool.query("SELECT EXISTS (SELECT 1 FROM mfa_factors WHERE user_id = $1::uuid AND type = 'totp' AND confirmed_at IS NOT NULL) AS enrolled", [u.id]);
    const enrolled: boolean = f.rows[0].enrolled;
    // Staff always need MFA; a customer who turned it on needs it too. Until it is completed the session is "pending"
    // and the guard only lets it reach the MFA endpoints.
    const mfaRequired = u.role !== "customer" || enrolled;

    const tok = newToken();
    const expires = new Date(Date.now() + (mfaRequired ? MFA_PENDING_MINUTES * 60_000 : SESSION_DAYS * 86_400_000));
    await this.db.tx(async (c) => {
      await c.query("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1", [u.id]);
      await c.query("INSERT INTO sessions(user_id, token_hash, ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5)", [u.id, tok.hash, addr, userAgent?.slice(0, 300) ?? null, expires]);
      await c.query("INSERT INTO login_history(user_id, email_attempted, success, ip, user_agent) VALUES ($1,$2,true,$3,$4)", [u.id, email.value, addr, userAgent?.slice(0, 300) ?? null]);
      await this.audit(c, mfaRequired ? "auth.login_password_ok_mfa_pending" : "auth.login", u.id, addr);
    });
    const mfa = mfaRequired ? { required: true, enrolled } : undefined;
    return { token: tok.token, expires, issueToken, mfa, user: { id: u.id as string, email: u.email as string, name: u.display_name as string, role: u.role as string } };
  }

  async authenticate(token: string): Promise<AuthContext | null> {
    if (!isTokenShape(token)) return null;
    const r = await this.db.pool.query(
      `SELECT s.id AS session_id, s.mfa_verified, (u.role <> 'customer' OR EXISTS (SELECT 1 FROM mfa_factors f WHERE f.user_id = u.id AND f.type = 'totp' AND f.confirmed_at IS NOT NULL)) AS mfa_required, u.id AS user_id, u.email, u.display_name, u.role,
              (SELECT organization_id FROM memberships m WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1) AS organization_id
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`, [sha256(token)]);
    const row = r.rows[0];
    if (!row) return null;
    await this.db.pool.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 minute'", [row.session_id]);
    return { userId: row.user_id, sessionId: row.session_id, email: row.email, displayName: row.display_name, role: row.role, organizationId: row.organization_id ?? null, mfaVerified: row.mfa_verified, mfaPending: row.mfa_required && !row.mfa_verified };
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

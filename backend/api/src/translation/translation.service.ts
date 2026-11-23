import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { RateLimiter } from "../common/rate-limit";
import { blockedReason, isLang, parseSettings, resolveTargetLang, withinDailyLimit, LANGS, type Lang, type SkipReason, type TranslationSettings } from "./core";
import { ProviderError, providerFromEnv, type TranslationProvider } from "./providers";
import { hasTranslatableText, restore, segment, toMarked } from "./protect";

export const TRANSLATION_PROVIDER = Symbol("TRANSLATION_PROVIDER");
const MAX_PER_CALL = 20;
const MAX_CHARS = 5000;
const bad = (fields: Record<string, string>): never => { throw new BadRequestException({ error: "validation_failed", fields }); };

/**
 * Support auto-translation. Original text is never changed; translations live in message_translations (one per message and language, so nothing is translated twice).
 * URLs, e-mails, ids, keys and every number are masked before text leaves the server and verified on the way back. The provider key is read from the server
 * environment only and is never returned by any endpoint. With no provider configured every call reports "not_configured" instead of inventing a translation.
 */
@Injectable()
export class TranslationService {
  private readonly provider: TranslationProvider | null;
  private readonly limiter = new RateLimiter(60, 60_000);
  constructor(private readonly db: DbService, @Optional() @Inject(TRANSLATION_PROVIDER) injected?: TranslationProvider | null) {
    this.provider = injected !== undefined ? injected : providerFromEnv(process.env);
  }

  // ------------------------------------------------------------------ helpers
  private staff(ctx: AuthContext) { if (!["support_staff", "admin_staff", "super_admin"].includes(ctx.role)) throw new ForbiddenException({ error: "forbidden" }); }
  private adminOnly(ctx: AuthContext) { if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" }); }
  private id(v: string) { if (!isUuid(v)) throw new NotFoundException({ error: "not_found" }); return v; }

  async settings(): Promise<TranslationSettings> {
    const r = await this.db.pool.query("SELECT value FROM system_settings WHERE key = 'translation'");
    return parseSettings(r.rows[0]?.value);
  }
  private async agent(userId: string): Promise<{ allowed: boolean; enabled: boolean; language: Lang }> {
    const r = await this.db.pool.query(
      `SELECT COALESCE(p.allowed, true) AS allowed, COALESCE(p.enabled, true) AS enabled, COALESCE(p.language, u.locale) AS language FROM users u LEFT JOIN user_translation_prefs p ON p.user_id = u.id WHERE u.id = $1::uuid`, [userId]);
    const x = r.rows[0];
    return { allowed: x?.allowed ?? true, enabled: x?.enabled ?? true, language: isLang(x?.language) ? x.language : "en" };
  }
  private async usedToday(): Promise<number> {
    const r = await this.db.pool.query("SELECT COALESCE(SUM(chars), 0)::int AS n FROM translation_events WHERE status = 'ok' AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')");
    return r.rows[0]?.n ?? 0;
  }
  private async log(e: { messageId: string | null; ticketId: string | null; target: Lang | null; status: "ok" | "error" | "skipped"; code?: string; chars?: number; actor: string | null }) {
    await this.db.pool.query(
      "INSERT INTO translation_events(message_id, ticket_id, target_lang, status, error_code, chars, provider, actor_id) VALUES ($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::int,$7::text,$8::uuid)",
      [e.messageId, e.ticketId, e.target, e.status, e.code ?? null, e.chars ?? 0, this.provider?.key ?? null, e.actor]).catch(() => undefined);
  }

  /** Translates one piece of text. Returns null (and logs the reason) when it must not be shown. Never throws for provider problems. */
  private async run(text: string, target: Lang, meta: { messageId: string | null; ticketId: string | null; actor: string }): Promise<{ text: string; detected: Lang | null } | { error: string }> {
    const p = this.provider;
    if (!p) return { error: "not_configured" };
    const segs = segment(text);
    if (!hasTranslatableText(segs)) return { error: "nothing_to_translate" };
    const used = await this.usedToday(); const limit = (await this.settings()).dailyCharLimit;
    if (!withinDailyLimit(used, text.length, limit)) { await this.log({ ...meta, target, status: "error", code: "daily_limit_reached", actor: meta.actor }); return { error: "daily_limit_reached" }; }
    const { marked, keeps } = toMarked(segs, p.marks.esc, p.marks.mark);
    let lastErr = "unknown";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await p.translate(marked, target);
        const out = restore(r.text, keeps, p.marks.re, p.marks.unesc);
        if (out === null) { lastErr = "placeholder_mismatch"; break; }      // never show a result that altered a code, link or number
        await this.log({ ...meta, target, status: "ok", chars: text.length, actor: meta.actor });
        return { text: out, detected: r.detected };
      } catch (e) {
        lastErr = e instanceof ProviderError ? e.code : "unknown";
        const retryable = lastErr === "timeout" || lastErr === "network" || /^provider_http_5/.test(lastErr);
        if (!retryable) break;
        await new Promise((res) => setTimeout(res, 400));
      }
    }
    await this.log({ ...meta, target, status: "error", code: lastErr, actor: meta.actor });
    return { error: lastErr };
  }

  // -------------------------------------------------------------------- staff
  async status(ctx: AuthContext) {
    this.staff(ctx);
    const [s, a] = await Promise.all([this.settings(), this.agent(ctx.userId)]);
    const configured = this.provider !== null;
    const reason = blockedReason({ systemEnabled: s.enabled, configured, agentAllowed: a.allowed, agentEnabled: a.enabled, ticketEnabled: true, enabledLangs: s.languages, target: a.language });
    return { configured, systemEnabled: s.enabled, languages: s.languages, agent: a, available: reason === null, unavailableReason: reason };
  }

  async setPrefs(ctx: AuthContext, body: unknown, ip: string | undefined) {
    this.staff(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    if ("enabled" in b && typeof b.enabled !== "boolean") bad({ enabled: "true or false" });
    if ("language" in b && b.language !== null && !isLang(b.language)) bad({ language: LANGS.join(", ") });
    const cur = await this.agent(ctx.userId);
    if (!cur.allowed) throw new ForbiddenException({ error: "translation_not_allowed" });
    await this.db.tx(async (c) => {
      await c.query(
        `INSERT INTO user_translation_prefs(user_id, enabled, language) VALUES ($1::uuid, COALESCE($2::boolean, true), $3::text)
         ON CONFLICT (user_id) DO UPDATE SET enabled = COALESCE($2::boolean, user_translation_prefs.enabled),
           language = CASE WHEN $4::boolean THEN $3::text ELSE user_translation_prefs.language END, updated_at = now()`,
        [ctx.userId, "enabled" in b ? b.enabled : null, "language" in b ? b.language : null, "language" in b]);
      await writeAudit(c, { actorId: ctx.userId, action: "translation.agent_prefs", subjectType: "user", subjectId: ctx.userId, ip: cleanIp(ip), meta: { enabled: b.enabled ?? null, language: b.language ?? null } });
    });
    return this.status(ctx);
  }

  async setTicket(ctx: AuthContext, ticketId: string, body: unknown, ip: string | undefined) {
    this.staff(ctx);
    const id = this.id(ticketId);
    const b = (body ?? {}) as Record<string, unknown>;
    if ("enabled" in b && typeof b.enabled !== "boolean") bad({ enabled: "true or false" });
    if ("customerLanguage" in b && b.customerLanguage !== null && !isLang(b.customerLanguage)) bad({ customerLanguage: LANGS.join(", ") });
    return this.db.tx(async (c) => {
      const t = await c.query("SELECT id FROM tickets WHERE id = $1::uuid FOR UPDATE", [id]);
      if (!t.rows[0]) throw new NotFoundException({ error: "not_found" });
      if ("enabled" in b) await c.query("UPDATE tickets SET translation_enabled = $2::boolean WHERE id = $1::uuid", [id, b.enabled]);
      if ("customerLanguage" in b) {
        const l = b.customerLanguage as Lang | null;
        await c.query("UPDATE tickets SET customer_language = $2::text, customer_language_source = CASE WHEN $2::text IS NULL THEN NULL ELSE 'override' END WHERE id = $1::uuid", [id, l]);
      }
      await writeAudit(c, { actorId: ctx.userId, action: "translation.ticket_settings", subjectType: "ticket", subjectId: id, ip: cleanIp(ip), meta: { enabled: b.enabled ?? null, customerLanguage: b.customerLanguage ?? null } });
      return { ok: true };
    });
  }

  private async gate(ctx: AuthContext, ticketId: string): Promise<{ reason: SkipReason | null; agentLang: Lang; ticket: { enabled: boolean; override: Lang | null; detected: Lang | null; requesterLocale: Lang } }> {
    const [s, a, t] = await Promise.all([
      this.settings(), this.agent(ctx.userId),
      this.db.pool.query("SELECT t.translation_enabled, t.customer_language, t.customer_language_source, u.locale FROM tickets t JOIN users u ON u.id = t.created_by WHERE t.id = $1::uuid", [ticketId]),
    ]);
    const x = t.rows[0];
    if (!x) throw new NotFoundException({ error: "not_found" });
    const src = x.customer_language_source as string | null;
    const lang = isLang(x.customer_language) ? (x.customer_language as Lang) : null;
    const ticket = { enabled: x.translation_enabled as boolean, override: src === "override" ? lang : null, detected: src === "detected" ? lang : null, requesterLocale: (isLang(x.locale) ? x.locale : "en") as Lang };
    const reason = blockedReason({ systemEnabled: s.enabled, configured: this.provider !== null, agentAllowed: a.allowed, agentEnabled: a.enabled, ticketEnabled: ticket.enabled, enabledLangs: s.languages, target: a.language });
    return { reason, agentLang: a.language, ticket };
  }

  /** Translates the customer's untranslated public messages into the agent's language. Idempotent: already translated messages are skipped, never re-sent. */
  async translateInbound(ctx: AuthContext, ticketId: string) {
    this.staff(ctx);
    const id = this.id(ticketId);
    const rl = this.limiter.take(ctx.userId);
    if (!rl.allowed) throw new ConflictException({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    const g = await this.gate(ctx, id);
    if (g.reason) return { translated: 0, skipped: g.reason, errors: [] as string[] };
    const rows = await this.db.pool.query(
      `SELECT m.id, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN tickets t ON t.id = c.ticket_id
       WHERE c.ticket_id = $1::uuid AND m.internal = false AND m.author_id = t.created_by AND length(m.body) <= ${MAX_CHARS}
         AND NOT EXISTS (SELECT 1 FROM message_translations x WHERE x.message_id = m.id AND x.target_lang = $2::text)
       ORDER BY m.created_at DESC LIMIT ${MAX_PER_CALL}`, [id, g.agentLang]);
    let translated = 0; const errors: string[] = [];
    for (const m of rows.rows.reverse()) {
      const r = await this.run(m.body as string, g.agentLang, { messageId: m.id as string, ticketId: id, actor: ctx.userId });
      if ("error" in r) {
        if (r.error === "nothing_to_translate") await this.db.pool.query("INSERT INTO message_translations(message_id, target_lang, body, provider) VALUES ($1::uuid,$2::text,$3::text,'unchanged') ON CONFLICT DO NOTHING", [m.id, g.agentLang, m.body]);
        else errors.push(r.error);
        continue;
      }
      const same = r.detected === g.agentLang;      // already in the agent's language: store it unchanged so it is not sent again
      await this.db.pool.query("INSERT INTO message_translations(message_id, target_lang, source_lang, body, provider) VALUES ($1::uuid,$2::text,$3::text,$4::text,$5::text) ON CONFLICT DO NOTHING",
        [m.id, g.agentLang, r.detected, same ? (m.body as string) : r.text, same ? "unchanged" : this.provider!.key]);
      if (r.detected && !g.ticket.override) await this.db.pool.query("UPDATE tickets SET customer_language = $2::text, customer_language_source = 'detected' WHERE id = $1::uuid AND (customer_language_source IS DISTINCT FROM 'override')", [id, r.detected]);
      translated++;
    }
    return { translated, skipped: null, errors: [...new Set(errors)] };
  }

  /** Sends a public staff reply, then stores its translation into the customer's language. The reply itself is always saved first; translation failure never blocks it. */
  async translateOutbound(ctx: AuthContext, ticketId: string, messageId: string, body: string) {
    const id = this.id(ticketId);
    const g = await this.gate(ctx, id);
    if (g.reason) return { translated: false, skipped: g.reason };
    const target = resolveTargetLang({ override: g.ticket.override, detected: g.ticket.detected }, g.ticket.requesterLocale);
    if (target === g.agentLang) return { translated: false, skipped: "same_language" };
    const r = await this.run(body, target, { messageId, ticketId: id, actor: ctx.userId });
    if ("error" in r) return { translated: false, skipped: r.error };
    await this.db.pool.query("INSERT INTO message_translations(message_id, target_lang, source_lang, body, provider) VALUES ($1::uuid,$2::text,$3::text,$4::text,$5::text) ON CONFLICT DO NOTHING", [messageId, target, r.detected, r.text, this.provider!.key]);
    return { translated: true, skipped: null, targetLanguage: target };
  }

  // -------------------------------------------------------------------- admin
  async adminOverview(ctx: AuthContext) {
    this.adminOnly(ctx);
    const [s, ev, errs, agents, today] = await Promise.all([
      this.settings(),
      this.db.pool.query("SELECT count(*) FILTER (WHERE status='ok')::int AS ok, count(*) FILTER (WHERE status='error')::int AS errors, COALESCE(SUM(chars) FILTER (WHERE status='ok'), 0)::int AS chars FROM translation_events WHERE created_at >= now() - interval '30 days'"),
      this.db.pool.query("SELECT error_code, count(*)::int AS n, max(created_at) AS last_at FROM translation_events WHERE status='error' AND created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
      this.db.pool.query("SELECT u.id, u.email, u.role, COALESCE(p.allowed, true) AS allowed, COALESCE(p.enabled, true) AS enabled, COALESCE(p.language, u.locale) AS language FROM users u LEFT JOIN user_translation_prefs p ON p.user_id = u.id WHERE u.role IN ('support_staff','admin_staff','super_admin') AND u.status = 'active' ORDER BY u.email"),
      this.usedToday(),
    ]);
    return {
      configured: this.provider !== null, provider: this.provider?.key ?? null,
      note: this.provider ? null : "No translation provider is configured on the server. Set TRANSLATION_PROVIDER (deepl or google) and TRANSLATION_API_KEY in the API environment. No translation is performed until then.",
      settings: s, usedTodayChars: today,
      last30Days: { translations: ev.rows[0]?.ok ?? 0, errors: ev.rows[0]?.errors ?? 0, chars: ev.rows[0]?.chars ?? 0 },
      errorBreakdown: errs.rows.map((e) => ({ code: e.error_code as string, count: e.n as number, lastAt: e.last_at })),
      agents: agents.rows.map((a) => ({ id: a.id as string, email: a.email as string, role: a.role as string, allowed: a.allowed as boolean, enabled: a.enabled as boolean, language: a.language as string })),
    };
  }

  async adminUpdate(ctx: AuthContext, body: unknown, ip: string | undefined) {
    this.adminOnly(ctx);
    const b = (body ?? {}) as Record<string, unknown>;
    const cur = await this.settings();
    const next = { ...cur };
    if ("enabled" in b) {
      if (typeof b.enabled !== "boolean") bad({ enabled: "true or false" });
      if (b.enabled === true) {
        if (!this.provider) throw new ServiceUnavailableException({ error: "translation_not_configured" });
        if (b.confirmDataSharing !== true) bad({ confirmDataSharing: "Confirm that ticket text will be sent to the translation provider" });
      }
      next.enabled = b.enabled as boolean;
    }
    if ("languages" in b) {
      if (!Array.isArray(b.languages) || !b.languages.length || !b.languages.every(isLang)) bad({ languages: LANGS.join(", ") });
      next.languages = [...new Set(b.languages as Lang[])];
    }
    if ("dailyCharLimit" in b) {
      const n = Number(b.dailyCharLimit);
      if (!Number.isInteger(n) || n < 1000 || n > 50_000_000) bad({ dailyCharLimit: "1000 to 50000000" });
      next.dailyCharLimit = n;
    }
    await this.db.tx(async (c) => {
      await c.query("INSERT INTO system_settings(key, value, updated_by) VALUES ('translation', $1::jsonb, $2::uuid) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_by = $2::uuid, updated_at = now()", [JSON.stringify(next), ctx.userId]);
      await writeAudit(c, { actorId: ctx.userId, action: "translation.settings", subjectType: "system_setting", subjectId: "translation", ip: cleanIp(ip), meta: { enabled: next.enabled, languages: next.languages, dailyCharLimit: next.dailyCharLimit } });
    });
    return this.adminOverview(ctx);
  }

  async adminAgent(ctx: AuthContext, userId: string, body: unknown, ip: string | undefined) {
    this.adminOnly(ctx);
    const id = this.id(userId);
    const allowed = (body as { allowed?: unknown } | null)?.allowed;
    if (typeof allowed !== "boolean") bad({ allowed: "true or false" });
    await this.db.tx(async (c) => {
      const u = await c.query("SELECT id FROM users WHERE id = $1::uuid AND role IN ('support_staff','admin_staff','super_admin')", [id]);
      if (!u.rows[0]) throw new NotFoundException({ error: "not_found" });
      await c.query("INSERT INTO user_translation_prefs(user_id, allowed) VALUES ($1::uuid, $2::boolean) ON CONFLICT (user_id) DO UPDATE SET allowed = $2::boolean, updated_at = now()", [id, allowed]);
      await writeAudit(c, { actorId: ctx.userId, action: "translation.agent_permission", subjectType: "user", subjectId: id, ip: cleanIp(ip), meta: { allowed } });
    });
    return { ok: true };
  }

  /** Real provider check with a fixed harmless phrase. Reports success or a short error code; never the key. */
  async adminTest(ctx: AuthContext) {
    this.adminOnly(ctx);
    if (!this.provider) return { ok: false, error: "not_configured" };
    const t0 = Date.now();
    const r = await this.run("Hello, this is a connection test.", "es", { messageId: null, ticketId: null, actor: ctx.userId });
    return "error" in r ? { ok: false, error: r.error, ms: Date.now() - t0 } : { ok: true, ms: Date.now() - t0 };
  }
}

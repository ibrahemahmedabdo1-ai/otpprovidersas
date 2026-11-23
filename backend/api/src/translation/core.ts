export const LANGS = ["ar", "en", "ru", "es", "de", "zh"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** Maps a provider's language code (DEEPL "EN-US", Google "zh-CN", ...) to one of our six, or null if it is none of them. */
export function normalizeLang(code: unknown): Lang | null {
  if (typeof code !== "string") return null;
  const base = code.toLowerCase().split(/[-_]/)[0] ?? "";
  return isLang(base) ? base : null;
}

/** Language to translate a staff reply into: an agent's explicit override wins, then what was detected, then the customer's account language. */
export function resolveTargetLang(ticket: { override: Lang | null; detected: Lang | null }, accountLocale: Lang): Lang {
  return ticket.override ?? ticket.detected ?? accountLocale;
}

export type SkipReason = "system_disabled" | "not_configured" | "agent_not_allowed" | "agent_disabled" | "conversation_disabled" | "language_not_enabled";

/** Single place that decides whether translation may run. Returns null when it may. */
export function blockedReason(x: { systemEnabled: boolean; configured: boolean; agentAllowed: boolean; agentEnabled: boolean; ticketEnabled: boolean; enabledLangs: readonly Lang[]; target: Lang }): SkipReason | null {
  if (!x.systemEnabled) return "system_disabled";
  if (!x.configured) return "not_configured";
  if (!x.agentAllowed) return "agent_not_allowed";
  if (!x.agentEnabled) return "agent_disabled";
  if (!x.ticketEnabled) return "conversation_disabled";
  if (!x.enabledLangs.includes(x.target)) return "language_not_enabled";
  return null;
}

export const withinDailyLimit = (usedToday: number, adding: number, limit: number): boolean => usedToday + adding <= limit;

export type TranslationSettings = { enabled: boolean; languages: Lang[]; dailyCharLimit: number };
export const DEFAULT_SETTINGS: TranslationSettings = { enabled: false, languages: [...LANGS], dailyCharLimit: 200_000 };

/** Reads the stored JSON defensively: unknown or malformed fields fall back to safe defaults (disabled). */
export function parseSettings(raw: unknown): TranslationSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const langs = Array.isArray(o.languages) ? o.languages.filter(isLang) : [];
  const limit = Number(o.dailyCharLimit);
  return {
    enabled: o.enabled === true,
    languages: langs.length ? [...new Set(langs)] : [...LANGS],
    dailyCharLimit: Number.isInteger(limit) && limit >= 1000 && limit <= 50_000_000 ? limit : DEFAULT_SETTINGS.dailyCharLimit,
  };
}

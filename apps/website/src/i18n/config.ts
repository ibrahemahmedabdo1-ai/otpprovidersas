export const LOCALES = ["en", "ar", "ru", "es", "de", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const RTL: ReadonlySet<Locale> = new Set<Locale>(["ar"]);
export const NATIVE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية", ru: "Русский", es: "Español", de: "Deutsch", zh: "中文" };
/** BCP 47 tags used for hreflang and og:locale. */
export const HREFLANG: Record<Locale, string> = { en: "en", ar: "ar", ru: "ru", es: "es", de: "de", zh: "zh" };
export const OG_LOCALE: Record<Locale, string> = { en: "en_US", ar: "ar_AR", ru: "ru_RU", es: "es_ES", de: "de_DE", zh: "zh_CN" };
export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

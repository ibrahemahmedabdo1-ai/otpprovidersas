import en, { type Dict } from "./en";
import ar from "./ar";
import ru from "./ru";
import es from "./es";
import de from "./de";
import zh from "./zh";

export const LOCALES = ["en", "ar", "ru", "es", "de", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "otp_locale";
export const NATIVE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية", ru: "Русский", es: "Español", de: "Deutsch", zh: "中文" };
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const dirOf = (l: Locale): "rtl" | "ltr" => (l === "ar" ? "rtl" : "ltr");

const dictionaries: Record<Locale, Dict> = { en, ar, ru, es, de, zh };
export const getDict = (l: Locale): Dict => dictionaries[l];
export type { Dict };

/** Replaces {name} placeholders. Unknown placeholders are left as they are. */
export function fmt(s: string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

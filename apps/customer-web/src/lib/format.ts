import type { Locale } from "../i18n";

export const fmtDate = (iso: string | null | undefined, locale: Locale, withTime = true): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
};
/** usd is the API's exact decimal string (e.g. "12.340000"); it is only displayed, never used in arithmetic. */
export const fmtUsd = (usd: string, locale: Locale): string => {
  const [i = "0", f = ""] = usd.split(".");
  const cents = (f + "00").slice(0, 2);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(BigInt(i.replace(/[^\d]/g, "") || "0"));
  const sep = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).format(0.1).charAt(1);
  return `$${whole}${sep}${cents}`;
};
/** 2-decimal positive USD amount, as text (no floats). */
export const validAmount = (s: string): boolean => /^\d{1,7}(\.\d{1,2})?$/.test(s.trim()) && Number(s) > 0;
export const validEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, dirOf, getDict, type Dict, type Locale } from "../i18n";
import { api, type Me } from "../lib/api";

export type Theme = "system" | "light" | "dark";
type Ctx = {
  locale: Locale; t: Dict; setLocale: (l: Locale) => void;
  theme: Theme; setTheme: (t: Theme) => void;
  user: Me | null | undefined; refresh: () => Promise<void>; signOut: () => Promise<void>;
  /** Test API key, memory only. Never written to cookies, localStorage or sessionStorage. */
  testKey: string; setTestKey: (k: string) => void;
};
const C = createContext<Ctx | null>(null);
export const useApp = (): Ctx => { const v = useContext(C); if (!v) throw new Error("Providers missing"); return v; };

export function Providers({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<Theme>("system");
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [testKey, setTestKey] = useState("");

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    document.documentElement.dir = dirOf(l);
  }, []);

  useEffect(() => {
    try { const s = localStorage.getItem("otp_theme"); if (s === "light" || s === "dark" || s === "system") setThemeState(s); } catch { /* storage unavailable */ }
  }, []);
  const setTheme = useCallback((th: Theme) => {
    setThemeState(th);
    try { localStorage.setItem("otp_theme", th); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    const r = await api<Me>("GET", "/v1/auth/me");
    setUser(r.ok && r.data ? r.data : null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await api("POST", "/v1/auth/logout");
    setTestKey("");
    setUser(null);
    window.location.assign("/login");
  }, []);

  const value = useMemo<Ctx>(() => ({ locale, t: getDict(locale), setLocale, theme, setTheme, user, refresh, signOut, testKey, setTestKey }),
    [locale, setLocale, theme, setTheme, user, refresh, signOut, testKey]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

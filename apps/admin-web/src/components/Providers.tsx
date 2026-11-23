"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Me } from "../lib/api";
import { dirOf, isLocale, translate, type Key, type Locale } from "../i18n";

type Ctx = {
  user: Me | null | undefined; refresh: () => Promise<void>; signOut: () => Promise<void>;
  locale: Locale; setLocale: (l: Locale) => Promise<boolean>; t: (key: Key, vars?: Record<string, string | number>) => string;
};
const C = createContext<Ctx | null>(null);
export const useApp = (): Ctx => { const v = useContext(C); if (!v) throw new Error("Providers missing"); return v; };

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [locale, setLocaleState] = useState<Locale>("en");
  const refresh = useCallback(async () => { const r = await api<Me>("GET", "/v1/auth/me"); setUser(r.ok && r.data ? r.data : null); }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // The saved language lives in the database (users.locale), so it follows the account across browsers and devices.
  const uid = user && !user.mfaPending ? user.id : null;
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void api<{ locale: string }>("GET", "/v1/preferences").then((r) => { if (live && r.ok && isLocale(r.data?.locale)) setLocaleState(r.data!.locale as Locale); });
    return () => { live = false; };
  }, [uid]);
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = dirOf(locale); }, [locale]);

  const setLocale = useCallback(async (l: Locale) => {
    const prev = locale;
    setLocaleState(l);                                   // switch instantly; no reload and no sign-out
    const r = await api("PUT", "/v1/preferences/locale", { locale: l });
    if (!r.ok) { setLocaleState(prev); return false; }
    return true;
  }, [locale]);
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  const signOut = useCallback(async () => { await api("POST", "/v1/auth/logout"); setUser(null); window.location.assign("/login"); }, []);
  const value = useMemo(() => ({ user, refresh, signOut, locale, setLocale, t }), [user, refresh, signOut, locale, setLocale, t]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

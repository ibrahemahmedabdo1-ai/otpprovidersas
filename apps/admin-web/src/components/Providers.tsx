"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Me } from "../lib/api";

type Ctx = { user: Me | null | undefined; refresh: () => Promise<void>; signOut: () => Promise<void> };
const C = createContext<Ctx | null>(null);
export const useApp = (): Ctx => { const v = useContext(C); if (!v) throw new Error("Providers missing"); return v; };

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const refresh = useCallback(async () => { const r = await api<Me>("GET", "/v1/auth/me"); setUser(r.ok && r.data ? r.data : null); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signOut = useCallback(async () => { await api("POST", "/v1/auth/logout"); setUser(null); window.location.assign("/login"); }, []);
  const value = useMemo(() => ({ user, refresh, signOut }), [user, refresh, signOut]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

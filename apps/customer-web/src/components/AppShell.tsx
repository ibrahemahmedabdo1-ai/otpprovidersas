"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./Providers";
import { Alert, Loading } from "./ui";
import { api } from "../lib/api";

const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL ?? "https://otpprovider-launch-admin.vercel.app").replace(/\/+$/, "");
const SUPPORT_URL = (process.env.NEXT_PUBLIC_SUPPORT_URL ?? "https://otpprovider-launch-support.vercel.app").replace(/\/+$/, "");
const SWITCH = {
  en: { admin: "Admin panel", support: "Support panel", failed: "Could not switch panel. Try again.", role: "Super Admin" },
  ar: { admin: "لوحة الأدمن", support: "لوحة الدعم", failed: "تعذّر التبديل. حاول مرة أخرى.", role: "سوبر أدمن" },
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { t, user, signOut } = useApp();
  const path = usePathname();
  const router = useRouter();
  const { locale } = useApp();
  const [switchErr, setSwitchErr] = useState(false);
  useEffect(() => { if (user === null) router.replace("/login"); else if (user?.mfaPending) router.replace("/mfa"); }, [user, router]);

  if (user === undefined || user === null || user.mfaPending) return <div className="center"><Loading /></div>;
  if ((user.role !== "customer" && user.role !== "super_admin")) {
    return (
      <div className="center"><div className="card narrow">
        <h1>{t.auth.notCustomer.title}</h1><Alert kind="warn">{t.auth.notCustomer.body}</Alert>
        <button className="btn" onClick={() => void signOut()}>{t.common.signOut}</button>
      </div></div>
    );
  }
  const nav: [string, string][] = [["/", t.nav.dashboard], ["/projects", t.nav.projects], ["/wallet", t.nav.wallet], ["/playground", t.nav.playground], ["/tickets", t.nav.tickets], ["/settings", t.nav.settings]];
  const sw = SWITCH[locale === "ar" ? "ar" : "en"];
  async function openPanel(target: "admin" | "support") {
    setSwitchErr(false);
    const r = await api<{ code: string }>("POST", "/v1/auth/sso/start", { body: { target } });
    if (!r.ok || !r.data?.code) { setSwitchErr(true); return; }
    window.location.assign(`${target === "admin" ? ADMIN_URL : SUPPORT_URL}/sso#code=${encodeURIComponent(r.data.code)}`);
  }
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return (
    <>
      <a className="skip" href="#main">{t.common.skip}</a>
      <div className="shell">
        <aside className="side">
          <Link href="/" className="brand" aria-label={t.common.brandHome}><img src="/icon.svg" alt="" width={28} height={28} /><span>{t.site.name}</span></Link>
          <nav aria-label={t.common.mainNav}>
            {nav.map(([h, l]) => <Link key={h} href={h} aria-current={active(h) ? "page" : undefined}>{l}</Link>)}
          </nav>
          <div className="who">
            {user.role === "super_admin" && (
              <div style={{ display: "grid", gap: ".4rem", marginBottom: ".6rem" }}>
                <span className="chip ok">{sw.role}</span>
                <button className="btn small" type="button" onClick={() => void openPanel("admin")}>{sw.admin}</button>
                <button className="btn small" type="button" onClick={() => void openPanel("support")}>{sw.support}</button>
                {switchErr && <span role="alert" className="muted">{sw.failed}</span>}
              </div>
            )}
            <div className="muted" title={user.email}>{user.email}</div>
            <button className="btn ghost small" onClick={() => void signOut()}>{t.common.signOut}</button>
          </div>
        </aside>
        <main id="main" className="main">
          <div className="banner" role="note">{t.common.sandboxBanner}</div>
          {children}
        </main>
      </div>
    </>
  );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useApp } from "./Providers";
import { Alert, Loading } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const { t, user, signOut } = useApp();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => { if (user === null) router.replace("/login"); }, [user, router]);

  if (user === undefined || user === null) return <div className="center"><Loading /></div>;
  if ((user.role !== "customer" && user.role !== "super_admin") || user.mfaPending) {
    return (
      <div className="center"><div className="card narrow">
        <h1>{t.auth.notCustomer.title}</h1><Alert kind="warn">{t.auth.notCustomer.body}</Alert>
        <button className="btn" onClick={() => void signOut()}>{t.common.signOut}</button>
      </div></div>
    );
  }
  const nav: [string, string][] = [["/", t.nav.dashboard], ["/projects", t.nav.projects], ["/wallet", t.nav.wallet], ["/playground", t.nav.playground], ["/tickets", t.nav.tickets], ["/settings", t.nav.settings]];
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

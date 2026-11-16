"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { APP } from "../config";
import { ROLE_LABEL } from "../lib/api";
import { useApp } from "./Providers";
import { Alert, Loading } from "./ui";

export function Shell({ nav, children }: { nav: [string, string][]; children: ReactNode }) {
  const { user, signOut } = useApp();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace("/login");
    else if (user?.mfaPending) router.replace("/mfa");
  }, [user, router]);

  if (user === undefined || user === null || user.mfaPending) return <div className="center"><Loading /></div>;
  if (!APP.roles.includes(user.role)) {
    return (
      <div className="center"><div className="card narrow">
        <h1>Wrong console</h1>
        <Alert kind="warn">This account ({ROLE_LABEL[user.role] ?? user.role}) is not allowed in the {APP.short} console. Sign out and use the right one.</Alert>
        <button className="btn" onClick={() => void signOut()}>Sign out</button>
      </div></div>
    );
  }
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="shell">
        <aside className="side">
          <Link href="/" className="brand"><img src="/icon.svg" alt="" width={28} height={28} /><span>{APP.name}</span></Link>
          <nav aria-label="Main navigation">
            {nav.map(([h, l]) => <Link key={h} href={h} aria-current={active(h) ? "page" : undefined}>{l}</Link>)}
          </nav>
          <div className="who">
            <div className="muted" title={user.email}>{user.email}</div>
            <div className="muted">{ROLE_LABEL[user.role] ?? user.role}</div>
            <button className="btn ghost small" onClick={() => void signOut()}>Sign out</button>
          </div>
        </aside>
        <main id="main" className="main">{children}</main>
      </div>
    </>
  );
}

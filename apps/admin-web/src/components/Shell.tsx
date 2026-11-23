"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { APP } from "../config";
import { ROLE_LABEL } from "../lib/api";
import { useApp } from "./Providers";
import { LOCALES, NATIVE_NAMES, isLocale, type Key } from "../i18n";
import { Alert, Loading } from "./ui";

export function Shell({ nav, children }: { nav: [string, string][]; children: ReactNode }) {
  const { user, signOut, t, locale, setLocale } = useApp();
  const [langErr, setLangErr] = useState(false);
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
        <h1>{t("shell.wrongTitle")}</h1>
        <Alert kind="warn">{t("shell.wrongBody", { role: ROLE_LABEL[user.role] ?? user.role, app: APP.short })}</Alert>
        <button className="btn" onClick={() => void signOut()}>{t("shell.signOut")}</button>
      </div></div>
    );
  }
  const active = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return (
    <>
      <a className="skip" href="#main">{t("shell.skip")}</a>
      <div className="shell">
        <aside className="side">
          <Link href="/" className="brand"><img src="/icon.svg" alt="" width={28} height={28} /><span>{APP.name}</span></Link>
          <nav aria-label={t("shell.mainNav")}>
            {nav.map(([h, l]) => <Link key={h} href={h} aria-current={active(h) ? "page" : undefined}>{t(l as Key)}</Link>)}
          </nav>
          <div className="who">
            <div className="muted" title={user.email}>{user.email}</div>
            <div className="muted">{ROLE_LABEL[user.role] ?? user.role}</div>
            <label className="muted" htmlFor="lang">{t("shell.language")}</label>
            <select id="lang" value={locale} onChange={(e) => { if (isLocale(e.target.value)) void setLocale(e.target.value).then((ok) => setLangErr(!ok)); }}>
              {LOCALES.map((l) => <option key={l} value={l}>{NATIVE_NAMES[l]}</option>)}
            </select>
            {langErr && <span className="err" role="alert">!</span>}
            <button className="btn ghost small" onClick={() => void signOut()}>{t("shell.signOut")}</button>
          </div>
        </aside>
        <main id="main" className="main">{children}</main>
      </div>
    </>
  );
}

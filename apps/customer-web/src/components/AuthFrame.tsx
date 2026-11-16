"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { LOCALES, NATIVE_NAMES, type Locale } from "../i18n";
import { useApp } from "./Providers";

export function AuthFrame({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { t, locale, setLocale } = useApp();
  return (
    <div className="center">
      <div className="authcard">
        <div className="authtop">
          <Link href="/login" className="brand" aria-label={t.common.brandHome}><img src="/icon.svg" alt="" width={28} height={28} /><span>{t.site.name}</span></Link>
          <label className="sr" htmlFor="lang">{t.common.language}</label>
          <select id="lang" value={locale} onChange={(e) => setLocale(e.target.value as Locale)} style={{ width: "auto" }}>
            {LOCALES.map((l) => <option key={l} value={l}>{NATIVE_NAMES[l]}</option>)}
          </select>
        </div>
        <div className="card">
          <h1>{title}</h1>
          {sub && <p className="muted">{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

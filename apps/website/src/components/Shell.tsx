import Link from "next/link";
import type { ReactNode } from "react";
import { LOCALES, NATIVE_NAMES, type Locale } from "../i18n/config";
import type { Dict } from "../i18n";
import { CONSOLE_URL } from "../lib/seo";

const NAV = [
  ["/products", "products"], ["/developers", "developers"], ["/pricing", "pricing"], ["/security", "security"],
] as const;

export function Shell({ locale, t, path, children }: { locale: Locale; t: Dict; path: string; children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">{t.common.skip}</a>
      <header className="top">
        <div className="wrap bar">
          <Link href={`/${locale}`} className="brand" aria-label={t.site.name}>
            <img src="/icon.svg" alt="" width={28} height={28} /> <span>{t.site.name}</span>
          </Link>
          <nav aria-label="Main">
            {NAV.map(([p, k]) => <Link key={p} href={`/${locale}${p}`}>{t.nav[k]}</Link>)}
          </nav>
          <a className="btn small" href={CONSOLE_URL} rel="noopener">{t.common.console}</a>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="foot">
        <div className="wrap">
          <nav aria-label={t.common.language} className="langs">
            {LOCALES.map((l) => (
              <Link key={l} href={`/${l}${path}`} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined}>{NATIVE_NAMES[l]}</Link>
            ))}
          </nav>
          <p className="muted">{t.common.sandbox}</p>
          <p className="muted">
            <Link href={`/${locale}/legal/terms`}>{t.legal.terms.title}</Link> · <Link href={`/${locale}/legal/privacy`}>{t.legal.privacy.title}</Link>
          </p>
          <p className="muted">{t.common.templateNote}</p>
          <p className="muted">© {new Date().getFullYear()} {t.site.name}. {t.common.rights}</p>
        </div>
      </footer>
    </>
  );
}

export function Crumbs({ locale, t, items }: { locale: Locale; t: Dict; items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <Link href={`/${locale}`}>{t.site.name}</Link>
      {items.map((c) => <span key={c.path}> / <Link href={`/${locale}${c.path}`}>{c.name}</Link></span>)}
    </nav>
  );
}

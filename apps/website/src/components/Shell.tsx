import Link from "next/link";
import type { ReactNode } from "react";
import { LOCALES, NATIVE_NAMES, type Locale } from "../i18n/config";
import type { Dict } from "../i18n";
import { getLanding } from "../i18n/landing";
import { CONSOLE, getCompany } from "../lib/site";
import SupportChat from "./SupportChat";

const NAV = [
  ["/products", "products"], ["/developers", "developers"], ["/pricing", "pricing"], ["/security", "security"],
] as const;

function LangMenu({ locale, path, label, up = false }: { locale: Locale; path: string; label: string; up?: boolean }) {
  return (
    <details className={up ? "lang up" : "lang"}>
      <summary aria-label={label}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z" /></svg>
        {NATIVE_NAMES[locale]}
      </summary>
      <ul>
        {LOCALES.map((l) => (
          <li key={l}><Link href={`/${l}${path}`} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined}>{NATIVE_NAMES[l]}</Link></li>
        ))}
      </ul>
    </details>
  );
}

const SUPPORT_LABEL: Record<Locale, string> = {
  en: "Start a support chat", ar: "ابدأ محادثة مع الدعم", ru: "Начать чат с поддержкой", es: "Iniciar chat de soporte", de: "Support-Chat starten", zh: "开始客服对话",
};

export async function Shell({ locale, t, path, children }: { locale: Locale; t: Dict; path: string; children: ReactNode }) {
  const l = getLanding(locale);
  const f = l.footer;
  const COMPANY = await getCompany();
  const contactHref = () => (COMPANY.email ? `mailto:${COMPANY.email}` : CONSOLE.register);
  return (
    <>
      <a className="skip" href="#main">{t.common.skip}</a>
      <header className="top">
        <div className="wrap bar">
          <Link href={`/${locale}`} className="brand" aria-label={t.site.name}>
            <img src="/icon.svg" alt="" width={30} height={30} /> <span>{t.site.name}</span>
          </Link>
          <nav className="main" aria-label="Main">
            {NAV.map(([p, k]) => <Link key={p} href={`/${locale}${p}`}>{t.nav[k]}</Link>)}
          </nav>
          <div className="bar-end">
            <LangMenu locale={locale} path={path} label={l.header.language} />
            <a className="login" href={CONSOLE.login} rel="noopener">{l.header.login}</a>
            <a className="btn small" href={CONSOLE.register} rel="noopener">{l.header.start}</a>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <SupportChat locale={locale} registerUrl={CONSOLE.register} />
      <footer className="foot">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <Link href={`/${locale}`} className="brand" aria-label={t.site.name}>
                <img src="/icon.svg" alt="" width={30} height={30} /> <span>{t.site.name}</span>
              </Link>
              <p className="muted" style={{ marginTop: ".8rem", maxWidth: "34ch" }}>{f.blurb}</p>
              <p className="svc"><b>{f.services}:</b> {f.servicesList}</p>
              {(COMPANY.legalName || COMPANY.address.length > 0 || COMPANY.email || COMPANY.phone) && (
                <address>
                  {COMPANY.legalName && <strong>{COMPANY.legalName}</strong>}
                  {COMPANY.address.map((line) => <span key={line}><br />{line}</span>)}
                  {COMPANY.email && <span><br /><a className="plain" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></span>}
                  {COMPANY.phone && <span><br /><a className="plain" href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} dir="ltr">{COMPANY.phone}</a></span>}
                </address>
              )}
            </div>
            <div>
              <h4>{f.platform}</h4>
              <ul>
                <li><Link href={`/${locale}/developers`}>{f.quickstart}</Link></li>
                <li><Link href={`/${locale}/products`}>{f.products}</Link></li>
                <li><Link href={`/${locale}/pricing`}>{f.pricing}</Link></li>
                <li><Link href={`/${locale}/security`}>{f.security}</Link></li>
              </ul>
            </div>
            <div>
              <h4>{f.resources}</h4>
              <ul>
                <li><Link href={`/${locale}/developers`}>{t.common.docs}</Link></li>
                <li><a href={CONSOLE.home} rel="noopener">{f.keys}</a></li>
              </ul>
            </div>
            <div>
              <h4>{f.company}</h4>
              <ul>
                <li><a href={contactHref()} rel="noopener">{f.contact}</a></li>
                <li><Link href={`/${locale}/legal/terms`}>{f.terms}</Link></li>
                <li><Link href={`/${locale}/legal/privacy`}>{f.privacy}</Link></li>
              </ul>
            </div>
            <div>
              <h4>{f.account}</h4>
              <ul>
                <li><a href={CONSOLE.register} rel="noopener">{f.signup}</a></li>
                <li><a href={CONSOLE.login} rel="noopener">{f.login}</a></li>
                <li><a href={CONSOLE.forgot} rel="noopener">{f.forgot}</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <p className="muted" style={{ margin: 0 }}>© {new Date().getFullYear()} {COMPANY.legalName || t.site.name}. {f.rights}</p>
            <div className="badges">{f.badges.map((b) => <span key={b}>{b}</span>)}</div>
          </div>
          <div className="foot-notes">
            <p className="muted">{f.status}</p>
            <p className="muted">{f.templateNote}</p>
          </div>
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

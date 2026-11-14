import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isLocale } from "../../i18n/config";
import { getDict } from "../../i18n";
import { Shell } from "../../components/Shell";
import { JsonLd } from "../../components/JsonLd";
import { CONSOLE_URL, faqLd, pageMetadata } from "../../lib/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getDict(locale).meta.home;
  return pageMetadata(locale, "", m.title, m.description);
}

export default async function Home({ params }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  return (
    <Shell locale={locale} t={t} path="">
      <JsonLd data={faqLd(t.home.faq)} />
      <section className="hero">
        <div className="wrap">
          <p className="badge">{t.home.badge}</p>
          <h1>{t.home.h1}</h1>
          <p className="lead">{t.home.sub}</p>
          <p className="cta">
            <a className="btn" href={CONSOLE_URL} rel="noopener">{t.home.cta1}</a>
            <Link className="btn ghost" href={`/${locale}/developers`}>{t.home.cta2}</Link>
          </p>
          <pre className="code" dir="ltr" aria-label="example"><code>{`POST /v1/otp/send
Authorization: Bearer otp_test_…
Idempotency-Key: 3f2b…

{ "channel": "email", "to": "user@example.com" }`}</code></pre>
        </div>
      </section>
      <section className="wrap section">
        <h2>{t.home.featuresTitle}</h2>
        <div className="grid3">
          {t.home.features.map((f) => (<article className="card" key={f.t}><h3>{f.t}</h3><p>{f.d}</p></article>))}
        </div>
      </section>
      <section className="wrap section">
        <h2>{t.home.faqTitle}</h2>
        <div className="faq">
          {t.home.faq.map((f) => (<details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>))}
        </div>
      </section>
    </Shell>
  );
}

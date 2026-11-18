import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../i18n/config";
import { getDict } from "../../i18n";
import { getLanding } from "../../i18n/landing";
import { Shell } from "../../components/Shell";
import { JsonLd } from "../../components/JsonLd";
import { CtaBand, DevSection, Hero, Plans, Strip, Why } from "../../components/landing";
import { faqLd, pageMetadata } from "../../lib/seo";

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
  const l = getLanding(locale);
  return (
    <Shell locale={locale} t={t} path="">
      <JsonLd data={faqLd(l.faq)} />
      <Hero locale={locale} l={l} siteName={t.site.name} />
      <Strip l={l} />
      <Why l={l} />
      <Plans locale={locale} l={l} />
      <DevSection locale={locale} l={l} />
      <section className="wrap section">
        <div className="sec-head"><h2>{l.faqTitle}</h2></div>
        <div className="faq">
          {l.faq.map((f) => (<details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>))}
        </div>
      </section>
      <CtaBand locale={locale} l={l} />
    </Shell>
  );
}

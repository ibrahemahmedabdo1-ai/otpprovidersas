import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../i18n/config";
import { getDict } from "../../../i18n";
import { Crumbs, Shell } from "../../../components/Shell";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, pageMetadata } from "../../../lib/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getDict(locale).meta.pricing;
  return pageMetadata(locale, "/pricing", m.title, m.description);
}

export default async function Pricing({ params }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const crumbs = [{ name: t.nav.pricing, path: "/pricing" }];
  return (
    <Shell locale={locale} t={t} path="/pricing">
      <JsonLd data={breadcrumbLd(locale, [{ name: t.site.name, path: "" }, ...crumbs])} />
      <div className="wrap section narrow">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <h1>{t.pricing.h1}</h1>
        <p className="lead">{t.pricing.intro}</p>
        <ul className="ticks">{t.pricing.points.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
    </Shell>
  );
}

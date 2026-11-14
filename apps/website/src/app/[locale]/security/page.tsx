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
  const m = getDict(locale).meta.security;
  return pageMetadata(locale, "/security", m.title, m.description);
}

export default async function Security({ params }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const crumbs = [{ name: t.nav.security, path: "/security" }];
  return (
    <Shell locale={locale} t={t} path="/security">
      <JsonLd data={breadcrumbLd(locale, [{ name: t.site.name, path: "" }, ...crumbs])} />
      <div className="wrap section narrow">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <h1>{t.security.h1}</h1>
        <p className="lead">{t.security.intro}</p>
        <ul className="ticks">{t.security.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <p className="muted">{t.security.note}</p>
      </div>
    </Shell>
  );
}

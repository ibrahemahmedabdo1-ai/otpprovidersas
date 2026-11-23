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
  const m = getDict(locale).meta.products;
  return pageMetadata(locale, "/products", m.title, m.description);
}

export default async function Products({ params }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const crumbs = [{ name: t.nav.products, path: "/products" }];
  return (
    <Shell locale={locale} t={t} path="/products">
      <JsonLd data={breadcrumbLd(locale, [{ name: t.site.name, path: "" }, ...crumbs])} />
      <div className="wrap section">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <h1>{t.products.h1}</h1>
        <p className="lead">{t.products.intro}</p>
        <div className="grid2">
          <article className="card">
            <h2>{t.products.email.t}</h2><p>{t.products.email.d}</p>
            <ul>{t.products.email.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </article>
          <article className="card">
            <h2>{t.products.wa.t}</h2><p>{t.products.wa.d}</p>
            <ul>{t.products.wa.points.map((p) => <li key={p}>{p}</li>)}</ul>
            {t.products.wa.warn.trim() !== "" && <p className="warn" role="note">{t.products.wa.warn}</p>}
          </article>
        </div>
      </div>
    </Shell>
  );
}

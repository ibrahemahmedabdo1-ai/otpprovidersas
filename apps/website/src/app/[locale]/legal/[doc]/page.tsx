import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "../../../../i18n/config";
import { getDict } from "../../../../i18n";
import { Crumbs, Shell } from "../../../../components/Shell";
import { pageMetadata } from "../../../../lib/seo";

const DOCS = ["terms", "privacy"] as const;
type Doc = (typeof DOCS)[number];
const isDoc = (v: string): v is Doc => (DOCS as readonly string[]).includes(v);

type P = { params: Promise<{ locale: string; doc: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return LOCALES.flatMap((locale) => DOCS.map((doc) => ({ locale, doc }))); }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) return {};
  const m = getDict(locale).meta[doc === "terms" ? "legalTerms" : "legalPrivacy"];
  // Placeholder legal text must not be indexed: it is a template, not a published policy.
  return pageMetadata(locale, `/legal/${doc}`, m.title, m.description, { index: false });
}

export default async function Legal({ params }: P) {
  const { locale, doc } = await params;
  if (!isLocale(locale) || !isDoc(doc)) notFound();
  const t = getDict(locale);
  const d = t.legal[doc];
  const crumbs = [{ name: d.title, path: `/legal/${doc}` }];
  return (
    <Shell locale={locale} t={t} path={`/legal/${doc}`}>
      <div className="wrap section narrow">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <p className="warn" role="note">{t.legal.banner}</p>
        <h1>{d.title}</h1>
        {d.body.map((p) => <p key={p}>{p}</p>)}
      </div>
    </Shell>
  );
}

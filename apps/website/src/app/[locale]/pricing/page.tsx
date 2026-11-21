import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../i18n/config";
import { getDict } from "../../../i18n";
import { Crumbs, Shell } from "../../../components/Shell";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, pageMetadata } from "../../../lib/seo";
import { getLanding } from "../../../i18n/landing";
import { Plans } from "../../../components/landing";
import { CountryPricing } from "../../../components/CountryPricing";

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
  const l = getLanding(locale);
  const crumbs = [{ name: t.nav.pricing, path: "/pricing" }];
  return (
    <Shell locale={locale} t={t} path="/pricing">
      <JsonLd data={breadcrumbLd(locale, [{ name: t.site.name, path: "" }, ...crumbs])} />
      <div className="wrap section narrow">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <h1>{t.pricing.h1}</h1>
        <p className="lead">{locale === "ar" ? "الأسعار والباقات المعروضة تُقرأ من التعرفة المعتمدة ومسارات الإرسال الفعالة في النظام." : "Prices and wallet packages are read from the approved billing catalog and currently enabled delivery routes."}</p>
        <ul className="ticks">{(locale === "ar" ? ["تظهر الباقات بعد اعتمادها وتفعيلها", "تظهر أسعار الدول عند تفعيل مسار الإرسال", "السعر المعروض هو نفسه المستخدم في الخصم", "لا يتم الخصم إلا بعد تأكيد التسليم"] : ["Packages appear only after approval and activation", "Country rates appear only when a delivery route is enabled", "The displayed rate is the exact rate used for billing", "Charges apply only after confirmed delivery"]).map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
      <Plans locale={locale} l={l} />
      <CountryPricing locale={locale} />
    </Shell>
  );
}

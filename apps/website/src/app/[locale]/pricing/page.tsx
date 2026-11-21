import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../i18n/config";
import { getDict } from "../../../i18n";
import { Crumbs, Shell } from "../../../components/Shell";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, pageMetadata } from "../../../lib/seo";
import { getPricing } from "../../../lib/site";
import PricingTable from "../../../components/PricingTable";

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
  const data = await getPricing();
  const TITLE: Record<string, [string, string, string]> = {
    en: ["Verification message prices by country", "You are billed only for verification messages that were delivered successfully.", "Prices could not be loaded right now. Please try again in a moment."],
    ar: ["أسعار رسائل التحقق حسب الدولة", "تُحاسب فقط على رسائل التحقق التي تم تسليمها بنجاح", "تعذر تحميل الأسعار الآن. حاول مرة أخرى بعد قليل."],
    ru: ["Цены на сообщения проверки по странам", "Оплачиваются только успешно доставленные сообщения проверки.", "Не удалось загрузить цены. Повторите попытку позже."],
    es: ["Precios de mensajes de verificación por país", "Solo pagas por los mensajes de verificación entregados correctamente.", "No se pudieron cargar los precios. Inténtalo de nuevo en un momento."],
    de: ["Preise für Verifizierungsnachrichten nach Land", "Abgerechnet werden nur erfolgreich zugestellte Verifizierungsnachrichten.", "Die Preise konnten nicht geladen werden. Bitte versuche es gleich erneut."],
    zh: ["各国家/地区验证消息价格", "仅对成功送达的验证消息计费。", "暂时无法加载价格，请稍后重试。"],
  };
  const [title, sub, fail] = TITLE[locale];
  const crumbs = [{ name: t.nav.pricing, path: "/pricing" }];
  return (
    <Shell locale={locale} t={t} path="/pricing">
      <JsonLd data={breadcrumbLd(locale, [{ name: t.site.name, path: "" }, ...crumbs])} />
      <div className="wrap narrow ptable-head">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <h1>{title}</h1>
        <p className="lead">{sub}</p>
      </div>
      <div className="wrap section">
        {data ? <PricingTable locale={locale} data={data} /> : <p className="muted">{fail}</p>}
      </div>
    </Shell>
  );
}

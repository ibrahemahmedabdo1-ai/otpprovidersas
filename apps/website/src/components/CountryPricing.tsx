"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../lib/site";

type Rate = { country: string; unitPriceMicroUsd: string };
type Package = { id: string; name: string; priceMicroUsd: string; creditMicroUsd: string };
type Catalog = {
  currency: "USD";
  channels: {
    email: { available: boolean; unitPriceMicroUsd: string | null };
    whatsapp: { available: boolean; rates: Rate[] };
  };
  packages: Package[];
};
const money = (micro: string | number) => "$" + (Number(micro) / 1_000_000).toFixed(4);
const count = (credit: string, price: string) => {
  const rate = Number(price);
  return rate > 0 ? Math.floor(Number(credit) / rate).toLocaleString("en-US") : "—";
};
const countryName = (code: string, locale: string) => {
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; }
  catch { return code; }
};

export function CountryPricing({ locale }: { locale: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState("EG");
  const ar = locale === "ar";
  const t = ar ? {
    title: "أسعار OTP الفعلية حسب الدولة",
    sub: "الأسعار المعروضة هنا تُقرأ مباشرة من نظام التسعير والفوترة.",
    loading: "جارٍ تحميل الأسعار المعتمدة…",
    failed: "تعذر تحميل الأسعار الآن. حاول مرة أخرى لاحقًا.",
    email: "رمز البريد الإلكتروني",
    whatsapp: "رمز واتساب",
    per: "لكل رسالة تم تأكيد تسليمها",
    country: "دولة المستلم",
    packages: "عدد الرسائل التقريبي حسب الباقة",
    package: "الباقة",
    codes: "رسائل تقريبية",
    unavailable: "غير متاح حاليًا",
    noWa: "إرسال واتساب غير متاح حاليًا. لن يتم عرض سعر أو خصم قبل تفعيل مسار إرسال موثوق.",
    noEmail: "إرسال البريد غير متاح حاليًا.",
    note: "يتم الخصم فقط بعد تأكيد التسليم. السعر المعروض هو السعر النشط المرتبط بعملية الخصم في قاعدة البيانات."
  } : {
    title: "Live OTP prices by destination",
    sub: "These prices are read directly from the same catalog used by billing.",
    loading: "Loading approved prices…",
    failed: "Pricing is temporarily unavailable. Please try again later.",
    email: "Email OTP",
    whatsapp: "WhatsApp OTP",
    per: "per confirmed delivery",
    country: "Destination country",
    packages: "Estimated messages by wallet package",
    package: "Package",
    codes: "Estimated messages",
    unavailable: "Currently unavailable",
    noWa: "WhatsApp delivery is not enabled yet. No WhatsApp price is advertised or charged until a reliable route is activated.",
    noEmail: "Email delivery is currently unavailable.",
    note: "Wallet charges are applied only after confirmed delivery. Displayed prices come from the active database rates used by billing."
  };

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/v1/public/pricing`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("pricing_unavailable"); return r.json(); })
      .then((data: Catalog) => { if (alive) { setCatalog(data); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const waRates = catalog?.channels.whatsapp.rates ?? [];
  const selected = useMemo(() => waRates.find((r) => r.country === code) ?? waRates[0] ?? null, [waRates, code]);
  const emailRate = catalog?.channels.email.available ? catalog.channels.email.unitPriceMicroUsd : null;

  return (
    <section className="wrap section country-pricing" id="country-rates">
      <div className="sec-head"><h2>{t.title}</h2><p>{t.sub}</p></div>
      {loading && <p className="muted" role="status">{t.loading}</p>}
      {failed && <p className="rate-draft-notice" role="alert">{t.failed}</p>}
      {!loading && !failed && catalog && <>
        <div className="rate-summary">
          <article className="rate-card">
            <span>{t.email}</span>
            <strong>{emailRate ? money(emailRate) : t.unavailable}</strong>
            <small>{emailRate ? t.per : t.noEmail}</small>
          </article>
          <article className="rate-card">
            <span>{t.whatsapp}</span>
            <strong>{selected ? money(selected.unitPriceMicroUsd) : t.unavailable}</strong>
            <small>{selected ? t.per : t.noWa}</small>
          </article>
        </div>
        {waRates.length > 0 && <>
          <div className="country-picker">
            <label htmlFor="otp-country">{t.country}</label>
            <select id="otp-country" value={selected?.country ?? code} onChange={(e) => setCode(e.target.value)}>
              {waRates.map((r) => <option key={r.country} value={r.country}>{countryName(r.country, locale)}</option>)}
            </select>
          </div>
        </>}
        {catalog.packages.length > 0 && <>
          <h3>{t.packages}</h3>
          <div className="table-scroll">
            <table className="rate-table">
              <thead><tr><th>{t.package}</th><th>{t.email}</th><th>{t.codes}</th>{selected && <><th>{t.whatsapp}</th><th>{t.codes}</th></>}</tr></thead>
              <tbody>{catalog.packages.map((p) => <tr key={p.id}>
                <td><b>{p.name}</b></td>
                <td>{money(p.priceMicroUsd)}</td>
                <td>{emailRate ? count(p.creditMicroUsd, emailRate) : "—"}</td>
                {selected && <><td>{money(selected.unitPriceMicroUsd)}</td><td>{count(p.creditMicroUsd, selected.unitPriceMicroUsd)}</td></>}
              </tr>)}</tbody>
            </table>
          </div>
        </>}
        {catalog.packages.length === 0 && <p className="muted">{ar ? "لا توجد باقات شحن معتمدة للبيع حاليًا. التسجيل متاح، ويمكنك التواصل مع الدعم بخصوص شحن الرصيد." : "No wallet packages are approved for sale yet. Registration remains open; contact Support about adding wallet credit."}</p>}
        <p className="muted pricing-disclaimer">{t.note}</p>
      </>}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";

type Country = { code: string; name: string; ar: string; meta: number; retail: number };
const COUNTRIES: Country[] = [
  { code: "EG", name: "Egypt", ar: "مصر", meta: 0.0036, retail: 0.0044 },
  { code: "IN", name: "India", ar: "الهند", meta: 0.0014, retail: 0.0017 },
  { code: "CO", name: "Colombia", ar: "كولومبيا", meta: 0.0008, retail: 0.0010 },
  { code: "TR", name: "Turkey", ar: "تركيا", meta: 0.0009, retail: 0.0011 },
  { code: "BD", name: "Bangladesh", ar: "بنغلاديش", meta: 0.0037, retail: 0.0045 },
  { code: "BR", name: "Brazil", ar: "البرازيل", meta: 0.0068, retail: 0.0082 },
  { code: "SA", name: "Saudi Arabia", ar: "السعودية", meta: 0.0107, retail: 0.0129 },
  { code: "AE", name: "United Arab Emirates", ar: "الإمارات", meta: 0.0157, retail: 0.0189 },
  { code: "US", name: "United States", ar: "الولايات المتحدة", meta: 0.0034, retail: 0.0041 },
  { code: "GB", name: "United Kingdom", ar: "المملكة المتحدة", meta: 0.0220, retail: 0.0264 },
  { code: "DE", name: "Germany", ar: "ألمانيا", meta: 0.0550, retail: 0.0660 },
  { code: "FR", name: "France", ar: "فرنسا", meta: 0.0300, retail: 0.0360 },
  { code: "PK", name: "Pakistan", ar: "باكستان", meta: 0.0150, retail: 0.0180 },
  { code: "NG", name: "Nigeria", ar: "نيجيريا", meta: 0.0067, retail: 0.0081 },
  { code: "ZA", name: "South Africa", ar: "جنوب أفريقيا", meta: 0.0095, retail: 0.0114 },
  { code: "ID", name: "Indonesia", ar: "إندونيسيا", meta: 0.0250, retail: 0.0300 },
  { code: "MA", name: "Morocco", ar: "المغرب", meta: 0.0230, retail: 0.0276 },
  { code: "IQ", name: "Iraq", ar: "العراق", meta: 0.0079, retail: 0.0095 },
  { code: "IL", name: "Israel", ar: "إسرائيل", meta: 0.0053, retail: 0.0064 },
  { code: "QA", name: "Qatar", ar: "قطر", meta: 0.0120, retail: 0.0144 },
  { code: "KW", name: "Kuwait", ar: "الكويت", meta: 0.0440, retail: 0.0528 },
  { code: "ES", name: "Spain", ar: "إسبانيا", meta: 0.0200, retail: 0.0240 },
  { code: "IT", name: "Italy", ar: "إيطاليا", meta: 0.0300, retail: 0.0360 },
  { code: "NL", name: "Netherlands", ar: "هولندا", meta: 0.0500, retail: 0.0600 },
  { code: "AR", name: "Argentina", ar: "الأرجنتين", meta: 0.0260, retail: 0.0312 },
  { code: "CL", name: "Chile", ar: "تشيلي", meta: 0.0200, retail: 0.0240 },
  { code: "HK", name: "Hong Kong", ar: "هونغ كونغ", meta: 0.0260, retail: 0.0312 },
  { code: "HU", name: "Hungary", ar: "المجر", meta: 0.0350, retail: 0.0420 },
  { code: "KZ", name: "Kazakhstan", ar: "كازاخستان", meta: 0.0180, retail: 0.0216 },
  { code: "MY", name: "Malaysia", ar: "ماليزيا", meta: 0.0140, retail: 0.0168 },
  { code: "NP", name: "Nepal", ar: "نيبال", meta: 0.0034, retail: 0.0041 },
  { code: "OM", name: "Oman", ar: "عُمان", meta: 0.0247, retail: 0.0297 },
  { code: "PE", name: "Peru", ar: "بيرو", meta: 0.0300, retail: 0.0360 },
  { code: "PL", name: "Poland", ar: "بولندا", meta: 0.0122, retail: 0.0147 },
  { code: "RO", name: "Romania", ar: "رومانيا", meta: 0.0290, retail: 0.0348 },
  { code: "RU", name: "Russia", ar: "روسيا", meta: 0.0400, retail: 0.0480 },
  { code: "SG", name: "Singapore", ar: "سنغافورة", meta: 0.0160, retail: 0.0192 },
  { code: "LK", name: "Sri Lanka", ar: "سريلانكا", meta: 0.0020, retail: 0.0024 },
  { code: "UA", name: "Ukraine", ar: "أوكرانيا", meta: 0.0298, retail: 0.0358 },
  { code: "REST-AF", name: "Rest of Africa", ar: "بقية أفريقيا", meta: 0.0040, retail: 0.0048 },
  { code: "REST-APAC", name: "Rest of Asia Pacific", ar: "بقية آسيا والمحيط الهادئ", meta: 0.0113, retail: 0.0136 },
  { code: "REST-ME", name: "Rest of Middle East", ar: "بقية الشرق الأوسط", meta: 0.0091, retail: 0.0110 },
  { code: "REST-LATAM", name: "Rest of Latin America", ar: "بقية أمريكا اللاتينية", meta: 0.0113, retail: 0.0136 },
  { code: "REST-CEE", name: "Rest of Central & Eastern Europe", ar: "بقية وسط وشرق أوروبا", meta: 0.0212, retail: 0.0255 },
  { code: "REST-WE", name: "Rest of Western Europe", ar: "بقية غرب أوروبا", meta: 0.0171, retail: 0.0206 },
  { code: "OTHER", name: "Other markets", ar: "أسواق أخرى", meta: 0.0077, retail: 0.0093 },
];

const PACKAGES = [4.99, 19.99, 49.99];
const EMAIL_PRICE = 0.002;
const TEXT = {
  en: { title: "Per-country OTP rates", sub: "Choose the recipient country to see the exact rate and how many codes each wallet package covers.", country: "Destination country", email: "Email OTP", whatsapp: "WhatsApp OTP", per: "per delivered code", package: "Wallet package", codes: "estimated codes", emailPrice: "Email rate", waPrice: "WhatsApp rate", note: "USD prices per confirmed delivery. WhatsApp prices are calculated from Meta's published local authentication rate plus a 20% service margin, rounded to 4 decimal places. Provider surcharges, taxes, international-authentication eligibility and route availability can change the final rate. A route is billable only after it is enabled and verified.", unavailable: "Not enabled yet" },
  ar: { title: "سعر رمز التحقق حسب الدولة", sub: "اختر دولة المستلم لعرض سعر الرمز وعدد الرموز التقريبي الذي تغطيه كل باقة.", country: "دولة المستلم", email: "رمز البريد الإلكتروني", whatsapp: "رمز واتساب", per: "لكل رمز تم تسليمه", package: "باقة المحفظة", codes: "عدد الرموز التقريبي", emailPrice: "سعر البريد", waPrice: "سعر واتساب", note: "الأسعار بالدولار لكل عملية تسليم مؤكدة. تم احتساب أسعار واتساب من تعرفة المصادقة المحلية المنشورة من Meta مع هامش خدمة 20% وتقريب السعر إلى 4 منازل عشرية. قد تتغير التكلفة النهائية بسبب رسوم المزود والضرائب وشروط المصادقة الدولية وتوفر المسار. لا تتم المحاسبة إلا بعد تفعيل المسار والتحقق منه.", unavailable: "غير مفعّل حاليًا" },
  ru: { title: "Тарифы OTP по странам", sub: "Выберите страну получателя, чтобы увидеть цену и примерное количество кодов для каждого пакета.", country: "Страна получателя", email: "Email OTP", whatsapp: "WhatsApp OTP", per: "за доставленный код", package: "Пакет кошелька", codes: "примерно кодов", emailPrice: "Цена Email", waPrice: "Цена WhatsApp", note: "Цены в USD за подтверждённую доставку. Тарифы WhatsApp рассчитаны по опубликованной локальной ставке Meta с наценкой 20%. Дополнительные сборы провайдера, налоги, международные тарифы и доступность маршрута могут изменить итоговую цену.", unavailable: "Пока не включено" },
  es: { title: "Tarifas OTP por país", sub: "Elige el país de destino para ver el precio y los códigos aproximados incluidos en cada paquete.", country: "País de destino", email: "OTP por email", whatsapp: "OTP por WhatsApp", per: "por código entregado", package: "Paquete de saldo", codes: "códigos estimados", emailPrice: "Tarifa Email", waPrice: "Tarifa WhatsApp", note: "Precios en USD por entrega confirmada. Las tarifas de WhatsApp se calculan con la tarifa local de autenticación publicada por Meta más un margen del 20%. Los recargos del proveedor, impuestos, tarifas internacionales y disponibilidad pueden cambiar el precio final.", unavailable: "Aún no habilitado" },
  de: { title: "OTP-Preise nach Land", sub: "Wähle das Zielland, um den Preis und die ungefähre Anzahl der Codes je Guthabenpaket zu sehen.", country: "Zielland", email: "E-Mail-OTP", whatsapp: "WhatsApp-OTP", per: "pro zugestelltem Code", package: "Guthabenpaket", codes: "geschätzte Codes", emailPrice: "E-Mail-Preis", waPrice: "WhatsApp-Preis", note: "Preise in USD pro bestätigter Zustellung. WhatsApp-Preise basieren auf Metas veröffentlichtem lokalem Authentifizierungstarif plus 20 % Serviceaufschlag. Anbietergebühren, Steuern, internationale Tarife und Verfügbarkeit können den Endpreis ändern.", unavailable: "Noch nicht aktiviert" },
  zh: { title: "按国家/地区计费", sub: "选择收件国家/地区，查看每条验证码价格及各充值套餐预计可发送数量。", country: "收件国家/地区", email: "电子邮件 OTP", whatsapp: "WhatsApp OTP", per: "每条成功送达", package: "钱包套餐", codes: "预计验证码数量", emailPrice: "邮件价格", waPrice: "WhatsApp 价格", note: "价格单位为美元，按确认送达计费。WhatsApp 价格依据 Meta 公布的本地身份验证费率加 20% 服务差价计算。供应商附加费、税费、国际验证费率和线路可用性可能影响最终价格。", unavailable: "尚未启用" },
};
const usd = (n: number) => "$" + n.toFixed(4);
const count = (credit: number, rate: number) => Math.floor(credit / rate).toLocaleString("en-US");

export function CountryPricing({ locale }: { locale: string }) {
  const t = TEXT[locale as keyof typeof TEXT] ?? TEXT.en;
  const [code, setCode] = useState("EG");
  const selected = useMemo(() => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0], [code]);
  const isArabic = locale === "ar";
  return (
    <section className="wrap section country-pricing" id="country-rates">
      <div className="sec-head"><h2>{t.title}</h2><p>{t.sub}</p></div>
      <div className="country-picker">
        <label htmlFor="otp-country">{t.country}</label>
        <select id="otp-country" value={code} onChange={(e) => setCode(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{isArabic ? c.ar : c.name}</option>)}
        </select>
      </div>
      <div className="rate-summary">
        <article className="rate-card"><span>{t.email}</span><strong>{usd(EMAIL_PRICE)}</strong><small>{t.per}</small></article>
        <article className="rate-card"><span>{t.whatsapp} · {isArabic ? selected.ar : selected.name}</span><strong>{usd(selected.retail)}</strong><small>{t.per}</small></article>
      </div>
      <div className="table-scroll"><table className="rate-table">
        <thead><tr><th>{t.package}</th><th>{t.emailPrice}</th><th>{t.codes}</th><th>{t.waPrice}</th><th>{t.codes}</th></tr></thead>
        <tbody>{PACKAGES.map((amount) => <tr key={amount}><td><b>${amount.toFixed(2)}</b></td><td>{usd(EMAIL_PRICE)}</td><td>{count(amount, EMAIL_PRICE)}</td><td>{usd(selected.retail)}</td><td>{count(amount, selected.retail)}</td></tr>)}</tbody>
      </table></div>
      <p className="muted pricing-disclaimer">{t.note}</p>
      <div className="table-scroll country-list"><table className="rate-table">
        <thead><tr><th>{t.country}</th><th>{t.waPrice}</th><th>{t.codes} / $4.99</th></tr></thead>
        <tbody>{COUNTRIES.map((c) => <tr key={c.code}><td>{isArabic ? c.ar : c.name}</td><td>{usd(c.retail)}</td><td>{count(4.99, c.retail)}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

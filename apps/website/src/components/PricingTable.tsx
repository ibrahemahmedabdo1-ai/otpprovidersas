"use client";
import { useMemo, useState } from "react";
import "flag-icons/css/flag-icons.min.css";
import type { Locale } from "../i18n/config";
import type { PublicPricing } from "../lib/site";
import { buildRows, filterRows, flagClass, formatUsd } from "../lib/pricing";

const L: Record<Locale, { country: string; wa: string; em: string; per: string; na: string; search: string; sortAsc: string; sortDesc: string; empty: string; count: string }> = {
  en: { country: "Country", wa: "WhatsApp OTP", em: "Email OTP", per: "per message", na: "Not available", search: "Search by country name", sortAsc: "Sort A to Z", sortDesc: "Sort Z to A", empty: "No country matches your search.", count: "countries" },
  ar: { country: "الدولة", wa: "WhatsApp OTP", em: "Email OTP", per: "للرسالة الواحدة", na: "غير متاح", search: "ابحث باسم الدولة", sortAsc: "ترتيب أبجدي تصاعدي", sortDesc: "ترتيب أبجدي تنازلي", empty: "لا توجد دولة مطابقة لبحثك.", count: "دولة" },
  ru: { country: "Страна", wa: "WhatsApp OTP", em: "Email OTP", per: "за сообщение", na: "Недоступно", search: "Поиск по названию страны", sortAsc: "Сортировка А–Я", sortDesc: "Сортировка Я–А", empty: "Ничего не найдено.", count: "стран" },
  es: { country: "País", wa: "WhatsApp OTP", em: "Email OTP", per: "por mensaje", na: "No disponible", search: "Buscar por nombre de país", sortAsc: "Ordenar A a Z", sortDesc: "Ordenar Z a A", empty: "Ningún país coincide con tu búsqueda.", count: "países" },
  de: { country: "Land", wa: "WhatsApp OTP", em: "Email OTP", per: "pro Nachricht", na: "Nicht verfügbar", search: "Nach Ländernamen suchen", sortAsc: "A bis Z sortieren", sortDesc: "Z bis A sortieren", empty: "Kein Land entspricht deiner Suche.", count: "Länder" },
  zh: { country: "国家/地区", wa: "WhatsApp OTP", em: "Email OTP", per: "每条消息", na: "暂不可用", search: "按国家/地区名称搜索", sortAsc: "按 A 到 Z 排序", sortDesc: "按 Z 到 A 排序", empty: "没有匹配的国家/地区。", count: "个国家/地区" },
};

export default function PricingTable({ locale, data }: { locale: Locale; data: PublicPricing }) {
  const c = L[locale];
  const [q, setQ] = useState("");
  const [asc, setAsc] = useState(true);
  const rows = useMemo(() => buildRows(data.countries, locale, asc), [data, locale, asc]);
  const shown = filterRows(rows, q);
  return (
    <div className="ptable">
      <div className="ptable-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.search} aria-label={c.search} maxLength={60} />
        <button type="button" className="btn ghost" onClick={() => setAsc(!asc)} aria-label={asc ? c.sortDesc : c.sortAsc}>{asc ? "A → Z" : "Z → A"}</button>
        <span className="muted" aria-live="polite">{shown.length} {c.count}</span>
      </div>
      <div className="ptable-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{c.country}</th>
              <th scope="col">{c.wa}<small>{c.per}</small></th>
              <th scope="col">{c.em}<small>{c.per}</small></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} data-country={r.code}>
                <th scope="row"><span className={flagClass(r.code)} role="img" aria-label={r.name} /> <span>{r.name}</span></th>
                <td data-channel="whatsapp" className={r.whatsapp ? "" : "na"}>{r.whatsapp ? formatUsd(r.whatsapp) : c.na}</td>
                <td data-channel="email" className={r.email ? "" : "na"}>{r.email ? formatUsd(r.email) : c.na}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted ptable-empty">{c.empty}</p>}
      </div>
    </div>
  );
}

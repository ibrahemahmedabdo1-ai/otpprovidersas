export type PriceCountry = { code: string; email: string | null; whatsapp: string | null };

/** micro-USD (integer string) -> "$0.0450": at least 2, at most 4 decimals. */
export function formatUsd(micro: string): string {
  const v = Number(micro) / 1_000_000;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export const flagClass = (code: string) => `fi fi-${code.toLowerCase()}`;

function regionNames(locale: string) {
  try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; }
}

export type Row = PriceCountry & { name: string; search: string };

/** Localised, alphabetically sorted rows; `search` holds local + English name + code for matching. */
export function buildRows(countries: PriceCountry[], locale: string, asc = true): Row[] {
  const dn = regionNames(locale), en = regionNames("en");
  const rows = countries.map((r) => ({ ...r, name: dn?.of(r.code) ?? r.code, search: `${dn?.of(r.code) ?? ""} ${en?.of(r.code) ?? ""} ${r.code}`.toLowerCase() }));
  rows.sort((a, b) => a.name.localeCompare(b.name, locale));
  return asc ? rows : rows.reverse();
}

export function filterRows(rows: Row[], q: string): Row[] {
  const n = q.trim().toLowerCase();
  return n ? rows.filter((r) => r.search.includes(n)) : rows;
}

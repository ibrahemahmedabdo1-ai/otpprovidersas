/** Pure helpers for the dashboard statistics. No I/O so they can be tested without a database. */

export type DayRow = { day: string; [k: string]: string | number };

/** The last `days` calendar days (UTC) ending at `today`, oldest first, as YYYY-MM-DD. */
export function lastDays(days: number, today: Date): string[] {
  const out: string[] = [];
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let i = days - 1; i >= 0; i--) out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** Puts database rows on a continuous day axis. Days without rows get zeros; nothing is invented. */
export function fillDays<K extends string>(rows: Record<string, unknown>[], days: number, today: Date, keys: readonly K[]): ({ day: string } & Record<K, number>)[] {
  const byDay = new Map<string, Record<string, unknown>>();
  for (const r of rows) byDay.set(String(r.day).slice(0, 10), r);
  return lastDays(days, today).map((day) => {
    const src = byDay.get(day);
    const o = { day } as { day: string } & Record<K, number>;
    for (const k of keys) o[k] = Number(src?.[k] ?? 0) as never;
    return o;
  });
}

/** Share of attempted deliveries that were confirmed delivered, as a percentage with one decimal. Null when nothing was attempted. */
export function deliveryRate(delivered: number, failed: number, unknown: number): number | null {
  const attempted = delivered + failed + unknown;
  if (attempted <= 0) return null;
  return Math.round((delivered / attempted) * 1000) / 10;
}

export const DEFAULT_LOW_BALANCE_MICRO_USD = 1_000_000;   // $1.00

/** True when the available balance (micro-USD) is at or below the threshold. */
export function isLowBalance(availableMicroUsd: number, thresholdMicroUsd: number = DEFAULT_LOW_BALANCE_MICRO_USD): boolean {
  return availableMicroUsd <= thresholdMicroUsd;
}

/** Converts a micro-USD integer (as text from Postgres bigint) to a plain USD number with 6 decimals max. */
export function microToUsd(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Math.round(n) / 1_000_000;
}

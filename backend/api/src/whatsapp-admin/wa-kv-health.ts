/** Read-only health rules for the gateway's session store (wa_gateway_kv). Never reads or returns values or key ids. */
export const KV_TABLE_ALERT_BYTES = 100 * 1024 * 1024;
export const KV_VALUE_ALERT_BYTES = 5 * 1024 * 1024;

export const KV_HEALTH_SQL =
  "SELECT split_part(k, ':', 2) AS key_type, count(*)::bigint AS rows, " +
  "COALESCE(sum(pg_column_size(v)), 0)::bigint AS value_bytes, COALESCE(max(pg_column_size(v)), 0)::bigint AS max_value_bytes " +
  "FROM wa_gateway_kv GROUP BY 1 ORDER BY 3 DESC";
export const KV_TABLE_SIZE_SQL = "SELECT to_regclass('wa_gateway_kv') IS NOT NULL AS present, COALESCE(pg_total_relation_size(to_regclass('wa_gateway_kv')), 0)::bigint AS total_bytes";

export type KvAlert = "table_over_100mb" | "value_over_5mb";
export type KvTypeRow = { key_type: string | null; rows: number | string; value_bytes: number | string; max_value_bytes: number | string };
export type KvHealth = {
  status: "ok" | "alert" | "absent";
  alerts: KvAlert[];
  thresholds: { tableBytes: number; valueBytes: number };
  tableBytes: number;
  rows: number;
  largestValueBytes: number;
  byType: { type: string; rows: number; valueBytes: number; largestValueBytes: number }[];
};

export function buildKvHealth(present: boolean, totalBytes: number | string, rows: KvTypeRow[]): KvHealth {
  const thresholds = { tableBytes: KV_TABLE_ALERT_BYTES, valueBytes: KV_VALUE_ALERT_BYTES };
  const byType = rows.map((r) => ({ type: r.key_type || "unknown", rows: Number(r.rows), valueBytes: Number(r.value_bytes), largestValueBytes: Number(r.max_value_bytes) }));
  const tableBytes = Number(totalBytes);
  const largestValueBytes = byType.reduce((m, r) => Math.max(m, r.largestValueBytes), 0);
  const alerts: KvAlert[] = [];
  if (tableBytes > KV_TABLE_ALERT_BYTES) alerts.push("table_over_100mb");
  if (largestValueBytes > KV_VALUE_ALERT_BYTES) alerts.push("value_over_5mb");
  return { status: !present ? "absent" : alerts.length ? "alert" : "ok", alerts, thresholds, tableBytes, rows: byType.reduce((s, r) => s + r.rows, 0), largestValueBytes, byType };
}

import test from "node:test";
import assert from "node:assert/strict";
import { buildKvHealth, KV_HEALTH_SQL, KV_TABLE_SIZE_SQL, KV_TABLE_ALERT_BYTES, KV_VALUE_ALERT_BYTES } from "./wa-kv-health";

const MB = 1024 * 1024;
test("healthy store has no alerts", () => {
  const h = buildKvHealth(true, 10 * MB, [{ key_type: "pre-key", rows: "5", value_bytes: "1000", max_value_bytes: "400" }]);
  assert.equal(h.status, "ok"); assert.deepEqual(h.alerts, []); assert.equal(h.rows, 5);
});
test("table over 100 MB alerts (the current 358 MB case)", () => {
  const h = buildKvHealth(true, 358 * MB, []);
  assert.equal(h.status, "alert"); assert.deepEqual(h.alerts, ["table_over_100mb"]);
});
test("a single value over 5 MB alerts; exactly at the limit does not", () => {
  assert.deepEqual(buildKvHealth(true, MB, [{ key_type: "session", rows: 1, value_bytes: 6 * MB, max_value_bytes: 6 * MB }]).alerts, ["value_over_5mb"]);
  assert.deepEqual(buildKvHealth(true, KV_TABLE_ALERT_BYTES, [{ key_type: "session", rows: 1, value_bytes: KV_VALUE_ALERT_BYTES, max_value_bytes: KV_VALUE_ALERT_BYTES }]).alerts, []);
});
test("both alerts can fire together and a missing table reports absent", () => {
  assert.equal(buildKvHealth(true, 200 * MB, [{ key_type: "x", rows: 1, value_bytes: 9 * MB, max_value_bytes: 9 * MB }]).alerts.length, 2);
  assert.equal(buildKvHealth(false, 0, []).status, "absent");
});
test("queries are read-only and never select key ids or value contents", () => {
  for (const sql of [KV_HEALTH_SQL, KV_TABLE_SIZE_SQL]) {
    assert.match(sql, /^SELECT /); assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|VACUUM)\b/i);
  }
  assert.doesNotMatch(KV_HEALTH_SQL, /SELECT\s+k\b|\bv\s*#>>|\bv::text/);
  assert.match(KV_HEALTH_SQL, /pg_column_size\(v\)/);
});

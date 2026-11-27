import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBillableWhatsAppReceipt, UNBILLED_DELIVERED_RECEIPTS_SQL } from "./whatsapp-receipt-rules";

test("only explicit delivered WhatsApp receipts are billable", () => {
  for (const status of ["accepted", "server_ack", "read", "played", "error", "pending", "unknown"]) {
    assert.equal(isBillableWhatsAppReceipt(status), false, status);
  }
  assert.equal(isBillableWhatsAppReceipt("delivered"), true);
});

test("reconciliation query only selects unbilled, non-failed deliveries with a delivered receipt", () => {
  const q = UNBILLED_DELIVERED_RECEIPTS_SQL;
  assert.match(q, /w\.status='delivered'/);
  assert.match(q, /d\.billed=false/);
  assert.match(q, /d\.status<>'failed'/);
  assert.match(q, /JOIN otp_deliveries d ON d\.id=w\.otp_delivery_id/);
});

test("the query shipped in the service is the exact query exercised by the SQL test", () => {
  const file = resolve(process.cwd(), "../../tests/whatsapp/delivered-reconciliation.test.sql");
  const sql = readFileSync(file, "utf8");
  const m = sql.match(/-- BEGIN unbilled-delivered-query\s+SELECT array_agg\(q\.otp_delivery_id\) INTO v_found FROM \(\s*([\s\S]*?)\s*\) q;\s+-- END unbilled-delivered-query/);
  assert.ok(m, "marked query not found in the SQL test");
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  assert.equal(norm(m[1] ?? ""), norm(UNBILLED_DELIVERED_RECEIPTS_SQL));
});

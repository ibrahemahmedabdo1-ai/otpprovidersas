import test from "node:test";
import assert from "node:assert/strict";
import { isBillableWhatsAppReceipt } from "./whatsapp-receipt-rules";

test("only explicit delivered WhatsApp receipts are billable", () => {
  for (const status of ["accepted", "server_ack", "read", "played", "error", "pending", "unknown"]) {
    assert.equal(isBillableWhatsAppReceipt(status), false, status);
  }
  assert.equal(isBillableWhatsAppReceipt("delivered"), true);
});

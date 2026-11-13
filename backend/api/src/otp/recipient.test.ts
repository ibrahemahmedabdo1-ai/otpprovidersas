import test from "node:test";
import assert from "node:assert/strict";
import { isOtpCode, maskRecipient, parseIdempotencyKey, parseRecipient } from "./recipient";

test("email and WhatsApp recipients are validated per channel", () => {
  assert.deepEqual(parseRecipient("email", " A@B.com "), { ok: true, value: { channel: "email", to: "a@b.com" } });
  assert.deepEqual(parseRecipient("whatsapp", "+628123456789"), { ok: true, value: { channel: "whatsapp", to: "+628123456789" } });
  for (const [c, t] of [["sms", "+628123456789"], ["email", "nope"], ["whatsapp", "0812345"], ["whatsapp", "+0123456789"], ["whatsapp", "+62 812 345"], ["whatsapp", "+1234"], ["email", 5], [undefined, "a@b.com"]] as const)
    assert.equal(parseRecipient(c, t).ok, false, `${c} ${t}`);
});
test("recipients are masked in API output", () => {
  assert.equal(maskRecipient("email", "ibrahim@example.com"), "i***@example.com");
  const m = maskRecipient("whatsapp", "+628123456789");
  assert.ok(m.startsWith("+62") && m.endsWith("89") && m.includes("*") && !m.includes("8123456"));
});
test("idempotency key shape", () => {
  assert.deepEqual(parseIdempotencyKey(undefined), { ok: true, value: null });
  assert.deepEqual(parseIdempotencyKey("order-123_a.b"), { ok: true, value: "order-123_a.b" });
  assert.equal(parseIdempotencyKey("x".repeat(65)).ok, false);
  assert.equal(parseIdempotencyKey("bad key!").ok, false);
});
test("otp code shape", () => {
  assert.ok(isOtpCode("1234") && isOtpCode("12345678"));
  for (const v of ["123", "123456789", "12a456", "", 123456, null]) assert.equal(isOtpCode(v), false);
});

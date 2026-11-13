import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, newRecoveryCodes, otpauthUri, totpAt, verifyTotp } from "./totp";

// RFC 6238 Appendix B secret "12345678901234567890" (SHA-1). 8-digit values from the RFC, last 6 digits = our 6-digit code.
const SECRET = base32Encode(Buffer.from("12345678901234567890"));
test("RFC 6238 test vectors", () => {
  const vectors: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];
  for (const [t, code] of vectors) assert.equal(totpAt(SECRET, Math.floor(t / 30)), code, `t=${t}`);
});
test("base32 round-trips", () => {
  const b = Buffer.from("hello world, 20b!!!!!!");
  assert.deepEqual(base32Decode(base32Encode(b)), b);
  assert.throws(() => base32Decode("not*base32"));
});
test("accepts +-1 step, rejects further drift", () => {
  const now = 1_700_000_000_000, step = Math.floor(now / 30_000);
  assert.equal(verifyTotp(SECRET, totpAt(SECRET, step), now, null), step);
  assert.equal(verifyTotp(SECRET, totpAt(SECRET, step - 1), now, null), step - 1);
  assert.equal(verifyTotp(SECRET, totpAt(SECRET, step + 1), now, null), step + 1);
  assert.equal(verifyTotp(SECRET, totpAt(SECRET, step - 2), now, null), null);
});
test("a step cannot be used twice (replay)", () => {
  const now = 1_700_000_000_000, step = Math.floor(now / 30_000), code = totpAt(SECRET, step);
  assert.equal(verifyTotp(SECRET, code, now, step), null);
  assert.equal(verifyTotp(SECRET, code, now, step - 1), step);
});
test("malformed codes are rejected", () => {
  for (const c of ["", "12345", "1234567", "abcdef", "12 456"]) assert.equal(verifyTotp(SECRET, c, 0, null), null);
});
test("recovery codes: 10 unique, well-formed", () => {
  const c = newRecoveryCodes();
  assert.equal(new Set(c).size, 10);
  for (const x of c) assert.match(x, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
});
test("otpauth uri carries secret and issuer", () => {
  const u = otpauthUri("ABC", "a@b.co");
  assert.match(u, /^otpauth:\/\/totp\/OTPProvider:a%40b\.co\?secret=ABC&issuer=OTPProvider/);
});

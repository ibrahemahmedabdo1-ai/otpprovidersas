import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decryptString, encryptString, generateOtp, hashOtp, hmacHex, newApiKey, safeEqualHex } from "./crypto";

test("OTP codes are numeric, the requested length, and not degenerate", () => {
  assert.match(generateOtp(6), /^\d{6}$/);
  assert.match(generateOtp(4), /^\d{4}$/);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(generateOtp(6));
  assert.ok(seen.size > 190);
});
test("OTP hash is bound to the request id and never contains the code", () => {
  const h = hashOtp("pepper", "req-1", "123456");
  assert.equal(h, hashOtp("pepper", "req-1", "123456"));
  assert.notEqual(h, hashOtp("pepper", "req-2", "123456"));
  assert.notEqual(h, hashOtp("other", "req-1", "123456"));
  assert.ok(!h.includes("123456") && h.length === 64);
});
test("API key: format, displayable prefix, stored value is a hash only", () => {
  const k = newApiKey("test", "pepper");
  assert.match(k.key, /^otp_test_[A-Za-z0-9_-]{43}$/);
  assert.equal(k.prefix, k.key.slice(0, 13));
  assert.equal(k.hash, hmacHex("pepper", k.key));
  assert.ok(!k.hash.includes(k.key.slice(9)));
  assert.notEqual(newApiKey("test", "pepper").key, k.key);
  assert.match(newApiKey("live", "pepper").key, /^otp_live_/);
});
test("AES-GCM roundtrip and tamper detection", () => {
  const key = randomBytes(32);
  const e = encryptString("+628123456789", key);
  assert.equal(decryptString(e, key), "+628123456789");
  assert.notEqual(encryptString("+628123456789", key), e);
  const parts = e.split("."); parts[3] = Buffer.from("x" + parts[3]).toString("base64url");
  assert.throws(() => decryptString(parts.join("."), key));
  assert.throws(() => decryptString(e, randomBytes(32)));
});
test("constant-time compare", () => { assert.ok(safeEqualHex("ab", "ab")); assert.ok(!safeEqualHex("ab", "ac")); assert.ok(!safeEqualHex("ab", "abc")); });

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCouponInput } from "./coupons";

test("a valid coupon is normalised: upper-case code, USD to micro-USD, defaults", () => {
  const r = parseCouponInput({ code: " welcome-5 ", name: "Welcome", creditUsd: 5 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { code: "WELCOME-5", name: "Welcome", creditMicro: 5_000_000, maxRedemptions: null, maxPerOrg: 1, expiresAt: null });
});

test("decimals up to 4 places, chosen limits and a future expiry are accepted", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const r = parseCouponInput({ code: "SPRING", name: "Spring", creditUsd: "0.0125", maxRedemptions: 50, maxPerOrg: 3, expiresAt: "2026-06-01T00:00:00Z" }, now);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.creditMicro, 12_500); assert.equal(r.value.maxRedemptions, 50); assert.equal(r.value.maxPerOrg, 3); }
});

test("bad input is refused field by field", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const r = parseCouponInput({ code: "a", name: "x", creditUsd: 0, maxRedemptions: 0, maxPerOrg: 101, expiresAt: "2020-01-01" }, now);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.fields).sort(), ["code", "creditUsd", "expiresAt", "maxPerOrg", "maxRedemptions", "name"]);
  assert.equal(parseCouponInput({ code: "OK1", name: "Ok", creditUsd: 5000 }).ok, false);
  assert.equal(parseCouponInput({ code: "OK1", name: "Ok", creditUsd: "1.23456" }).ok, false);
});

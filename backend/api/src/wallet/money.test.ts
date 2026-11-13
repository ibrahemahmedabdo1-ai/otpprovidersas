import test from "node:test";
import assert from "node:assert/strict";
import { microToUsd, parseUsdAmount, walletView } from "./money";

test("micro-USD formatting is exact", () => {
  assert.equal(microToUsd(0n), "0.00");
  assert.equal(microToUsd(25_000_000n), "25.00");
  assert.equal(microToUsd(1_500_000), "1.50");
  assert.equal(microToUsd("1234567"), "1.234567");
  assert.equal(microToUsd(50_000n), "0.05");
  assert.equal(microToUsd(-2_500_000n), "-2.50");
  assert.equal(microToUsd(9_007_199_254_740_993n), "9007199254.740993");   // beyond Number precision
});
test("amount parsing: text based, 2 decimals max, bounded, no float surprises", () => {
  assert.deepEqual(parseUsdAmount("25"), { ok: true, value: 25_000_000n });
  assert.deepEqual(parseUsdAmount(12.5), { ok: true, value: 12_500_000n });
  assert.deepEqual(parseUsdAmount("0.10").ok, false);          // below minimum
  assert.deepEqual(parseUsdAmount("1.00"), { ok: true, value: 1_000_000n });
  assert.deepEqual(parseUsdAmount("10000"), { ok: true, value: 10_000_000_000n });
  for (const bad of ["10000.01", "0", "-5", "1.234", "abc", "", "1e3", "1,5", null, undefined, {}, 1e21, NaN]) assert.equal(parseUsdAmount(bad).ok, false, String(bad));
  assert.deepEqual(parseUsdAmount(0.1 + 0.2).ok, false);        // 0.30000000000000004 is rejected, not rounded
});
test("wallet view: available = paid + promotional - reserved", () => {
  const v = walletView({ paid: 10_000_000n, promo: 2_000_000n, reserved: 500_000n, pending: 25_000_000n });
  assert.equal(v.available.usd, "11.50"); assert.equal(v.paid.usd, "10.00"); assert.equal(v.pending.usd, "25.00"); assert.equal(v.currency, "USD");
});

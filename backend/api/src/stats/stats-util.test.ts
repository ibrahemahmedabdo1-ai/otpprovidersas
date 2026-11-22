import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryRate, fillDays, isLowBalance, lastDays, microToUsd } from "./stats-util";

test("lastDays returns a continuous UTC axis ending today", () => {
  const d = lastDays(3, new Date("2026-03-02T23:59:00Z"));
  assert.deepEqual(d, ["2026-02-28", "2026-03-01", "2026-03-02"]);
});

test("fillDays keeps real rows and zero-fills the gaps", () => {
  const rows: Record<string, unknown>[] = [{ day: "2026-03-01", sent: 5, delivered: 4 }];
  const out = fillDays(rows, 3, new Date("2026-03-02T10:00:00Z"), ["sent", "delivered"] as const);
  assert.deepEqual(out, [
    { day: "2026-02-28", sent: 0, delivered: 0 },
    { day: "2026-03-01", sent: 5, delivered: 4 },
    { day: "2026-03-02", sent: 0, delivered: 0 },
  ]);
});

test("deliveryRate is null with no attempts and never exceeds 100", () => {
  assert.equal(deliveryRate(0, 0, 0), null);
  assert.equal(deliveryRate(9, 1, 0), 90);
  assert.equal(deliveryRate(1, 1, 1), 33.3);
  assert.equal(deliveryRate(7, 0, 0), 100);
});

test("isLowBalance flags the threshold itself and anything below", () => {
  assert.equal(isLowBalance(999_999), true);
  assert.equal(isLowBalance(1_000_000), true);
  assert.equal(isLowBalance(1_000_001), false);
  assert.equal(isLowBalance(5_000_000, 5_000_000), true);
});

test("microToUsd handles bigint text, null and rounding", () => {
  assert.equal(microToUsd("20000"), 0.02);
  assert.equal(microToUsd(null), 0);
  assert.equal(microToUsd("1500000"), 1.5);
});

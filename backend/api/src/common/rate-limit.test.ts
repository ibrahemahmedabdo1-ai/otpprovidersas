import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "./rate-limit";

test("blocks after the limit with a retry hint, keys are independent, window resets", () => {
  let t = 0;
  const r = new RateLimiter(2, 1000, () => t);
  assert.equal(r.take("a").allowed, true);
  assert.equal(r.take("a").allowed, true);
  const blocked = r.take("a");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(r.take("b").allowed, true);
  t = 1001;
  assert.equal(r.take("a").allowed, true);
});

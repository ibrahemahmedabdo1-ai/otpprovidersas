import test from "node:test"; import assert from "node:assert/strict";
import { selectProvider, CircuitBreaker, type Candidate } from "./index.ts";
const base = (o: Partial<Candidate>): Candidate => ({ id: "x", channel: "email", enabled: true, maintenance: false, priority: 10, weight: 100,
  costMicroUsd: 1000, successRate: 0.99, p95LatencyMs: 300, capacityRemaining: 100, circuit: "closed", health: "healthy", ...o });
test("excludes disabled, maintenance, open-circuit, down, no-capacity, wrong channel, with reasons", () => {
  const d = selectProvider([base({ id: "a", enabled: false }), base({ id: "b", maintenance: true }), base({ id: "c", circuit: "open" }),
    base({ id: "d", health: "down" }), base({ id: "e", capacityRemaining: 0 }), base({ id: "f", channel: "whatsapp" }), base({ id: "ok" })], { channel: "email" });
  assert.equal(d.chosen, "ok");
  assert.deepEqual(d.considered.filter((c) => c.excluded).map((c) => c.excluded).sort(),
    ["circuit open", "disabled", "health down", "maintenance", "no capacity", "wrong channel"]);
});
test("no eligible provider returns null, never a guess", () => assert.equal(selectProvider([base({ enabled: false })], { channel: "email" }).chosen, null));
test("prefers reliable cheaper provider; decision is explainable", () => {
  const d = selectProvider([base({ id: "slow", successRate: 0.9, p95LatencyMs: 2000 }), base({ id: "good", successRate: 0.995, p95LatencyMs: 200 })], { channel: "email" });
  assert.equal(d.chosen, "good"); assert.ok(d.explanation.length > 0 && d.considered.every((c) => c.score !== undefined));
});
test("failover skips provider that already failed", () => {
  const d = selectProvider([base({ id: "a" }), base({ id: "b", successRate: 0.5 })], { channel: "email", failed: ["a"] }); assert.equal(d.chosen, "b");
});
test("country eligibility and unhealthy whatsapp device are not routed", () => {
  const d = selectProvider([base({ id: "w1", channel: "whatsapp", countries: ["ID"] }), base({ id: "w2", channel: "whatsapp", routingEligible: false })], { channel: "whatsapp", country: "AE" });
  assert.equal(d.chosen, null);
});
test("manual override honoured only if eligible", () => {
  assert.equal(selectProvider([base({ id: "a" }), base({ id: "b" })], { channel: "email", override: "b" }).chosen, "b");
  assert.notEqual(selectProvider([base({ id: "a" }), base({ id: "b", maintenance: true })], { channel: "email", override: "b" }).chosen, "b");
});
test("circuit breaker opens, half-opens after cooldown, closes on success", () => {
  let t = 0; const cb = new CircuitBreaker(3, 1000, () => t);
  cb.failure(); cb.failure(); assert.equal(cb.allow(), true); cb.failure(); assert.equal(cb.allow(), false);
  t = 1001; assert.equal(cb.allow(), true); assert.equal(cb.state, "half_open"); cb.failure(); assert.equal(cb.state, "open");
  t = 2100; cb.allow(); cb.success(); assert.equal(cb.state, "closed");
});

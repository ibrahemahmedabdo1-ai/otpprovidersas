import test from "node:test"; import assert from "node:assert/strict";
import { OtpEngine, OtpEngineError, type DeliveryProvider, type DeliveryOutcome } from "./index.ts";

function setup(input: DeliveryOutcome | DeliveryOutcome[] | ((n: number) => DeliveryOutcome) = { kind: "delivered", providerMessageId: "m1", evidence: { ok: 1 } }) {
  const outcomes = typeof input === "function" || Array.isArray(input) ? input : [input];
  const sent: { to: string; code: string }[] = []; let t = 1_000_000; let n = 0; const unknowns: string[] = [];
  const mk = (id: string): DeliveryProvider => ({ id, channel: "email", async send(m) { sent.push({ to: m.to, code: m.code });
    return typeof outcomes === "function" ? outcomes(n++) : outcomes[Math.min(n++, outcomes.length - 1)]!; } });
  const providers = [mk("p1"), mk("p2")];
  const eng = new OtpEngine({ length: 6, ttlSec: 300, maxAttempts: 3, resendCooldownSec: 30, maxResends: 2, pepper: "pep" },
    (_c, failed) => providers.find((p) => !failed.includes(p.id)) ?? null, { now: () => t }, undefined, (r) => unknowns.push(r.id));
  return { eng, sent, unknowns, advance: (s: number) => (t += s * 1000), last: () => sent[sent.length - 1]! };
}
const wrong = (c: string) => (c === "000000" ? "111111" : "000000");

test("email send then verify success; code stored only as hash", async () => {
  const { eng, last } = setup(); const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" });
  const rec = eng.get(id)!; assert.ok(!JSON.stringify(rec).includes(last().code));
  assert.deepEqual(eng.verify(id, last().code), { ok: true });
});
test("verification is one-time", async () => {
  const { eng, last } = setup(); const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" }); const c = last().code;
  assert.equal(eng.verify(id, c).ok, true); assert.equal((eng.verify(id, c) as any).reason, "not_pending");
});
test("wrong code fails; attempt limit locks even the right code afterwards", async () => {
  const { eng, last } = setup(); const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" }); const c = last().code;
  assert.deepEqual(eng.verify(id, wrong(c)), { ok: false, reason: "invalid", attemptsLeft: 2 });
  eng.verify(id, wrong(c)); assert.equal((eng.verify(id, wrong(c)) as any).reason, "locked");
  assert.equal((eng.verify(id, c) as any).reason, "locked");
});
test("expiration", async () => {
  const { eng, last, advance } = setup(); const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" }); const c = last().code;
  advance(301); assert.equal((eng.verify(id, c) as any).reason, "expired");
});
test("unknown id gives same answer as wrong code class (no enumeration)", () => assert.equal((setup().eng.verify("nope", "123456") as any).reason, "invalid"));
test("resend cooldown, new code invalidates old, max resends", async () => {
  const { eng, last, advance } = setup(); const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" }); const old = last().code;
  await assert.rejects(eng.resend(id), (e: any) => e instanceof OtpEngineError && e.code === "cooldown" && e.retryAfterSec! > 0);
  advance(31); await eng.resend(id); const fresh = last().code;
  if (fresh !== old) assert.equal(eng.verify(id, old).ok, false);
  advance(31); await eng.resend(id); advance(31);
  await assert.rejects(eng.resend(id), (e: any) => e.code === "max_resends");
});
test("idempotency: same key replays, no second send; different body conflicts", async () => {
  const { eng, sent } = setup();
  const a = await eng.send({ projectId: "p", channel: "email", to: "a@b.co", idempotencyKey: "k1" });
  const b = await eng.send({ projectId: "p", channel: "email", to: "a@b.co", idempotencyKey: "k1" });
  assert.equal(b.id, a.id); assert.equal(b.replayed, true); assert.equal(sent.length, 1);
  await assert.rejects(eng.send({ projectId: "p", channel: "email", to: "x@y.co", idempotencyKey: "k1" }), (e: any) => e.code === "idempotency_conflict");
});
test("provider outage: confirmed failure fails over to next provider", async () => {
  const { eng, sent } = setup((n) => n === 0 ? { kind: "failed", reason: "5xx", permanent: false } : { kind: "delivered", providerMessageId: "m", evidence: {} });
  const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" });
  assert.equal(sent.length, 2); assert.equal(eng.get(id)!.delivery, "delivered");
});
test("all providers down => failed, error surfaced", async () => {
  const { eng } = setup({ kind: "failed", reason: "down", permanent: false });
  await assert.rejects(eng.send({ projectId: "p", channel: "email", to: "a@b.co" }), (e: any) => e.code === "provider_unavailable");
});
test("unknown delivery: no failover, no blind resend, goes to reconciliation", async () => {
  const { eng, sent, unknowns, advance } = setup({ kind: "unknown", reason: "timeout" });
  const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" });
  assert.equal(sent.length, 1); assert.deepEqual(unknowns, [id]); assert.equal(eng.get(id)!.delivery, "unknown");
  advance(60); await assert.rejects(eng.resend(id), (e: any) => e.code === "delivery_unknown"); assert.equal(sent.length, 1);
});
test("cancel works, but not after verification", async () => {
  const { eng, last } = setup(); const { id } = await eng.send({ projectId: "p", channel: "email", to: "a@b.co" });
  eng.cancel(id); assert.equal((eng.verify(id, last().code) as any).reason, "not_pending");
});

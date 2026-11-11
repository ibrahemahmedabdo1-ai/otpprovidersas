import test from "node:test"; import assert from "node:assert/strict"; import { randomBytes } from "node:crypto";
import * as s from "./index.ts";

const key = s.loadKey(randomBytes(32).toString("base64"));
test("AES-GCM roundtrip and tamper detection", () => {
  const e = s.encrypt("secret-session", key);
  assert.equal(s.decrypt(e, key), "secret-session");
  const parts = e.split("."); parts[3] = Buffer.from("x" + parts[3]).toString("base64url");
  assert.throws(() => s.decrypt(parts.join("."), key));
  assert.throws(() => s.loadKey("c2hvcnQ="));
});
test("OTP is numeric, right length, hashed not plaintext", () => {
  const c = s.generateOtp(6); assert.match(c, /^\d{6}$/);
  const h = s.hashOtp("pep", "req1", c); assert.ok(!h.includes(c) || h.length === 64);
  assert.notEqual(h, s.hashOtp("pep", "req2", c));
});
test("OTP distribution is not degenerate", () => {
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(s.generateOtp(6)); assert.ok(seen.size > 190);
});
test("API key stored as hash only; revocation lookups use hash", () => {
  const k = s.newApiKey("live", "pepper"); assert.match(k.key, /^otp_live_/);
  assert.equal(s.hashApiKey("pepper", k.key), k.hash); assert.ok(!k.hash.includes(k.key));
});
test("webhook signature: valid, tampered, stale, replayed", () => {
  const body = '{"event":"otp.delivered"}', sec = "whsec", now = 1_700_000_000;
  const h = s.signWebhook(sec, body, now); const seen = new Set<string>();
  assert.deepEqual(s.verifyWebhook(sec, body, h, { now, seen }), { ok: true });
  assert.deepEqual(s.verifyWebhook(sec, body, h, { now, seen }), { ok: false, reason: "replayed" });
  assert.equal((s.verifyWebhook(sec, body + " ", h, { now }) as any).reason, "bad_signature");
  assert.equal((s.verifyWebhook(sec, body, h, { now: now + 1000 }) as any).reason, "stale");
  assert.equal((s.verifyWebhook(sec, body, "garbage", { now }) as any).reason, "malformed");
});
test("upload validation checks magic bytes, size, type", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
  assert.equal(s.validateUpload(png, "image/png").ok, true);
  assert.deepEqual(s.validateUpload(png, "application/pdf"), { ok: false, reason: "content_mismatch" });
  assert.deepEqual(s.validateUpload(png, "text/html"), { ok: false, reason: "type_not_allowed" });
  assert.deepEqual(s.validateUpload(new Uint8Array(), "image/png"), { ok: false, reason: "empty" });
  assert.equal(s.safeFilename("../../etc/passwd"), ".._.._etc_passwd".replace("..", ".").replace("..", "."));
});
test("SSRF guard blocks private/internal targets", () => {
  for (const u of ["http://example.com", "https://localhost/x", "https://127.0.0.1", "https://10.0.0.5", "https://192.168.1.1",
    "https://169.254.169.254/latest", "https://[::1]/", "https://user:p@example.com", "https://svc.internal", "not a url"])
    assert.equal(s.isSafeWebhookUrl(u), false, u);
  assert.equal(s.isSafeWebhookUrl("https://hooks.example.com/otp"), true);
});
test("rate limiter blocks after limit and recovers after window", () => {
  let t = 0; const r = new s.RateLimiter(3, 1000, () => t);
  assert.ok(r.take("a").allowed && r.take("a").allowed && r.take("a").allowed);
  assert.equal(r.take("a").allowed, false); assert.ok(r.take("b").allowed);
  t = 1001; assert.ok(r.take("a").allowed);
});

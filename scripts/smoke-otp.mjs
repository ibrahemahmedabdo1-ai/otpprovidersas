// End-to-end check of projects, API keys and the sandbox OTP API against a RUNNING local API.
//   node scripts/smoke-otp.mjs [http://localhost:3001]
// Needs a VERIFIED customer account (create one with smoke-auth.mjs). Credentials via env or prompt:
//   SMOKE_EMAIL, SMOKE_PASSWORD
import { createInterface } from "node:readline/promises";

const base = process.argv[2] ?? "http://localhost:3001";
let email = process.env.SMOKE_EMAIL, password = process.env.SMOKE_PASSWORD;
if (!email || !password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  email ||= (await rl.question("Customer email: ")).trim();
  password ||= await rl.question("Password: ");
  rl.close();
}
let failed = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); if (!cond) failed++; };
const call = async (method, path, { body, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, json };
};
const j = (r) => JSON.stringify(r);
const run = Date.now();
const rcpt = (n) => `otp.smoke.${run}.${n}@example.com`;

let r = await call("POST", "/v1/auth/login", { body: { email, password }, headers: { "x-client-type": "mobile" } });
if (r.status !== 200) { console.log("FAIL  could not log in:", j(r)); process.exit(1); }
const sess = { authorization: `Bearer ${r.json.token}` };

// ---- projects and keys
r = await call("POST", "/v1/console/projects", { body: { name: `Smoke ${run}` }, headers: sess });
check("project created (200/201)", (r.status === 200 || r.status === 201) && r.json?.id, j(r));
const pid = r.json?.id;
r = await call("POST", "/v1/console/projects", { body: { name: `Smoke ${run}` }, headers: sess });
check("duplicate project name rejected (409)", r.status === 409, j(r));
r = await call("POST", "/v1/console/projects", { body: { name: "<b>x</b>" }, headers: sess });
check("invalid project name rejected (400)", r.status === 400, j(r));
r = await call("POST", `/v1/console/projects/${pid}/keys`, { body: { mode: "live" }, headers: sess });
check("live key refused until live mode is enabled (403)", r.status === 403, j(r));
r = await call("POST", `/v1/console/projects/${pid}/keys`, { body: { mode: "test" }, headers: sess });
check("test key created and shown once", (r.status === 200 || r.status === 201) && /^otp_test_/.test(r.json?.key ?? ""), j(r));
const key = r.json?.key, keyId = r.json?.id;
r = await call("GET", `/v1/console/projects/${pid}/keys`, { headers: sess });
check("key list shows prefix only, never the key", r.status === 200 && r.json?.[0]?.prefix === key?.slice(0, 13) && !JSON.stringify(r.json).includes(key.slice(14)), j(r));
r = await call("GET", "/v1/console/projects/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/keys", { headers: sess });
check("someone else's / unknown project looks like not found (404)", r.status === 404, j(r));
const api = { authorization: `Bearer ${key}` };

// ---- OTP API
r = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(1) } });
check("send without API key rejected (401)", r.status === 401, j(r));
r = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(1) }, headers: { authorization: "Bearer otp_test_" + "a".repeat(43) } });
check("send with a made-up key rejected (401)", r.status === 401, j(r));
r = await call("POST", "/v1/otp/send", { body: { channel: "sms", to: "+628123456789" }, headers: api });
check("unsupported channel rejected (400)", r.status === 400, j(r));
r = await call("POST", "/v1/otp/send", { body: { channel: "whatsapp", to: "+628123456789" }, headers: api });
check("WhatsApp is disabled by default for a new project (403)", r.status === 403 && r.json?.error === "channel_disabled", j(r));

r = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(2) }, headers: api });
check("sandbox send created (201) with a sandbox code", r.status === 201 && /^\d{6}$/.test(r.json?.sandbox?.code ?? "") && r.json?.mode === "test", j(r));
const id = r.json?.id, code = r.json?.sandbox?.code;

r = await call("GET", `/v1/otp/${id}`, { headers: api });
check("status hides the code and masks the recipient", r.status === 200 && r.json?.status === "sent" && !JSON.stringify(r.json).includes(code) && /\*\*\*@example\.com$/.test(r.json?.recipient ?? ""), j(r));
const wrong = code === "000000" ? "111111" : "000000";
r = await call("POST", "/v1/otp/verify", { body: { id, code: wrong }, headers: api });
check("wrong code rejected (400) with attempts left", r.status === 400 && r.json?.error === "invalid_code" && r.json?.attemptsLeft === 4, j(r));
r = await call("POST", "/v1/otp/resend", { body: { id }, headers: api });
check("immediate resend blocked by cooldown (429)", r.status === 429 && r.json?.error === "resend_cooldown" && r.json?.retryAfterSec > 0, j(r));
r = await call("POST", "/v1/otp/verify", { body: { id, code }, headers: api });
check("correct code verifies (200)", r.status === 200 && r.json?.verified === true, j(r));
r = await call("POST", "/v1/otp/verify", { body: { id, code }, headers: api });
check("a verified code cannot be used again (409)", r.status === 409, j(r));
r = await call("POST", "/v1/otp/cancel", { body: { id }, headers: api });
check("a verified request cannot be cancelled (409)", r.status === 409, j(r));

// brute force
r = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(3) }, headers: api });
const id3 = r.json?.id, code3 = r.json?.sandbox?.code, bad3 = code3 === "000000" ? "111111" : "000000";
let last;
for (let i = 0; i < 5; i++) last = await call("POST", "/v1/otp/verify", { body: { id: id3, code: bad3 }, headers: api });
check("5 wrong guesses lock the request (429)", last.status === 429 && last.json?.error === "too_many_attempts", j(last));
r = await call("POST", "/v1/otp/verify", { body: { id: id3, code: code3 }, headers: api });
check("even the correct code is refused after the lock (429)", r.status === 429, j(r));

// idempotency
const idem = { ...api, "idempotency-key": `order-${run}` };
const a = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(4) }, headers: idem });
const b = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(4) }, headers: idem });
check("same Idempotency-Key replays the original request, no second send", a.status === 201 && b.status === 200 && a.json?.id === b.json?.id && !b.json?.sandbox, j({ a, b }));
const c = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(5) }, headers: idem });
check("same key with a different recipient is a conflict (422)", c.status === 422, j(c));

// cancel
r = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(6) }, headers: api });
const id6 = r.json?.id, code6 = r.json?.sandbox?.code;
r = await call("POST", "/v1/otp/cancel", { body: { id: id6 }, headers: api });
check("cancel works (200)", r.status === 200 && r.json?.status === "cancelled", j(r));
r = await call("POST", "/v1/otp/verify", { body: { id: id6, code: code6 }, headers: api });
check("a cancelled request cannot be verified (409)", r.status === 409, j(r));

// recipient rate limit (5 per 10 minutes)
const same = rcpt(7);
let lastSend;
for (let i = 0; i < 6; i++) lastSend = await call("POST", "/v1/otp/send", { body: { channel: "email", to: same }, headers: api });
check("6th send to the same recipient within 10 minutes is limited (429)", lastSend.status === 429 && lastSend.json?.error === "recipient_rate_limited", j(lastSend));

// tenant isolation between projects
r = await call("POST", "/v1/console/projects", { body: { name: `Other ${run}` }, headers: sess });
const pid2 = r.json?.id;
r = await call("POST", `/v1/console/projects/${pid2}/keys`, { body: { mode: "test" }, headers: sess });
const otherKey = { authorization: `Bearer ${r.json?.key}` };
r = await call("GET", `/v1/otp/${id}`, { headers: otherKey });
check("another project's key cannot read this OTP request (404)", r.status === 404, j(r));
r = await call("POST", "/v1/otp/verify", { body: { id: id3, code: code3 }, headers: otherKey });
check("another project's key cannot verify it either (404)", r.status === 404, j(r));

// revoke
r = await call("DELETE", `/v1/console/projects/${pid}/keys/${keyId}`, { headers: sess });
check("key revoked (204)", r.status === 204, j(r));
r = await call("POST", "/v1/otp/send", { body: { channel: "email", to: rcpt(8) }, headers: api });
check("a revoked key stops working immediately (401)", r.status === 401, j(r));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);

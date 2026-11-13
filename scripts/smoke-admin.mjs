// End-to-end check of staff MFA and admin deposit approval against a RUNNING local API.
//   node scripts/smoke-admin.mjs [http://localhost:3001]
// Needs: a verified customer (SMOKE_EMAIL / SMOKE_PASSWORD, e.g. from smoke-auth.mjs) and a THROWAWAY super admin
// (ADMIN_EMAIL / ADMIN_PASSWORD) created with: ROLE=super_admin ALLOW_SECOND_SUPER_ADMIN=1 pnpm create-staff
// This script ENROLLS the throwaway admin in MFA itself and discards the secret, so never point it at your real admin.
import { createHmac } from "node:crypto";

const base = process.argv[2] ?? "http://localhost:3001";
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Set ${k}`); process.exit(1); } return v; };
const cust = { email: need("SMOKE_EMAIL"), password: need("SMOKE_PASSWORD") };
const adm = { email: need("ADMIN_EMAIL"), password: need("ADMIN_PASSWORD") };

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32d = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret, step) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = createHmac("sha1", b32d(secret)).update(c).digest(); return String((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1e6).padStart(6, "0"); };
const nowStep = () => Math.floor(Date.now() / 30000);

let failed = 0;
const check = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); if (!c) failed++; };
const call = async (m, p, { body, tok } = {}) => {
  const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", "x-client-type": "mobile", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, json };
};
const j = JSON.stringify;

// ---- customer: ask for a top-up
let r = await call("POST", "/v1/auth/login", { body: cust });
const ctok = r.json?.token;
check("customer logs in without MFA", r.status === 200 && ctok && !r.json.mfa, j(r));
r = await call("POST", "/v1/console/wallet/deposits", { tok: ctok, body: { amountUsd: "7.00", note: `smoke admin ${Date.now()}` } });
check("customer requests a deposit", r.status === 201, j(r));
const dep = r.json?.id;
const before = (await call("GET", "/v1/console/wallet", { tok: ctok })).json;

// ---- admin: password only -> pending session
r = await call("POST", "/v1/auth/login", { body: adm });
check("staff login returns an MFA-pending session", r.status === 200 && r.json?.mfa?.required === true, j(r));
let atok = r.json?.token;
const enrolled = r.json?.mfa?.enrolled;
r = await call("GET", "/v1/admin/deposits", { tok: atok });
check("pending session cannot reach admin routes (403 mfa_required)", r.status === 403 && r.json?.error === "mfa_required", j(r));
r = await call("GET", "/v1/auth/me", { tok: atok });
check("pending session can still call /me and sees mfaPending", r.status === 200 && r.json?.mfaPending === true, j(r));

let secret;
if (!enrolled) {
  r = await call("POST", "/v1/auth/mfa/setup", { tok: atok });
  secret = r.json?.secret;
  check("MFA setup returns a secret and otpauth URI", r.status === 200 && secret && r.json.otpauthUri?.startsWith("otpauth://totp/"), j(r));
  r = await call("POST", "/v1/auth/mfa/confirm", { tok: atok, body: { code: "000000" } });
  check("wrong code does not confirm enrolment (400)", r.status === 400, j(r));
  const used = nowStep();
  r = await call("POST", "/v1/auth/mfa/confirm", { tok: atok, body: { code: totp(secret, used) } });
  check("correct code confirms enrolment and returns 10 recovery codes", r.status === 200 && r.json?.recoveryCodes?.length === 10, j(r));
  r = await call("GET", "/v1/admin/deposits", { tok: atok });
  check("after enrolment the same session reaches admin routes (200)", r.status === 200, j(r));

  // new login: the step used for enrolment must be refused, the next one accepted
  r = await call("POST", "/v1/auth/login", { body: adm });
  atok = r.json?.token;
  check("second login is MFA-pending and enrolled", r.json?.mfa?.required === true && r.json?.mfa?.enrolled === true, j(r));
  r = await call("POST", "/v1/auth/mfa/verify", { tok: atok, body: { code: totp(secret, used) } });
  check("replaying the already-used TOTP step is refused (403)", r.status === 403, j(r));
  r = await call("POST", "/v1/auth/mfa/verify", { tok: atok, body: { code: totp(secret, used + 1) } });
  check("the next TOTP step verifies (200)", r.status === 200 && r.json?.verified === true, j(r));
} else {
  console.log("SKIP  this admin is already enrolled; use a fresh throwaway admin to test enrolment");
  process.exit(1);
}

// ---- admin actions
r = await call("GET", "/v1/admin/deposits?status=requested", { tok: atok });
check("admin sees the requested deposit", r.status === 200 && r.json?.some((d) => d.id === dep), j(r));
r = await call("POST", `/v1/admin/deposits/${dep}/approve`, { tok: atok, body: {} });
check("approving without a receipt note is refused (400)", r.status === 400, j(r));
r = await call("POST", `/v1/admin/deposits/${dep}/approve`, { tok: atok, body: { receiptNote: "smoke test: funds verified" } });
check("approve with receipt note credits (200, credited=true)", r.status === 200 && r.json?.credited === true, j(r));
r = await call("POST", `/v1/admin/deposits/${dep}/approve`, { tok: atok, body: { receiptNote: "smoke test: funds verified" } });
check("approving again credits nothing more (credited=false)", r.status === 200 && r.json?.credited === false, j(r));
const after = (await call("GET", "/v1/console/wallet", { tok: ctok })).json;
check("customer wallet paid balance rose by exactly 7.00 USD", (after?.paid?.microUsd ?? NaN) - (before?.paid?.microUsd ?? NaN) === 7_000_000, j({ before, after }));
r = await call("GET", "/v1/admin/deposits", { tok: ctok });
check("a customer cannot use admin routes (403)", r.status === 403, j(r));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
console.log("Now delete the throwaway admin (ask Claude for the one-line cleanup).");
process.exit(failed ? 1 : 0);

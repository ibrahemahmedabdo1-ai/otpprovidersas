// End-to-end check of support tickets against a RUNNING local API.
//   node scripts/smoke-tickets.mjs [http://localhost:3001]
// Needs: a verified customer (SMOKE_EMAIL / SMOKE_PASSWORD) and a THROWAWAY support user (SUPPORT_EMAIL / SUPPORT_PASSWORD)
// created with: ROLE=support_staff pnpm create-staff. The script enrolls that user in MFA itself and discards the secret.
import { createHmac } from "node:crypto";

const base = process.argv[2] ?? "http://localhost:3001";
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Set ${k}`); process.exit(1); } return v; };
const cust = { email: need("SMOKE_EMAIL"), password: need("SMOKE_PASSWORD") };
const adm = { email: need("SUPPORT_EMAIL"), password: need("SUPPORT_PASSWORD") };

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


let r = await call("POST", "/v1/auth/login", { body: cust });
const ctok = r.json?.token;
check("customer logs in", r.status === 200 && ctok, j(r));
const subject = `smoke ticket ${Date.now()}`;
r = await call("POST", "/v1/console/tickets", { tok: ctok, body: { subject, body: "Hello, I need help." } });
check("customer opens a ticket (201)", r.status === 201 && r.json?.id, j(r));
const tid = r.json?.id;
r = await call("POST", "/v1/console/tickets", { tok: ctok, body: { subject: "x", body: "" } });
check("invalid ticket is refused (400)", r.status === 400, j(r));
r = await call("GET", "/v1/console/tickets/00000000-0000-4000-8000-000000000000", { tok: ctok });
check("unknown ticket is 404", r.status === 404, j(r));

r = await call("POST", "/v1/auth/login", { body: adm });
let stok = r.json?.token;
check("support login is MFA-pending", r.status === 200 && r.json?.mfa?.required === true, j(r));
r = await call("GET", "/v1/support/tickets", { tok: stok });
check("pending session cannot read tickets (403)", r.status === 403, j(r));
if (r.json?.mfa?.enrolled === true || (await call("GET", "/v1/auth/me", { tok: stok })).json?.mfaVerified) { /* continue */ }
r = await call("POST", "/v1/auth/mfa/setup", { tok: stok });
const secret = r.json?.secret;
check("MFA setup returns a secret", r.status === 200 && secret, j(r));
r = await call("POST", "/v1/auth/mfa/confirm", { tok: stok, body: { code: totp(secret, nowStep()) } });
check("MFA confirm works", r.status === 200, j(r));

r = await call("GET", "/v1/support/tickets?status=open", { tok: stok });
check("support lists open tickets including ours", r.status === 200 && r.json.some((t) => t.id === tid), j(r).slice(0, 200));
r = await call("POST", `/v1/support/tickets/${tid}/notes`, { tok: stok, body: { body: "INTERNAL-SECRET-NOTE" } });
check("support adds an internal note", r.status === 200, j(r));
r = await call("POST", `/v1/support/tickets/${tid}/assign`, { tok: stok });
check("support assigns the ticket to self", r.status === 200, j(r));
r = await call("POST", `/v1/support/tickets/${tid}/reply`, { tok: stok, body: { body: "We are looking into it." } });
check("support replies publicly", r.status === 200, j(r));
r = await call("GET", `/v1/support/tickets/${tid}`, { tok: stok });
check("support sees 3 messages incl. the internal one", r.status === 200 && r.json.messages.length === 3 && r.json.messages.some((m) => m.kind === "internal"), j(r).slice(0, 300));

r = await call("GET", `/v1/console/tickets/${tid}`, { tok: ctok });
const txt = j(r.json);
check("customer sees the public reply but NOT the internal note or any staff e-mail", r.status === 200 && txt.includes("We are looking into it.") && !txt.includes("INTERNAL-SECRET-NOTE") && !txt.includes(adm.email), txt.slice(0, 300));
check("ticket moved to pending_customer after the reply", r.json?.ticket?.status === "pending_customer", j(r.json?.ticket));
r = await call("POST", `/v1/console/tickets/${tid}/reply`, { tok: ctok, body: { body: "Thanks!" } });
check("customer replies (200)", r.status === 200, j(r));
r = await call("GET", `/v1/console/tickets/${tid}`, { tok: ctok });
check("customer reply reopens the ticket", r.json?.ticket?.status === "open", j(r.json?.ticket));
r = await call("GET", `/v1/support/tickets/${tid}`, { tok: ctok });
check("customer cannot use the staff endpoint (403)", r.status === 403, j(r));
r = await call("GET", "/v1/support/tickets", { tok: ctok });
check("customer cannot list staff tickets (403)", r.status === 403, j(r));
r = await call("POST", `/v1/support/tickets/${tid}/status`, { tok: stok, body: { status: "bogus" } });
check("invalid status is refused (400)", r.status === 400, j(r));
r = await call("POST", `/v1/support/tickets/${tid}/status`, { tok: stok, body: { status: "closed" } });
check("support closes the ticket", r.status === 200, j(r));
r = await call("POST", `/v1/console/tickets/${tid}/reply`, { tok: ctok, body: { body: "late" } });
check("customer cannot reply to a closed ticket (409)", r.status === 409, j(r));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);

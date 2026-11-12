// End-to-end check of the auth flow against a RUNNING local API (pnpm dev in backend/api).
//   node scripts/smoke-auth.mjs [http://localhost:3001]
// In development the verification link is printed in the API server console; paste it (or just the token) when asked.
import { createInterface } from "node:readline/promises";

const base = process.argv[2] ?? "http://localhost:3001";
const email = `smoke+${Date.now()}@example.com`;
const password = "correct horse battery staple 42";
let failed = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); if (!cond) failed++; };
const call = async (method, path, { body, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, json };
};

let r = await call("POST", "/v1/auth/register", { body: { email, password, name: "Smoke Test" } });
check("register accepted (202)", r.status === 202, JSON.stringify(r));
r = await call("POST", "/v1/auth/register", { body: { email, password, name: "Smoke Test" } });
check("registering the same email gives the same answer (no enumeration)", r.status === 202, JSON.stringify(r));
r = await call("POST", "/v1/auth/register", { body: { email: "bad", password: "short" } });
check("invalid input rejected (400)", r.status === 400 && r.json?.fields?.email && r.json?.fields?.password, JSON.stringify(r));

r = await call("POST", "/v1/auth/login", { body: { email, password } });
check("login blocked until email verified (403)", r.status === 403 && r.json?.error === "email_not_verified", JSON.stringify(r));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pasted = (await rl.question(`\nPaste the verification link (or token) from the API console for ${email}:\n> `)).trim();
rl.close();
const token = pasted.includes("token=") ? new URL(pasted).searchParams.get("token") : pasted;

r = await call("POST", "/v1/auth/verify-email", { body: { token } });
check("email verified (200)", r.status === 200, JSON.stringify(r));
r = await call("POST", "/v1/auth/verify-email", { body: { token } });
check("verification token cannot be reused (400)", r.status === 400, JSON.stringify(r));

const wrongPw = await call("POST", "/v1/auth/login", { body: { email, password: "totally wrong password" } });
const noUser = await call("POST", "/v1/auth/login", { body: { email: "nobody@example.com", password: "totally wrong password" } });
check("wrong password and unknown email look identical (401)", wrongPw.status === 401 && noUser.status === 401 && JSON.stringify(wrongPw.json) === JSON.stringify(noUser.json), JSON.stringify({ wrongPw, noUser }));

r = await call("POST", "/v1/auth/login", { body: { email, password }, headers: { "x-client-type": "mobile" } });
check("login succeeds (200) and returns a bearer token for native clients", r.status === 200 && typeof r.json?.token === "string", JSON.stringify(r));
const auth = { authorization: `Bearer ${r.json?.token}` };

r = await call("GET", "/v1/auth/me", { headers: auth });
check("GET /me returns the customer with an organization", r.status === 200 && r.json?.email === email && r.json?.role === "customer" && r.json?.organizationId, JSON.stringify(r));
r = await call("GET", "/v1/auth/me");
check("GET /me without credentials is rejected (401)", r.status === 401, JSON.stringify(r));
r = await call("GET", "/v1/auth/me", { headers: { authorization: "Bearer " + "a".repeat(43) } });
check("GET /me with a made-up token is rejected (401)", r.status === 401, JSON.stringify(r));

r = await call("GET", "/v1/auth/sessions", { headers: auth });
check("session list contains the current session", r.status === 200 && r.json?.some((s) => s.current), JSON.stringify(r));
r = await call("DELETE", "/v1/auth/sessions/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", { headers: auth });
check("revoking a session that is not yours behaves like not found (404)", r.status === 404, JSON.stringify(r));

r = await call("POST", "/v1/auth/logout", { headers: { ...auth, origin: "https://evil.example" } });
check("cross-site POST is blocked by the Origin check (403)", r.status === 403 && r.json?.error === "origin_not_allowed", JSON.stringify(r));

r = await call("POST", "/v1/auth/logout", { headers: auth });
check("logout (204)", r.status === 204, JSON.stringify(r));
r = await call("GET", "/v1/auth/me", { headers: auth });
check("token stops working after logout (401)", r.status === 401, JSON.stringify(r));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);

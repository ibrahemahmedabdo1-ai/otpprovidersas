// Checks the wallet endpoints against a RUNNING local API. Needs a VERIFIED customer account.
//   SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/smoke-wallet.mjs [http://localhost:3001]
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
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
};
const j = (x) => JSON.stringify(x);

let r = await call("POST", "/v1/auth/login", { body: { email, password }, headers: { "x-client-type": "mobile" } });
if (r.status !== 200) { console.log("FAIL  could not log in:", j(r)); process.exitCode = 1; } else {
  const sess = { authorization: `Bearer ${r.json.token}` };
  const before = await call("GET", "/v1/console/wallet", { headers: sess });
  check("wallet balance returns all five figures in USD", before.status === 200 && before.json?.currency === "USD" && ["paid", "promotional", "reserved", "pending", "available"].every((k) => before.json?.[k]?.usd), j(before));
  const pend0 = Number(before.json?.pending?.microUsd ?? 0), avail0 = Number(before.json?.available?.microUsd ?? 0);

  r = await call("POST", "/v1/console/wallet/deposits", { body: { amountUsd: "0.50" }, headers: sess });
  check("amount below the minimum rejected (400)", r.status === 400, j(r));
  r = await call("POST", "/v1/console/wallet/deposits", { body: { amountUsd: "abc" }, headers: sess });
  check("non-numeric amount rejected (400)", r.status === 400, j(r));
  r = await call("POST", "/v1/console/wallet/deposits", { body: { amountUsd: 12.345 }, headers: sess });
  check("more than 2 decimals rejected (400)", r.status === 400, j(r));
  r = await call("POST", "/v1/console/wallet/deposits", { body: { amountUsd: "25.00", note: "smoke test" }, headers: sess });
  check("top-up request recorded (201), no payment collected", r.status === 201 && r.json?.status === "requested" && r.json?.amountUsd === "25.00", j(r));
  const depId = r.json?.id;

  const after = await call("GET", "/v1/console/wallet", { headers: sess });
  check("pending increased by 25 USD, available balance did NOT change", Number(after.json?.pending?.microUsd) === pend0 + 25_000_000 && Number(after.json?.available?.microUsd) === avail0, j(after));
  r = await call("GET", "/v1/console/wallet/deposits", { headers: sess });
  check("deposit list shows the request as 'requested'", r.status === 200 && r.json?.some((d) => d.id === depId && d.status === "requested"), j(r));
  r = await call("POST", `/v1/console/wallet/deposits/${depId}/approve`, { body: {}, headers: sess });
  check("a customer has no way to approve a deposit (404)", r.status === 404, j(r));
  r = await call("GET", "/v1/console/wallet/transactions?limit=5", { headers: sess });
  check("transaction history paginates (200)", r.status === 200 && Array.isArray(r.json?.items) && "nextBefore" in r.json, j(r));
  r = await call("GET", "/v1/console/wallet/transactions?before=abc", { headers: sess });
  check("bad cursor rejected (400)", r.status === 400, j(r));
  r = await call("GET", "/v1/console/wallet");
  check("wallet without a session is rejected (401)", r.status === 401, j(r));

  // developer API
  const run = Date.now();
  r = await call("POST", "/v1/console/projects", { body: { name: `Wallet smoke ${run}` }, headers: sess });
  r = await call("POST", `/v1/console/projects/${r.json?.id}/keys`, { body: { mode: "test" }, headers: sess });
  const api = { authorization: `Bearer ${r.json?.key}` };
  r = await call("GET", "/v1/balance", { headers: api });
  check("GET /v1/balance (API key) returns available and reserved only", r.status === 200 && r.json?.available?.usd && r.json?.reserved?.usd && !("paid" in r.json), j(r));
  r = await call("GET", "/v1/usage", { headers: api });
  check("GET /v1/usage (API key) returns the 30-day usage list", r.status === 200 && r.json?.periodDays === 30 && Array.isArray(r.json?.items), j(r));
  r = await call("GET", "/v1/balance");
  check("GET /v1/balance without a key is rejected (401)", r.status === 401, j(r));
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exitCode = failed ? 1 : 0;
}

// Creates/updates .env from .env.example, generating all secrets locally. Secret values are never printed.
//   node scripts/init-env.mjs            fills only missing secrets, keeps everything else
//   node scripts/init-env.mjs --rotate   regenerates ALL secrets (database URLs are kept)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const rotate = process.argv.includes("--rotate");
const b64 = (n) => randomBytes(n).toString("base64");
const GENERATED = {
  AUTH_SECRET: () => b64(48), SESSION_SECRET: () => b64(48), WEBHOOK_SIGNING_SECRET: () => b64(48),
  API_KEY_PEPPER: () => b64(48), OTP_HASH_PEPPER: () => b64(48), ADMIN_BOOTSTRAP_SECRET: () => b64(48),
  ENCRYPTION_KEY: () => b64(32),
};
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean)
  .map((m) => [m[1], m[2].replace(/\s+#.*$/, "").trim()]));

const existing = existsSync(".env") ? parse(readFileSync(".env", "utf8")) : {};
const out = readFileSync(".env.example", "utf8").split(/\r?\n/).map((line) => {
  const m = /^([A-Z0-9_]+)=/.exec(line);
  if (!m) return line;
  const key = m[1];
  if (GENERATED[key]) return `${key}=${!rotate && existing[key] ? existing[key] : GENERATED[key]()}`;
  if (existing[key]) return `${key}=${existing[key]}`;           // keep anything you already filled in (e.g. database URLs)
  return line.replace(/\s+#.*$/, "");
});
writeFileSync(".env", out.join("\n"));
const missing = ["DATABASE_URL", "DATABASE_URL_DIRECT"].filter((k) => !parse(out.join("\n"))[k]);
console.log(rotate ? "All secrets regenerated." : "Missing secrets generated; existing values kept.");
console.log(missing.length ? "Still to fill in by hand: " + missing.join(", ") : "Database URLs present.");

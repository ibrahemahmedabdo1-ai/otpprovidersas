// Applies SQL migrations in packages/database/migrations in order, once each.
// Usage: DATABASE_URL_DIRECT=postgres://... node scripts/migrate.mjs   (uses psql)
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL_DIRECT (preferred) or DATABASE_URL."); process.exit(1); }
const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "packages/database/migrations");
const psql = (args, input) => spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-At", ...args], { input, encoding: "utf8" });

const probe = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error("psql was not found on PATH. Install the PostgreSQL client tools, or paste each file from packages/database/migrations/ into the Neon SQL Editor (in order).");
  process.exit(1);
}

let r = psql(["-c", "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"]);
if (r.status) { console.error(r.stderr); process.exit(1); }
const applied = new Set(psql(["-c", "SELECT version FROM schema_migrations"]).stdout.split("\n").filter(Boolean));

for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(f)) { console.log("skip   ", f); continue; }
  const sql = `BEGIN;\n${readFileSync(join(dir, f), "utf8")}\nINSERT INTO schema_migrations(version) VALUES ('${f}');\nCOMMIT;`;
  r = psql([], sql);
  if (r.status) { console.error("FAILED ", f, "\n", r.stderr); process.exit(1); }
  console.log("applied", f);
}

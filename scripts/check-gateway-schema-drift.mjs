// Fails when the gateway's startup DDL would change a database that already has every migration applied.
// Usage (after scripts/migrate.mjs): DATABASE_URL_DIRECT=... node scripts/check-gateway-schema-drift.mjs
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL_DIRECT;
if (!url) { console.error("Set DATABASE_URL_DIRECT."); process.exit(1); }
const src = readFileSync(new URL("../services/whatsapp-gateway/index.ts", import.meta.url), "utf8");
const stmts = [...src.matchAll(/await sql`((?:CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS|ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS)[^`]*)`/g)].map((m) => m[1].trim());
if (stmts.length < 5) { console.error(`Expected at least 5 gateway DDL statements, found ${stmts.length}.`); process.exit(1); }

const psql = (input) => spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-At"], { input, encoding: "utf8" });
const fingerprint =
  "SELECT md5(coalesce((SELECT string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' ORDER BY table_name, column_name) FROM information_schema.columns WHERE table_schema='public'),'') || '|' || " +
  "coalesce((SELECT string_agg(indexdef, ',' ORDER BY indexname) FROM pg_indexes WHERE schemaname='public'),'') || '|' || " +
  "coalesce((SELECT string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(oid), ',' ORDER BY conrelid::regclass::text, conname) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype <> 'n'),''));";

const before = psql(fingerprint);
if (before.status) { console.error(before.stderr); process.exit(1); }
const run = psql(stmts.map((s) => s + ";").join("\n"));
if (run.status) { console.error("Gateway DDL failed against the migrated schema:\n" + run.stderr); process.exit(1); }
const after = psql(fingerprint);
if (before.stdout !== after.stdout) { console.error("Schema drift: the gateway startup DDL changed a fully migrated database. Add the missing objects to a migration."); process.exit(1); }
console.log(`No schema drift: ${stmts.length} gateway DDL statements were no-ops on the migrated schema.`);

/**
 * Creates a staff account. There is deliberately no public API for this: the first Super Admin (and any staff) is
 * created by an operator with database access. MFA enrolment happens at first login.
 *
 *   ROLE=super_admin STAFF_EMAIL=you@example.com STAFF_NAME="Your Name" node --env-file=../../.env dist/cli/create-staff.js
 *
 * The password is read from STAFF_PASSWORD, or typed at a hidden prompt. Roles: super_admin | admin_staff | support_staff.
 * A second super_admin is refused unless ALLOW_SECOND_SUPER_ADMIN=1.
 */
import { createInterface } from "node:readline";
import { Pool } from "pg";
import { hashPassword } from "../auth/password";
import { parseDisplayName, parseEmail, parsePassword } from "../auth/validators";
import { loadConfig } from "../config";

const ROLES = ["super_admin", "admin_staff", "support_staff"];

function promptHidden(q: string): Promise<string> {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(q);
    out._writeToOutput = () => undefined;
    rl.question("", (a) => { rl.close(); process.stdout.write("\n"); res(a); });
  });
}

async function main() {
  const cfg = loadConfig(process.env);
  const role = process.env.ROLE ?? "";
  if (!ROLES.includes(role)) throw new Error(`ROLE must be one of ${ROLES.join(", ")}`);
  const email = parseEmail(process.env.STAFF_EMAIL);
  if (!email.ok) throw new Error(`STAFF_EMAIL: ${email.error}`);
  const name = parseDisplayName(process.env.STAFF_NAME ?? "");
  if (!name.ok) throw new Error(`STAFF_NAME: ${name.error}`);
  const raw = process.env.STAFF_PASSWORD ?? (await promptHidden("Password (min 12 chars, hidden): "));
  const pw = parsePassword(raw, email.value);
  if (!pw.ok) throw new Error(`password: ${pw.error}`);

  const pool = new Pool({ connectionString: cfg.databaseUrl, connectionTimeoutMillis: 15000 });
  try {
    if (role === "super_admin" && process.env.ALLOW_SECOND_SUPER_ADMIN !== "1") {
      const ex = await pool.query("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1");
      if (ex.rows[0]) throw new Error("a super_admin already exists (set ALLOW_SECOND_SUPER_ADMIN=1 to add another)");
    }
    const hash = await hashPassword(pw.value);
    const r = await pool.query(
      `INSERT INTO users(email, password_hash, display_name, role, status, email_verified_at, mfa_required)
       VALUES ($1::citext, $2::text, $3::text, $4::text, 'active', now(), true) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email.value, hash, name.value, role]);
    if (!r.rows[0]) throw new Error("that email is already registered");
    await pool.query("INSERT INTO audit_events(actor_id, action, subject_type, subject_id, metadata) VALUES (NULL, 'admin.staff_created_by_cli', 'user', $1::text, $2::jsonb)",
      [r.rows[0].id, JSON.stringify({ role })]);
    console.log(`created ${role}: ${email.value} (id ${r.rows[0].id}). Log in, then set up MFA at /v1/auth/mfa/setup.`);
  } finally { await pool.end(); }
}
main().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });

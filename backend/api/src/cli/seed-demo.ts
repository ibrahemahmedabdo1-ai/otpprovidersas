/**
 * Creates (or resets) four DEMO accounts so every console can be tried end to end:
 * a customer (verified, with a wallet and $5 promotional credit), a support user, an admin and a super admin.
 * Passwords are random, printed ONCE to this terminal and never stored anywhere else.
 *
 *   pnpm seed-demo
 *
 * Refuses to run when NODE_ENV=production. Staff accounts still enroll MFA at first sign-in.
 * Suspend or delete these accounts before real users arrive.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../auth/password";
import { loadConfig } from "../config";

const DEMO = [
  { key: "customer", email: "demo.customer@example.com", name: "Demo Customer", role: "customer", mfa: false },
  { key: "support", email: "demo.support@example.com", name: "Demo Support", role: "support_staff", mfa: true },
  { key: "admin", email: "demo.admin@example.com", name: "Demo Admin", role: "admin_staff", mfa: true },
  { key: "super admin", email: "demo.superadmin@example.com", name: "Demo Super Admin", role: "super_admin", mfa: true },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed-demo refuses to run with NODE_ENV=production");
  const cfg = loadConfig(process.env);
  const pool = new Pool({ connectionString: cfg.databaseUrl, connectionTimeoutMillis: 15000 });
  const out: string[] = [];
  try {
    for (const d of DEMO) {
      const password = randomBytes(15).toString("base64url");   // 20 chars
      const hash = await hashPassword(password);
      await pool.query("BEGIN");
      try {
        const u = await pool.query(
          `INSERT INTO users(email, password_hash, display_name, role, status, email_verified_at, mfa_required)
           VALUES ($1::citext, $2::text, $3::text, $4::text, 'active', now(), $5::boolean)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active', failed_login_count = 0, locked_until = NULL, email_verified_at = COALESCE(users.email_verified_at, now())
           RETURNING id`, [d.email, hash, d.name, d.role, d.mfa]);
        const id = u.rows[0].id as string;
        if (d.role === "customer") {
          let org = await pool.query("SELECT id FROM organizations WHERE owner_user_id = $1::uuid LIMIT 1", [id]);
          if (!org.rows[0]) {
            org = await pool.query("INSERT INTO organizations(name, owner_user_id) VALUES ($1::text, $2::uuid) RETURNING id", ["Demo Organization", id]);
            await pool.query("INSERT INTO memberships(organization_id, user_id, role) VALUES ($1::uuid,$2::uuid,'owner')", [org.rows[0].id, id]);
            const w = await pool.query("INSERT INTO wallets(organization_id) VALUES ($1::uuid) RETURNING id", [org.rows[0].id]);
            await pool.query("SELECT post_ledger_entry($1::uuid,'promo_credit','promo',5000000,$2::text)", [w.rows[0].id, `demo:promo:${w.rows[0].id as string}`]);
          }
        }
        await pool.query("INSERT INTO audit_events(actor_id, action, subject_type, subject_id, metadata) VALUES (NULL,'admin.demo_account_seeded','user',$1::text,$2::jsonb)", [id, JSON.stringify({ role: d.role })]);
        await pool.query("COMMIT");
      } catch (e) { await pool.query("ROLLBACK"); throw e; }
      out.push(`${d.key.padEnd(12)} ${d.email.padEnd(32)} ${password}`);
    }
  } finally { await pool.end(); }
  console.log("\nDEMO ACCOUNTS (shown once; running this again resets the passwords)\n");
  console.log("role         email                            password");
  console.log(out.join("\n"));
  console.log("\nCustomer: http://localhost:3101   Admin: http://localhost:3102   Support: http://localhost:3103");
  console.log("Staff accounts ask you to set up an authenticator app at first sign-in and to save recovery codes.");
}
main().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); });

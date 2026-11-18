import { createInterface } from "node:readline";
import { Pool } from "pg";
import { hashPassword } from "../auth/password";
import { parsePassword } from "../auth/validators";
import { loadConfig } from "../config";

const TARGETS = [
  { email: "modylomy275+customer@gmail.com", role: "customer" },
  { email: "modylomy275+support@gmail.com", role: "support_staff" },
  { email: "modylomy275+admin@gmail.com", role: "admin_staff" },
  { email: "modylomy275@gmail.com", role: "super_admin" },
] as const;

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const writable = rl as unknown as { _writeToOutput: (value: string) => void };
    process.stdout.write(question);
    writable._writeToOutput = () => undefined;
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (process.env.CONFIRM_PRIMARY_ACCOUNT_PASSWORD_RESET !== "YES") {
    throw new Error("Set CONFIRM_PRIMARY_ACCOUNT_PASSWORD_RESET=YES to confirm this four-account reset.");
  }

  const cfg = loadConfig(process.env);
  const rawPassword = process.env.STAFF_PASSWORD ?? await promptHidden("New shared test password (hidden): ");
  for (const target of TARGETS) {
    const parsed = parsePassword(rawPassword, target.email);
    if (!parsed.ok) throw new Error(`Password rejected for ${target.role}: ${parsed.error}`);
  }

  // Hash once with the same Argon2id implementation and parameters used by normal authentication.
  const passwordHash = await hashPassword(rawPassword);
  const pool = new Pool({ connectionString: cfg.databaseUrl, connectionTimeoutMillis: 15000, statement_timeout: 10000 });

  try {
    const result = await pool.connect();
    try {
      await result.query("BEGIN");
      const locked = await result.query(
        "SELECT id, email::text AS email, role, status FROM users WHERE email = ANY($1::citext[]) ORDER BY email FOR UPDATE",
        [TARGETS.map((x) => x.email)],
      );
      if (locked.rows.length !== TARGETS.length) {
        throw new Error(`Expected exactly ${TARGETS.length} target accounts; found ${locked.rows.length}. No changes made.`);
      }
      for (const target of TARGETS) {
        const row = locked.rows.find((x) => String(x.email).toLowerCase() === target.email.toLowerCase());
        if (!row || row.role !== target.role || row.status !== "active") {
          throw new Error(`Target account validation failed for role ${target.role}. No changes made.`);
        }
      }

      let revokedSessions = 0;
      for (const row of locked.rows) {
        await result.query(
          "UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1::uuid",
          [row.id, passwordHash],
        );
        const revoked = await result.query(
          "UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_reset_by_operator' WHERE user_id = $1::uuid AND revoked_at IS NULL RETURNING id",
          [row.id],
        );
        revokedSessions += revoked.rowCount ?? 0;
        await result.query(
          "INSERT INTO audit_events(actor_id, action, subject_type, subject_id, metadata) VALUES (NULL, 'auth.password_reset_by_operator', 'user', $1::text, $2::jsonb)",
          [row.id, JSON.stringify({ method: "operator-cli", role: row.role, scope: "primary-account-test-reset" })],
        );
      }
      await result.query("COMMIT");
      console.log(`Password reset completed for ${locked.rows.length} verified accounts. Revoked sessions: ${revokedSessions}. Audit events: ${locked.rows.length}.`);
      console.log("No password or password hash was printed.");
      console.log("Staff accounts must complete TOTP MFA setup after signing in.");
    } catch (error) {
      await result.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      result.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Password reset failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});

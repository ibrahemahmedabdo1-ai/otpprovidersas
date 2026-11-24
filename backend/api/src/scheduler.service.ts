import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DbService } from "./db.service";

/**
 * Periodic housekeeping. A Postgres advisory lock makes sure only one API instance does the work at a time.
 * Disabled when NODE_ENV=test or SCHEDULER_DISABLED=1.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Scheduler");
  private timer: NodeJS.Timeout | undefined;
  private ticks = 0;
  constructor(private readonly db: DbService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test" || process.env.SCHEDULER_DISABLED === "1" || process.env.VERCEL === "1") return;
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(): Promise<void> {
    try {
      await this.db.tx(async (c) => {
        const lock = await c.query("SELECT pg_try_advisory_xact_lock(hashtext('otp:scheduler')) AS ok");
        if (!lock.rows[0]?.ok) return;
        const otp = await c.query("UPDATE otp_requests SET status = 'expired' WHERE status IN ('pending','sent') AND expires_at <= now()");
        const tok = await c.query("DELETE FROM email_tokens WHERE (used_at IS NOT NULL OR expires_at < now()) AND created_at < now() - interval '7 days'");
        const ses = await c.query("DELETE FROM sessions WHERE (revoked_at IS NOT NULL OR expires_at < now()) AND created_at < now() - interval '30 days'");
        if (++this.ticks % 60 === 1) {   // hourly
          const bad = await c.query("SELECT count(*)::int AS n FROM wallet_reconciliation()");
          if ((bad.rows[0]?.n as number) > 0) this.log.error(`RECONCILIATION MISMATCH: ${bad.rows[0]?.n as number} wallet bucket(s) differ from the ledger. Open Admin > Reconciliation.`);
        }
        if ((otp.rowCount ?? 0) + (tok.rowCount ?? 0) + (ses.rowCount ?? 0) > 0) this.log.log(`expired otp=${otp.rowCount ?? 0}, tokens removed=${tok.rowCount ?? 0}, sessions removed=${ses.rowCount ?? 0}`);
      });
    } catch (e) {
      this.log.error(`tick failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
}

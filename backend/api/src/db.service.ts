import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { loadConfig } from "./config";

/** Make PostgreSQL's current strict TLS behavior explicit and avoid pg-connection-string's future sslmode alias warning. */
export function normalizeDatabaseSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode")?.toLowerCase();
  if (mode === "prefer" || mode === "require" || mode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  private readonly log = new Logger("Database");
  constructor() {
    const cfg = loadConfig(process.env);
    // Serverless instances are short-lived and can scale horizontally. Keep each instance deliberately small
    // so aggregate connections cannot exhaust Neon; keepalive + a longer cold-start timeout smooths wakeups.
    this.pool = new Pool({ connectionString: normalizeDatabaseSslMode(cfg.databaseUrl), max: 2, min: 0, connectionTimeoutMillis: 30000, idleTimeoutMillis: 10000, keepAlive: true, keepAliveInitialDelayMillis: 10000, statement_timeout: 10000, application_name: "otpprovider-api" });
    this.pool.on("error", (error) => this.log.error(`idle database client error: ${error.message}`));
  }
  async ping(): Promise<boolean> {
    try { await this.pool.query("SELECT 1"); return true; } catch { return false; }
  }
  /** Runs fn inside one transaction; rolls back on any error. */
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; }
    catch (e) { await c.query("ROLLBACK").catch(() => undefined); throw e; }
    finally { c.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}

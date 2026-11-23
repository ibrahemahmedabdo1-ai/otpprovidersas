import { Injectable, OnModuleDestroy } from "@nestjs/common";
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
  constructor() {
    const cfg = loadConfig(process.env);
    // Neon uses strict TLS verification. 15 s connect timeout covers a Neon cold start; queries still time out at 10 s.
    this.pool = new Pool({ connectionString: normalizeDatabaseSslMode(cfg.databaseUrl), max: 10, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
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

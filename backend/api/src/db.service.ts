import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { loadConfig } from "./config";

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    const cfg = loadConfig(process.env);
    // Neon requires TLS; the URL carries sslmode=require. 15 s connect timeout covers a Neon cold start (scale-to-zero resume); queries still time out at 10 s.
    // Be explicit: pg-connection-string warns that "require" will change semantics in a future major release.
    const databaseUrl = new URL(cfg.databaseUrl);
    if (["require", "prefer", "verify-ca"].includes(databaseUrl.searchParams.get("sslmode") ?? "")) {
      databaseUrl.searchParams.set("sslmode", "verify-full");
    }
    this.pool = new Pool({ connectionString: databaseUrl.toString(), max: 10, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
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

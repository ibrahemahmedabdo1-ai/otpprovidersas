import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { loadConfig } from "./config";

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    const cfg = loadConfig(process.env);
    // Neon requires TLS; the URL carries sslmode=require. Short timeouts so a dead DB fails fast.
    this.pool = new Pool({ connectionString: cfg.databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
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

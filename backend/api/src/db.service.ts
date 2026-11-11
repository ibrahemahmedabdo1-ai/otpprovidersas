import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
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
  async onModuleDestroy() { await this.pool.end(); }
}

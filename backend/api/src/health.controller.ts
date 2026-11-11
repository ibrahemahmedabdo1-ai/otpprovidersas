import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { DbService } from "./db.service";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DbService) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get("live")
  live() { return { status: "ok" }; }

  /** Readiness: dependencies reachable. Returns 503 without leaking error details. */
  @Get("ready")
  async ready() {
    const database = await this.db.ping();
    if (!database) throw new HttpException({ status: "unavailable", checks: { database: "down" } }, HttpStatus.SERVICE_UNAVAILABLE);
    return { status: "ok", checks: { database: "up" } };
  }
}

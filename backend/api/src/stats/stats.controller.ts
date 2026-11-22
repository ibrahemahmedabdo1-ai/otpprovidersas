import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { StatsService } from "./stats.service";

@Controller("v1/console/stats")
@UseGuards(AuthGuard)
export class ConsoleStatsController {
  constructor(private readonly stats: StatsService) {}
  @Get() get(@Req() req: AuthedRequest) { return this.stats.customer(req.auth!); }
}

@Controller("v1/admin/stats")
@UseGuards(AuthGuard)
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}
  @Get() get(@Req() req: AuthedRequest) { return this.stats.admin(req.auth!); }
}

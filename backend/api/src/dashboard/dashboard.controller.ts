import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { DashboardService } from "./dashboard.service";
@Controller("v1/dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboards: DashboardService) {}
  @Get("support") support(@Req() req: AuthedRequest) { return this.dashboards.support(req.auth!); }
  @Get("admin") admin(@Req() req: AuthedRequest) { return this.dashboards.admin(req.auth!); }
}
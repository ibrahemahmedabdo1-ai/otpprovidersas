import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { AdminService } from "./admin.service";

/** Staff only; AuthGuard already refuses sessions that have not completed MFA. */
@Controller("v1/admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get("deposits") deposits(@Req() req: AuthedRequest, @Query("status") status?: string) { return this.admin.listDeposits(req.auth!, status); }
  @Post("deposits/:id/approve") @HttpCode(200) approve(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.admin.approveDeposit(req.auth!, id, body, req.ip); }
  @Post("deposits/:id/reject") @HttpCode(200) reject(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.admin.rejectDeposit(req.auth!, id, body, req.ip); }
  @Post("deposits/:id/request-approval") @HttpCode(201) requestApproval(@Param("id") id: string, @Req() req: AuthedRequest) { return this.admin.requestApproval(req.auth!, id, req.ip); }
  @Get("users") users(@Req() req: AuthedRequest, @Query("q") q?: string) { return this.admin.listUsers(req.auth!, q); }
  @Get("audit") audit(@Req() req: AuthedRequest, @Query("action") action?: string) { return this.admin.listAudit(req.auth!, action); }
  @Get("approvals") approvals(@Req() req: AuthedRequest) { return this.admin.listApprovals(req.auth!); }
  @Post("approvals/:id/decide") @HttpCode(200) decide(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.admin.decideApproval(req.auth!, id, body, req.ip); }
}

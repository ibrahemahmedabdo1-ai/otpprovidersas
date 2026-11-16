import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { TicketsService } from "./tickets.service";

/** Customer side: own organization's tickets only. */
@Controller("v1/console/tickets")
@UseGuards(AuthGuard)
export class CustomerTicketsController {
  constructor(private readonly t: TicketsService) {}
  @Get() list(@Req() req: AuthedRequest) { return this.t.customerList(req.auth!); }
  @Post() @HttpCode(201) create(@Body() body: unknown, @Req() req: AuthedRequest) { return this.t.customerCreate(req.auth!, body, req.ip); }
  @Get(":id") get(@Param("id") id: string, @Req() req: AuthedRequest) { return this.t.customerGet(req.auth!, id); }
  @Post(":id/reply") @HttpCode(200) reply(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.t.customerReply(req.auth!, id, body, req.ip); }
}

/** Staff side (MFA-verified sessions only, enforced by AuthGuard). */
@Controller("v1/support/tickets")
@UseGuards(AuthGuard)
export class SupportTicketsController {
  constructor(private readonly t: TicketsService) {}
  @Get() list(@Req() req: AuthedRequest, @Query("status") status?: string) { return this.t.staffList(req.auth!, status); }
  @Get(":id") get(@Param("id") id: string, @Req() req: AuthedRequest) { return this.t.staffGet(req.auth!, id); }
  @Post(":id/reply") @HttpCode(200) reply(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.t.staffPost(req.auth!, id, false, body, req.ip); }
  @Post(":id/notes") @HttpCode(200) note(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.t.staffPost(req.auth!, id, true, body, req.ip); }
  @Post(":id/assign") @HttpCode(200) assign(@Param("id") id: string, @Req() req: AuthedRequest) { return this.t.assignToMe(req.auth!, id, req.ip); }
  @Post(":id/status") @HttpCode(200) status(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.t.setStatus(req.auth!, id, body, req.ip); }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { WebhooksService } from "./webhooks.service";

@Controller("v1/console/projects")
@UseGuards(AuthGuard)
export class WebhooksController {
  constructor(private readonly w: WebhooksService) {}
  @Get(":id/webhooks") list(@Param("id") id: string, @Req() req: AuthedRequest) { return this.w.list(req.auth!, id); }
  @Post(":id/webhooks") @HttpCode(201) create(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.w.create(req.auth!, id, body, req.ip); }
  @Delete(":id/webhooks/:hookId") @HttpCode(204) remove(@Param("id") id: string, @Param("hookId") hookId: string, @Req() req: AuthedRequest) { return this.w.remove(req.auth!, id, hookId, req.ip); }
  @Post(":id/webhooks/:hookId/test") @HttpCode(202) test(@Param("id") id: string, @Param("hookId") hookId: string, @Req() req: AuthedRequest) { return this.w.sendTest(req.auth!, id, hookId); }
  @Get(":id/webhooks/:hookId/deliveries") deliveries(@Param("id") id: string, @Param("hookId") hookId: string, @Req() req: AuthedRequest) { return this.w.deliveries(req.auth!, id, hookId); }
}

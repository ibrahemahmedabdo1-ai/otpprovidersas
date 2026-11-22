import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { TopupWorkflowService } from "./topup-workflow.service";

@Controller("v1/console/topups")
@UseGuards(AuthGuard)
export class CustomerTopupController {
  constructor(private readonly service: TopupWorkflowService) {}
  @Post() @HttpCode(201) create(@Body() body: unknown,@Req() req: AuthedRequest){return this.service.create(req.auth!,body,req.ip);}
}
@Controller("v1/support/deposits")
@UseGuards(AuthGuard)
export class SupportTopupController {
  constructor(private readonly service: TopupWorkflowService) {}
  @Get() list(@Req() req: AuthedRequest){return this.service.supportList(req.auth!);}
  @Post(":id/submit") @HttpCode(200) submit(@Param("id") id:string,@Body() body:unknown,@Req() req:AuthedRequest){return this.service.submit(req.auth!,id,body,req.ip);}
}

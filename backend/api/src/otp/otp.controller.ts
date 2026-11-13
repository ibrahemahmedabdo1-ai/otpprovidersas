import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiKeyGuard, type ApiRequest } from "./api-key.guard";
import { OtpService } from "./otp.service";

/** Developer API, authenticated with a project API key (Authorization: Bearer otp_test_...). */
@Controller("v1/otp")
@UseGuards(ApiKeyGuard)
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post("send")
  async send(@Body() body: unknown, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.otp.send(req.apiKey!, body, req.header("idempotency-key"), req.header("x-correlation-id") ?? "n/a", req.ip);
    res.status(r.status);
    return r.body;
  }
  @Post("verify") @HttpCode(200)
  verify(@Body() body: unknown, @Req() req: ApiRequest) { return this.otp.verify(req.apiKey!, body, req.ip); }

  @Post("resend") @HttpCode(200)
  resend(@Body() body: unknown, @Req() req: ApiRequest) { return this.otp.resend(req.apiKey!, body, req.ip); }

  @Post("cancel") @HttpCode(200)
  cancel(@Body() body: unknown, @Req() req: ApiRequest) { return this.otp.cancel(req.apiKey!, body, req.ip); }

  @Get(":id")
  get(@Param("id") id: string, @Req() req: ApiRequest) { return this.otp.get(req.apiKey!, id); }
}

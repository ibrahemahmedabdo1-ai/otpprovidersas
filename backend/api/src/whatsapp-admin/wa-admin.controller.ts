import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { WhatsAppAdminService } from "./wa-admin.service";

/** Staff only (Admin / Super Admin). Support is refused in the service. Customer sending is NOT exposed here. */
@Controller("v1/admin/whatsapp")
@UseGuards(AuthGuard)
export class WhatsAppAdminController {
  constructor(private readonly wa: WhatsAppAdminService) {}
  @Get("devices") devices(@Req() req: AuthedRequest) { return this.wa.devices(req.auth!); }
  @Patch("devices/:deviceId/routing") setRouting(@Param("deviceId") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.wa.setRouting(req.auth!, id, body, req.ip); }
  @Post("test-send") @HttpCode(202) testSend(@Body() body: unknown, @Req() req: AuthedRequest) { return this.wa.testSend(req.auth!, body, req.ip); }
  @Get("test-jobs/:jobId") testJob(@Param("jobId") id: string, @Req() req: AuthedRequest) { return this.wa.testJob(req.auth!, id); }
  @Get("storage-health") storageHealth(@Req() req: AuthedRequest) { return this.wa.kvHealth(req.auth!); }
  @Get("receipts/:messageId") receipts(@Param("messageId") id: string, @Req() req: AuthedRequest) { return this.wa.receipts(req.auth!, id); }
}

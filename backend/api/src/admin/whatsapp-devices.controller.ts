import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { WhatsAppDevicesService } from "./whatsapp-devices.service";

@Controller("v1/admin/whatsapp-devices")
@UseGuards(AuthGuard)
export class WhatsAppDevicesController {
  constructor(private readonly devices: WhatsAppDevicesService) {}
  @Get() list(@Req() req: AuthedRequest) { return this.devices.list(req.auth!); }
  @Post() @HttpCode(201) create(@Body() body: unknown, @Req() req: AuthedRequest) { return this.devices.create(req.auth!, body, req.ip); }
  @Get(":id/qr") qr(@Param("id") id: string, @Req() req: AuthedRequest) { return this.devices.qr(req.auth!, id); }
  @Post(":id/reconnect") @HttpCode(202) reconnect(@Param("id") id: string, @Req() req: AuthedRequest) { return this.devices.reconnect(req.auth!, id, req.ip); }
  @Delete(":id") @HttpCode(200) remove(@Param("id") id: string, @Req() req: AuthedRequest) { return this.devices.remove(req.auth!, id, req.ip); }
}
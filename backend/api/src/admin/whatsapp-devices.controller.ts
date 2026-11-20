import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { WhatsappDevicesService } from "./whatsapp-devices.service";

@Controller("v1/admin/whatsapp-devices")
@UseGuards(AuthGuard)
export class WhatsappDevicesController {
  constructor(private readonly devices: WhatsappDevicesService) {}
  @Get() list(@Req() r: AuthedRequest) { return this.devices.list(r.auth!); }
  @Post() @HttpCode(201) create(@Body() b: unknown, @Req() r: AuthedRequest) { return this.devices.create(r.auth!, b, r.ip ?? null); }
  @Patch(":id") @HttpCode(200) rename(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.devices.rename(r.auth!, id, b, r.ip ?? null); }
  @Post(":id/reconnect") @HttpCode(202) reconnect(@Param("id") id: string, @Req() r: AuthedRequest) { return this.devices.reconnect(r.auth!, id, r.ip ?? null); }
  @Delete(":id") @HttpCode(200) remove(@Param("id") id: string, @Req() r: AuthedRequest) { return this.devices.remove(r.auth!, id, r.ip ?? null); }
}

import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { CatalogService } from "./catalog.service";

@Controller("v1/admin")
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly s: CatalogService) {}
  @Get("packages") packages(@Req() r: AuthedRequest) { return this.s.packages(r.auth!); }
  @Post("packages") @HttpCode(201) createPackage(@Body() b: unknown, @Req() r: AuthedRequest) { return this.s.createPackage(r.auth!, b, r.ip ?? null); }
  @Post("packages/:id/set") @HttpCode(200) setPackage(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.s.setPackage(r.auth!, id, b, r.ip ?? null); }
  @Get("prices") prices(@Req() r: AuthedRequest) { return this.s.prices(r.auth!); }
  @Post("prices") @HttpCode(201) createPrice(@Body() b: unknown, @Req() r: AuthedRequest) { return this.s.createPrice(r.auth!, b, r.ip ?? null); }
  @Post("prices/:id/approve") @HttpCode(200) approvePrice(@Param("id") id: string, @Req() r: AuthedRequest) { return this.s.approvePrice(r.auth!, id, r.ip ?? null); }
  @Get("providers") providers(@Req() r: AuthedRequest) { return this.s.providers(r.auth!); }
  @Post("providers/:id/set") @HttpCode(200) setProvider(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.s.setProvider(r.auth!, id, b, r.ip ?? null); }
  @Post("users/:id/status") @HttpCode(200) userStatus(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.s.setUserStatus(r.auth!, id, b, r.ip ?? null); }
}

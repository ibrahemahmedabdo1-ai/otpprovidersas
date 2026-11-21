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
  @Get("company") company(@Req() r: AuthedRequest) { return this.s.company(r.auth!); }
  @Post("company") @HttpCode(200) setCompany(@Body() b: unknown, @Req() r: AuthedRequest) { return this.s.setCompany(r.auth!, b, r.ip ?? null); }
  @Get("tickets") tickets(@Req() r: AuthedRequest) { return this.s.tickets(r.auth!); }
  @Get("webhook-deliveries") deliveries(@Req() r: AuthedRequest) { return this.s.deliveries(r.auth!); }
  @Get("organizations") orgs(@Req() r: AuthedRequest) { return this.s.orgs(r.auth!); }
  @Post("staff") @HttpCode(201) createStaff(@Body() b: unknown, @Req() r: AuthedRequest) { return this.s.createStaff(r.auth!, b, r.ip ?? null); }
  @Post("organizations/:id/verification") @HttpCode(200) setVerification(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.s.setVerification(r.auth!, id, b, r.ip ?? null); }
  @Post("organizations/:id/update") @HttpCode(200) updateOrg(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.s.updateOrg(r.auth!, id, b, r.ip ?? null); }
  @Post("users/:id/status") @HttpCode(200) userStatus(@Param("id") id: string, @Body() b: unknown, @Req() r: AuthedRequest) { return this.s.setUserStatus(r.auth!, id, b, r.ip ?? null); }
}

/** Unauthenticated: only the company details an admin chose to publish. */
@Controller("v1/public")
export class PublicController {
  constructor(private readonly s: CatalogService) {}
  @Get("pricing") pricing() { return this.s.publicPricing(); }
  @Get("company") company() { return this.s.publicCompany(); }
}

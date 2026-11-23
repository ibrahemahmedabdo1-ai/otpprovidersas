import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { ApiKeyGuard, type ApiRequest } from "../otp/api-key.guard";
import { WalletService } from "./wallet.service";
import { SupportDepositsService } from "./support-deposits.service";

/** Customer dashboard (session). */
@Controller("v1/console/wallet")
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get() balance(@Req() req: AuthedRequest) { return this.wallet.balance(req.auth!); }
  @Get("transactions") transactions(@Req() req: AuthedRequest, @Query("limit") limit?: string, @Query("before") before?: string) { return this.wallet.transactions(req.auth!, limit, before); }
  @Post("coupons/redeem") @HttpCode(200) redeemCoupon(@Body() body: unknown, @Req() req: AuthedRequest) { return this.wallet.redeemCoupon(req.auth!, body, req.ip); }
  @Get("deposits") deposits(@Req() req: AuthedRequest) { return this.wallet.deposits(req.auth!); }
  @Post("deposits") @HttpCode(201) requestDeposit(@Body() body: unknown, @Req() req: AuthedRequest) { return this.wallet.requestDeposit(req.auth!, body, req.ip); }
}

/** Developer API (API key): GET /v1/balance and GET /v1/usage. */
@Controller("v1")
@UseGuards(ApiKeyGuard)
export class DeveloperController {
  constructor(private readonly wallet: WalletService) {}
  @Get("balance") balance(@Req() req: ApiRequest) { return this.wallet.balanceByWalletId(req.apiKey!.walletId); }
  @Get("usage") usage(@Req() req: ApiRequest) { return this.wallet.usage(req.apiKey!.projectId); }
}

/** Support queue of top-up requests. Support submits evidence; only an administrator can approve (admin routes). */
@Controller("v1/support/deposits")
@UseGuards(AuthGuard)
export class SupportDepositsController {
  constructor(private readonly svc: SupportDepositsService) {}
  @Get() list(@Req() req: AuthedRequest) { return this.svc.list(req.auth!); }
  @Post(":id/submit") @HttpCode(200) submit(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.svc.submit(req.auth!, id, body, req.ip); }
}

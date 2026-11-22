import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { ApiKeyGuard, type ApiRequest } from "../otp/api-key.guard";
import { WalletService } from "./wallet.service";
import { TopupWorkflowService } from "../deposits/topup-workflow.service";

/** Customer dashboard (session). */
@Controller("v1/console/wallet")
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService, private readonly topups: TopupWorkflowService) {}
  @Get() balance(@Req() req: AuthedRequest) { return this.wallet.balance(req.auth!); }
  @Get("transactions") transactions(@Req() req: AuthedRequest, @Query("limit") limit?: string, @Query("before") before?: string) { return this.wallet.transactions(req.auth!, limit, before); }
  @Get("deposits") deposits(@Req() req: AuthedRequest) { return this.wallet.deposits(req.auth!); }
  @Post("deposits") @HttpCode(201) requestDeposit(@Body() body: unknown, @Req() req: AuthedRequest) { return this.topups.create(req.auth!, body, req.ip); }
}

/** Developer API (API key): GET /v1/balance and GET /v1/usage. */
@Controller("v1")
@UseGuards(ApiKeyGuard)
export class DeveloperController {
  constructor(private readonly wallet: WalletService) {}
  @Get("balance") balance(@Req() req: ApiRequest) { return this.wallet.balanceByWalletId(req.apiKey!.walletId); }
  @Get("usage") usage(@Req() req: ApiRequest) { return this.wallet.usage(req.apiKey!.projectId); }
}

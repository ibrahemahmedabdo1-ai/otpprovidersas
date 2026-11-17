import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res, UseGuards, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import { RateLimiter } from "../common/rate-limit";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { AllowPendingMfa, AuthGuard, SESSION_COOKIE, type AuthedRequest } from "./auth.guard";

@Controller("v1/auth")
export class AuthController {
  private registerLimit = new RateLimiter(5, 60 * 60_000);       // 5 sign-ups / hour / IP
  private loginIpLimit = new RateLimiter(20, 15 * 60_000);       // 20 attempts / 15 min / IP
  private loginEmailLimit = new RateLimiter(10, 15 * 60_000);    // 10 attempts / 15 min / email
  private verifyLimit = new RateLimiter(20, 15 * 60_000);
  private forgotIpLimit = new RateLimiter(10, 60 * 60_000);    // 10 reset requests / hour / IP
  private forgotEmailLimit = new RateLimiter(3, 60 * 60_000);   // 3 / hour / address
  constructor(private readonly auth: AuthService, private readonly mfa: MfaService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  private limit(l: RateLimiter, key: string) {
    const r = l.take(key);
    if (!r.allowed) throw new HttpException({ error: "rate_limited", retryAfterSec: r.retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }

  @Post("register") @HttpCode(202)
  async register(@Body() body: unknown, @Req() req: Request) {
    this.limit(this.registerLimit, req.ip ?? "?");
    await this.auth.register(body, req.ip);
    return { status: "accepted", message: "If this email can be registered, a verification email has been sent." };
  }

  @Post("password/forgot") @HttpCode(202)
  async forgot(@Body() body: unknown, @Req() req: Request) {
    this.limit(this.forgotIpLimit, req.ip ?? "?");
    const e = (body as { email?: unknown } | null)?.email;
    if (typeof e === "string") this.limit(this.forgotEmailLimit, e.trim().toLowerCase().slice(0, 254));
    await this.auth.forgotPassword(body, req.ip);
    return { status: "accepted", message: "If this email belongs to an account, a reset link has been sent." };
  }

  @Post("password/reset") @HttpCode(200)
  async reset(@Body() body: unknown, @Req() req: Request) {
    this.limit(this.verifyLimit, req.ip ?? "?");
    await this.auth.resetPassword(body, req.ip);
    return { status: "reset" };
  }

  @Post("verify-email") @HttpCode(200)
  async verifyEmail(@Body() body: unknown, @Req() req: Request) {
    this.limit(this.verifyLimit, req.ip ?? "?");
    await this.auth.verifyEmail((body as { token?: unknown } | null)?.token);
    return { status: "verified" };
  }

  @Post("login") @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const email = String((body as { email?: unknown } | null)?.email ?? "").toLowerCase().slice(0, 254);
    this.limit(this.loginIpLimit, req.ip ?? "?");
    this.limit(this.loginEmailLimit, email);
    const mobile = req.header("x-client-type") === "mobile";
    const r = await this.auth.login(body, req.ip, req.header("user-agent"), mobile);
    res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, secure: this.cfg.nodeEnv === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, r.expires.getTime() - Date.now()) });
    return { user: r.user, expiresAt: r.expires, ...(r.mfa ? { mfa: r.mfa } : {}), ...(mobile ? { token: r.token } : {}) };   // bearer token only for native apps
  }

  @Post("logout") @HttpCode(204) @AllowPendingMfa() @UseGuards(AuthGuard)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth!, req.ip);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("me") @AllowPendingMfa() @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    const a = req.auth!;
    return { id: a.userId, email: a.email, name: a.displayName, role: a.role, organizationId: a.organizationId, mfaVerified: a.mfaVerified, mfaPending: a.mfaPending };
  }

  @Get("sessions") @UseGuards(AuthGuard)
  sessions(@Req() req: AuthedRequest) { return this.auth.listSessions(req.auth!); }

  @Delete("sessions/:id") @HttpCode(204) @UseGuards(AuthGuard)
  async revoke(@Param("id") id: string, @Req() req: AuthedRequest) { await this.auth.revokeSession(req.auth!, id, req.ip); }

  @Post("mfa/setup") @HttpCode(200) @AllowPendingMfa() @UseGuards(AuthGuard)
  mfaSetup(@Req() req: AuthedRequest) { return this.mfa.setup(req.auth!, req.ip); }

  @Post("mfa/confirm") @HttpCode(200) @AllowPendingMfa() @UseGuards(AuthGuard)
  mfaConfirm(@Body() body: unknown, @Req() req: AuthedRequest) { return this.mfa.confirm(req.auth!, body, req.ip); }

  @Post("mfa/verify") @HttpCode(200) @AllowPendingMfa() @UseGuards(AuthGuard)
  mfaVerify(@Body() body: unknown, @Req() req: AuthedRequest) { return this.mfa.verify(req.auth!, body, req.ip); }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService, type AuthContext } from "./auth.service";

export const SESSION_COOKIE = "otp_session";
const ALLOW_PENDING_MFA = "allowPendingMfa";
/** Marks the few routes a password-only (MFA pending) session may reach: MFA setup/verify, whoami, logout. */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
export interface AuthedRequest extends Request { auth?: AuthContext }

export function extractToken(req: Request): string | null {
  const h = req.header("authorization");
  if (h && /^Bearer /i.test(h)) return h.slice(7).trim();
  const cookies = req.header("cookie");
  if (!cookies) return null;
  for (const part of cookies.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Authorization is enforced here on the server; nothing the client sends about its role is trusted. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(req);
    const a = token ? await this.auth.authenticate(token) : null;
    if (!a) throw new UnauthorizedException({ error: "unauthenticated" });
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_MFA, [ctx.getHandler(), ctx.getClass()]) === true;
    if (a.mfaPending && !allowPending) throw new ForbiddenException({ error: "mfa_required" });
    req.auth = a;
    return true;
  }
}

import { BadRequestException, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { LiveOtpDeliveryService } from "./live-otp-delivery.service";

type RawBodyRequest = Request & { rawBody?: Buffer };

/** Resend delivery receipts. The service verifies the Svix signature against the exact raw request bytes. */
@Controller("v1/webhooks/resend")
export class ResendWebhookController {
  constructor(private readonly live: LiveOtpDeliveryService) {}

  @Post()
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest) {
    const headers = {
      "svix-id": req.header("svix-id") ?? undefined,
      "svix-timestamp": req.header("svix-timestamp") ?? undefined,
      "svix-signature": req.header("svix-signature") ?? undefined,
    };
    if (!req.rawBody) throw new BadRequestException({ error: "raw_body_unavailable" });
    return this.live.handleResendWebhook(req.rawBody, headers);
  }
}

import { Controller, ForbiddenException, Headers, HttpCode, Logger, Post } from "@nestjs/common";
import { checkCronSecret } from "./cron-auth";
import { SchedulerService } from "./scheduler.service";
import { LiveOtpDeliveryService } from "./otp/live-otp-delivery.service";
import { WebhooksService } from "./webhooks/webhooks.service";

/** Housekeeping trigger for hosts without a long-running process (serverless). Requires the CRON_SECRET header; disabled when the variable is unset. */
@Controller("v1/internal")
export class InternalController {
  private readonly logger = new Logger(InternalController.name);
  constructor(private readonly scheduler: SchedulerService, private readonly webhooks: WebhooksService, private readonly liveOtp: LiveOtpDeliveryService) {}

  @Post("tick") @HttpCode(200)
  async tick(@Headers("x-cron-secret") given?: string) {
    const result = checkCronSecret(given, process.env.CRON_SECRET);
    if (result !== "ok") {
      // Internal reason code only (no secret material); the response stays a generic 403.
      this.logger.warn(`internal tick rejected: ${result}`);
      throw new ForbiddenException({ error: "forbidden" });
    }
    const whatsappReceiptsReconciled = await this.liveOtp.reconcileWhatsAppReceipts();
    await this.scheduler.tick();
    await this.webhooks.deliverDue();
    return { ok: true, whatsappReceiptsReconciled };
  }
}

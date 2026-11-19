import { Controller, ForbiddenException, Headers, HttpCode, Post } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { SchedulerService } from "./scheduler.service";
import { WebhooksService } from "./webhooks/webhooks.service";

/** Housekeeping trigger for hosts without a long-running process (serverless). Requires the CRON_SECRET header; disabled when the variable is unset. */
@Controller("v1/internal")
export class InternalController {
  constructor(private readonly scheduler: SchedulerService, private readonly webhooks: WebhooksService) {}

  @Post("tick") @HttpCode(200)
  async tick(@Headers("x-cron-secret") given?: string) {
    const want = process.env.CRON_SECRET ?? "";
    const a = Buffer.from(given ?? ""), b = Buffer.from(want);
    if (want.length < 24 || a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException({ error: "forbidden" });
    await this.scheduler.tick();
    await this.webhooks.deliverDue();
    return { ok: true };
  }
}

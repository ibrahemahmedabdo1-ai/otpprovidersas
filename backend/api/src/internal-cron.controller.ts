import { Controller, ForbiddenException, Headers, HttpCode, Post } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { SchedulerService } from "./scheduler.service";
import { WebhooksService } from "./webhooks/webhooks.service";

/**
 * Vercel functions must not own long-lived timers. A Railway cron worker calls
 * this endpoint on a schedule; the secret is compared in constant time.
 */
@Controller("v1/internal/cron")
export class InternalCronController {
  constructor(private readonly scheduler: SchedulerService, private readonly webhooks: WebhooksService) {}

  private authorize(header?: string): void {
    const configured = process.env.CRON_SECRET ?? "";
    const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const a = Buffer.from(configured);
    const b = Buffer.from(supplied);
    if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException({ error: "forbidden" });
    }
  }

  @Post("run")
  @HttpCode(200)
  async run(@Headers("authorization") authorization?: string) {
    this.authorize(authorization);
    await this.scheduler.tick();
    await this.webhooks.deliverDue();
    return { ok: true, tasks: ["scheduler", "webhook-delivery"], executedAt: new Date().toISOString() };
  }
}

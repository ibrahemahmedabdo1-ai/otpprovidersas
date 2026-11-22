import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { MfaService } from "./auth/mfa.service";
import { ConsoleMailer, DisabledMailer, Mailer, ResendMailer } from "./auth/mailer";
import { loadConfig } from "./config";
import { ApiKeyGuard } from "./otp/api-key.guard";
import { OtpController } from "./otp/otp.controller";
import { OtpService } from "./otp/otp.service";
import { LiveOtpDeliveryService } from "./otp/live-otp-delivery.service";
import { ResendWebhookController } from "./otp/resend-webhook.controller";
import { DeveloperController, WalletController } from "./wallet/wallet.controller";
import { WalletService } from "./wallet/wallet.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { InternalController } from "./internal.controller";
import { CatalogController, PublicController } from "./admin/catalog.controller";
import { CatalogService } from "./admin/catalog.service";
import { CustomerTicketsController, SupportTicketsController } from "./tickets/tickets.controller";
import { TicketsService } from "./tickets/tickets.service";
import { SchedulerService } from "./scheduler.service";
import { WebhooksController } from "./webhooks/webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";
import { DbService } from "./db.service";
import { HealthController } from "./health.controller";
import { DashboardController } from "./dashboard/dashboard.controller";
import { DashboardService } from "./dashboard/dashboard.service";
import { CustomerTopupController, SupportTopupController } from "./deposits/topup-workflow.controller";\nimport { CustomerStatusController } from "./deposits/customer-status.controller";
import { TopupWorkflowService } from "./deposits/topup-workflow.service";
import { SystemMapController } from "./dashboard/system-map.controller";
import { SystemMapService } from "./dashboard/system-map.service";
import { CONFIG } from "./tokens";

@Module({
  controllers: [HealthController, DashboardController, SystemMapController, AuthController, ProjectsController, OtpController, ResendWebhookController, WalletController, DeveloperController, AdminController, CatalogController, PublicController, InternalController, CustomerTicketsController, SupportTicketsController, CustomerTopupController, SupportTopupController, CustomerStatusController, WebhooksController],
  providers: [
    DbService, DashboardService, SystemMapService, TopupWorkflowService, AuthService, MfaService, AuthGuard, ProjectsService, OtpService, LiveOtpDeliveryService, ApiKeyGuard, WalletService, AdminService, CatalogService, TicketsService, SchedulerService, WebhooksService,
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: Mailer, useFactory: () => (process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? new ResendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM) : process.env.NODE_ENV === "production" ? new DisabledMailer() : new ConsoleMailer()) },
  ],
})
export class AppModule {}

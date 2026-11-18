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
import { DeveloperController, WalletController } from "./wallet/wallet.controller";
import { WalletService } from "./wallet/wallet.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { CatalogController, PublicController } from "./admin/catalog.controller";
import { CatalogService } from "./admin/catalog.service";
import { CustomerTicketsController, SupportTicketsController } from "./tickets/tickets.controller";
import { TicketsService } from "./tickets/tickets.service";
import { SchedulerService } from "./scheduler.service";
import { WebhooksController } from "./webhooks/webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";
import { DbService } from "./db.service";
import { HealthController } from "./health.controller";
import { CONFIG } from "./tokens";

@Module({
  controllers: [HealthController, AuthController, ProjectsController, OtpController, WalletController, DeveloperController, AdminController, CatalogController, PublicController, CustomerTicketsController, SupportTicketsController, WebhooksController],
  providers: [
    DbService, AuthService, MfaService, AuthGuard, ProjectsService, OtpService, ApiKeyGuard, WalletService, AdminService, CatalogService, TicketsService, SchedulerService, WebhooksService,
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: Mailer, useFactory: () => (process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? new ResendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM) : process.env.NODE_ENV === "production" ? new DisabledMailer() : new ConsoleMailer()) },
  ],
})
export class AppModule {}

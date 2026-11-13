import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { ConsoleMailer, DisabledMailer, Mailer } from "./auth/mailer";
import { loadConfig } from "./config";
import { ApiKeyGuard } from "./otp/api-key.guard";
import { OtpController } from "./otp/otp.controller";
import { OtpService } from "./otp/otp.service";
import { DeveloperController, WalletController } from "./wallet/wallet.controller";
import { WalletService } from "./wallet/wallet.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { DbService } from "./db.service";
import { HealthController } from "./health.controller";
import { CONFIG } from "./tokens";

@Module({
  controllers: [HealthController, AuthController, ProjectsController, OtpController, WalletController, DeveloperController],
  providers: [
    DbService, AuthService, AuthGuard, ProjectsService, OtpService, ApiKeyGuard, WalletService,
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: Mailer, useFactory: () => (process.env.NODE_ENV === "production" ? new DisabledMailer() : new ConsoleMailer()) },
  ],
})
export class AppModule {}

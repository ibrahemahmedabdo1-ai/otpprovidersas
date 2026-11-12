import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { ConsoleMailer, DisabledMailer, Mailer } from "./auth/mailer";
import { loadConfig } from "./config";
import { DbService } from "./db.service";
import { HealthController } from "./health.controller";
import { CONFIG } from "./tokens";

@Module({
  controllers: [HealthController, AuthController],
  providers: [
    DbService, AuthService, AuthGuard,
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: Mailer, useFactory: () => (process.env.NODE_ENV === "production" ? new DisabledMailer() : new ConsoleMailer()) },
  ],
})
export class AppModule {}

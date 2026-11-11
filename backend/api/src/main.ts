import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";

async function bootstrap() {
  const cfg = loadConfig(process.env);           // refuse to start with bad configuration
  const app = await NestFactory.create(AppModule, { logger: ["log", "warn", "error"] });
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // Correlation ID on every request/response; security headers.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header("x-correlation-id");
    const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("x-correlation-id", id);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    next();
  });

  app.enableCors({ origin: cfg.corsOrigins, credentials: true });
  app.enableShutdownHooks();                      // graceful shutdown: closes the DB pool
  await app.listen(cfg.port);
  console.log(`API listening on :${cfg.port} (${cfg.nodeEnv})`);
}
bootstrap().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });

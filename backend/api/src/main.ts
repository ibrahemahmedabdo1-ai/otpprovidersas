import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";
import { SAFE_METHODS, isOriginAllowed } from "./common/origin";

async function bootstrap() {
  const cfg = loadConfig(process.env);           // refuse to start with bad configuration
  const app = await NestFactory.create(AppModule, { logger: ["log", "warn", "error"], rawBody: true });
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // Correlation ID on every request/response; security headers.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header("x-correlation-id");
    const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    req.headers["x-correlation-id"] = id;
    res.setHeader("x-correlation-id", id);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    next();
  });

  const prod = cfg.nodeEnv === "production";
  // CSRF: state-changing requests from a browser must come from an allowed Origin.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!SAFE_METHODS.has(req.method) && !isOriginAllowed(req.header("origin"), cfg.corsOrigins, prod)) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    next();
  });
  app.enableCors({ origin: (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => cb(null, isOriginAllowed(o, cfg.corsOrigins, prod)), credentials: true });
  app.enableShutdownHooks();                      // graceful shutdown: closes the DB pool
  await app.listen(cfg.port);
  console.log(`API listening on :${cfg.port} (${cfg.nodeEnv})`);
}
bootstrap().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });

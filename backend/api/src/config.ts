export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
}

/** Fails fast with ALL problems listed. Never echoes secret values in errors. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const errors: string[] = [];
  const nodeEnv = (env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
  if (!["development", "test", "production"].includes(nodeEnv)) errors.push("NODE_ENV must be development, test or production");

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("PORT must be an integer between 1 and 65535");

  const databaseUrl = env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) errors.push("DATABASE_URL must be a postgres:// or postgresql:// URL");

  for (const name of ["AUTH_SECRET", "SESSION_SECRET", "API_KEY_PEPPER", "OTP_HASH_PEPPER"]) {
    const v = env[name] ?? "";
    if (v.length < 32) errors.push(`${name} must be set and at least 32 characters`);
  }
  if (Buffer.from(env.ENCRYPTION_KEY ?? "", "base64").length !== 32) errors.push("ENCRYPTION_KEY must be base64 of exactly 32 bytes");

  const corsOrigins = (env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (nodeEnv === "production" && corsOrigins.length === 0) errors.push("CORS_ALLOWED_ORIGINS is required in production");
  if (corsOrigins.includes("*")) errors.push("CORS_ALLOWED_ORIGINS must not contain *");

  if (errors.length) throw new Error("Invalid configuration:\n - " + errors.join("\n - "));
  return { nodeEnv, port, databaseUrl, corsOrigins };
}

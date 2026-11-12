import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadConfig } from "./config";

const good = () => ({
  DATABASE_URL: "postgresql://u:p@host/db?sslmode=require",
  AUTH_SECRET: "a".repeat(40), SESSION_SECRET: "b".repeat(40), API_KEY_PEPPER: "c".repeat(40), OTP_HASH_PEPPER: "d".repeat(40),
  ENCRYPTION_KEY: randomBytes(32).toString("base64"),
});

test("valid configuration loads with defaults", () => {
  const c = loadConfig(good());
  assert.equal(c.port, 3001); assert.equal(c.nodeEnv, "development");
});
test("lists every problem at once and never echoes secret values", () => {
  const env = { ...good(), AUTH_SECRET: "short-secret-value", ENCRYPTION_KEY: "c2hvcnQ=", DATABASE_URL: "mysql://x" };
  try { loadConfig(env); assert.fail("should throw"); } catch (e) {
    const m = (e as Error).message;
    assert.match(m, /AUTH_SECRET/); assert.match(m, /ENCRYPTION_KEY/); assert.match(m, /DATABASE_URL/);
    assert.ok(!m.includes("short-secret-value"));
  }
});
test("production requires explicit CORS origins; wildcard rejected", () => {
  assert.throws(() => loadConfig({ ...good(), NODE_ENV: "production" }), /CORS_ALLOWED_ORIGINS is required/);
  assert.throws(() => loadConfig({ ...good(), CORS_ALLOWED_ORIGINS: "*" }), /must not contain \*/);
  assert.deepEqual(loadConfig({ ...good(), NODE_ENV: "production", APP_BASE_URL: "https://otpprovider.com", CORS_ALLOWED_ORIGINS: "https://a.com, https://b.com" }).corsOrigins, ["https://a.com", "https://b.com"]);
});
test("invalid port rejected", () => assert.throws(() => loadConfig({ ...good(), PORT: "99999" }), /PORT/));
test("APP_BASE_URL defaults for dev, trailing slash trimmed, https enforced in production", () => {
  assert.equal(loadConfig(good()).appBaseUrl, "http://localhost:3000");
  assert.equal(loadConfig({ ...good(), APP_BASE_URL: "https://otpprovider.com/" }).appBaseUrl, "https://otpprovider.com");
  assert.throws(() => loadConfig({ ...good(), NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "https://a.com", APP_BASE_URL: "http://a.com" }), /https in production/);
});

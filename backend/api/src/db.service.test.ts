import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDatabaseSslMode } from "./db.service";

test("normalizes legacy strict SSL aliases to verify-full", () => {
  const input = "postgresql://user:password@db.example.test/neondb?sslmode=require&connect_timeout=15";
  const result = new URL(normalizeDatabaseSslMode(input));
  assert.equal(result.searchParams.get("sslmode"), "verify-full");
  assert.equal(result.searchParams.get("connect_timeout"), "15");
});

test("preserves an explicit verify-full mode", () => {
  const input = "postgresql://user:password@db.example.test/neondb?sslmode=verify-full";
  assert.equal(new URL(normalizeDatabaseSslMode(input)).searchParams.get("sslmode"), "verify-full");
});

test("does not force TLS settings for local URLs without sslmode", () => {
  const input = "postgresql://user:password@localhost:5432/otp";
  assert.equal(new URL(normalizeDatabaseSslMode(input)).searchParams.has("sslmode"), false);
});

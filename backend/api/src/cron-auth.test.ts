import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCronSecret } from "./cron-auth";

const SECRET = "a".repeat(32);

test("accepts the exact secret", () => {
  assert.equal(checkCronSecret(SECRET, SECRET), "ok");
});

test("rejects a wrong secret of the same length", () => {
  assert.equal(checkCronSecret("b".repeat(32), SECRET), "mismatch");
});

test("rejects a wrong secret of a different length", () => {
  assert.equal(checkCronSecret("a".repeat(31), SECRET), "mismatch");
});

test("rejects a missing header", () => {
  assert.equal(checkCronSecret(undefined, SECRET), "missing_header");
  assert.equal(checkCronSecret("", SECRET), "missing_header");
});

test("endpoint is disabled when the server secret is unset", () => {
  assert.equal(checkCronSecret(SECRET, undefined), "not_configured");
  assert.equal(checkCronSecret("", ""), "not_configured");
});

test("endpoint is disabled when the server secret is shorter than the minimum", () => {
  const short = "a".repeat(23);
  assert.equal(checkCronSecret(short, short), "not_configured");
});

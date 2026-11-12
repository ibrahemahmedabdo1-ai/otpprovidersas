import test from "node:test";
import assert from "node:assert/strict";
import { isTokenShape, isUuid, parseDisplayName, parseEmail, parseLocale, parsePassword } from "./validators";

test("email is trimmed, lower-cased and validated", () => {
  assert.deepEqual(parseEmail("  Ibrahim@Example.COM "), { ok: true, value: "ibrahim@example.com" });
  for (const bad of ["", "no-at", "a@b", "a b@c.com", 5, null, undefined, "a@b.c", "x".repeat(250) + "@a.com"]) assert.equal(parseEmail(bad).ok, false, String(bad));
});
test("password policy: length, common passwords, repeated chars, contains email name", () => {
  assert.equal(parsePassword("short").ok, false);
  assert.equal(parsePassword("x".repeat(129)).ok, false);
  assert.equal(parsePassword("password1234").ok, false);
  assert.equal(parsePassword("aaaaaaaaaaaaaa").ok, false);
  assert.equal(parsePassword("ibrahim-is-great-1", "ibrahim@example.com").ok, false);
  assert.equal(parsePassword("correct horse battery staple", "ibrahim@example.com").ok, true);
  assert.equal(parsePassword(undefined).ok, false);
});
test("display name: optional, bounded, no control characters or angle brackets", () => {
  assert.deepEqual(parseDisplayName(undefined), { ok: true, value: "" });
  assert.deepEqual(parseDisplayName("  إبراهيم  "), { ok: true, value: "إبراهيم" });
  assert.equal(parseDisplayName("<script>").ok, false);
  assert.equal(parseDisplayName("a\u0000b").ok, false);
  assert.equal(parseDisplayName("x".repeat(81)).ok, false);
});
test("locale allow-list", () => {
  assert.deepEqual(parseLocale(undefined), { ok: true, value: "en" });
  for (const l of ["ar", "en", "ru", "es", "de", "zh"]) assert.equal(parseLocale(l).ok, true);
  assert.equal(parseLocale("fr").ok, false);
});
test("uuid and token shape guards", () => {
  assert.equal(isUuid("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"), true);
  assert.equal(isUuid("1; DROP TABLE users"), false);
  assert.equal(isTokenShape("a".repeat(43)), true);
  assert.equal(isTokenShape("short"), false);
  assert.equal(isTokenShape("a".repeat(43) + "'; --"), false);
});

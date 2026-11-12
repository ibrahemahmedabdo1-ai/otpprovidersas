import test from "node:test";
import assert from "node:assert/strict";
import { burnPasswordTime, hashPassword, verifyPassword } from "./password";

test("Argon2id hashing: correct password verifies, wrong one does not, salts differ", async () => {
  const h = await hashPassword("correct horse battery staple");
  assert.match(h, /^\$argon2id\$/);
  assert.ok(!h.includes("correct horse"));
  assert.equal(await verifyPassword(h, "correct horse battery staple"), true);
  assert.equal(await verifyPassword(h, "wrong password entirely"), false);
  assert.notEqual(h, await hashPassword("correct horse battery staple"));
});
test("malformed stored hash never throws and never verifies", async () => {
  assert.equal(await verifyPassword("not-a-hash", "whatever"), false);
});
test("dummy verification used for unknown accounts returns false", async () => {
  assert.equal(await burnPasswordTime("anything"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isMessageId, isUuid, maskRecipient, normalizeRecipient, parseAllowlist, validTestMessage } from "./wa-admin-util";

test("recipient is digits only, 8-15 long", () => {
  assert.equal(normalizeRecipient("+20 127 979 7964"), "201279797964");
  assert.equal(normalizeRecipient("123"), null);
  assert.equal(normalizeRecipient(1234567890), null);
});
test("allowlist parsing ignores blanks and formatting", () => {
  assert.deepEqual(parseAllowlist("+20 1279797964, ,966500000000"), ["201279797964", "966500000000"]);
  assert.deepEqual(parseAllowlist(undefined), []);
});
test("recipient is masked in audit data", () => { assert.equal(maskRecipient("201279797964"), "***7964"); });
test("test message limits", () => {
  assert.equal(validTestMessage("  hello "), "hello");
  assert.equal(validTestMessage(""), null);
  assert.equal(validTestMessage("x".repeat(201)), null);
  assert.equal(validTestMessage("a\u0000b"), null);
});
test("ids are validated before being sent to the gateway", () => {
  assert.equal(isUuid("e8428ae3-2aa1-4245-9b8d-e60c9c129229"), true);
  assert.equal(isUuid("../x"), false);
  assert.equal(isMessageId("3EB0ABCDEF123456"), true);
  assert.equal(isMessageId("a/b"), false);
});

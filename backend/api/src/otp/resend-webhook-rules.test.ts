import test from "node:test";
import assert from "node:assert/strict";
import { classifyResendEvent } from "./resend-webhook-rules";

test("only the explicit delivered event is billable", () => {
  assert.equal(classifyResendEvent("email.delivered"), "delivered");
  assert.equal(classifyResendEvent("email.complained"), "complaint");
  assert.equal(classifyResendEvent("email.bounced"), "failed");
  assert.equal(classifyResendEvent("email.failed"), "failed");
  assert.equal(classifyResendEvent("email.sent"), "ignored");
  assert.equal(classifyResendEvent(""), "ignored");
});

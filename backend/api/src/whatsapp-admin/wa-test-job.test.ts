import test from "node:test";
import assert from "node:assert/strict";
import { classifyGatewayAnswer, QUEUED_STALE_SEC, SENDING_STALE_SEC, staleTransition } from "./wa-test-job";

test("a queued job the gateway never claimed fails only after the stale window", () => {
  assert.equal(staleTransition("queued", QUEUED_STALE_SEC - 1), null);
  assert.deepEqual(staleTransition("queued", QUEUED_STALE_SEC), { to: "failed", error: "gateway_did_not_start" });
});

test("a claimed job with no outcome becomes unknown, never failed (it may have been sent)", () => {
  assert.equal(staleTransition("sending", SENDING_STALE_SEC - 1), null);
  assert.deepEqual(staleTransition("sending", SENDING_STALE_SEC), { to: "unknown", error: "sending_outcome_unknown" });
});

test("terminal states never transition", () => {
  for (const s of ["accepted", "failed", "unknown"]) assert.equal(staleTransition(s, 999999), null);
});

test("202 and an idempotent duplicate mean the gateway owns the job", () => {
  assert.deepEqual(classifyGatewayAnswer(202, { jobId: "x", status: "sending" }), { action: "sending" });
  assert.deepEqual(classifyGatewayAnswer(200, { duplicate: true, status: "accepted" }), { action: "sending" });
});

test("a JSON refusal from the gateway proves nothing was sent", () => {
  assert.deepEqual(classifyGatewayAnswer(503, { error: "device_not_connected" }), { action: "fail", error: "device_not_connected" });
  assert.deepEqual(classifyGatewayAnswer(423, { error: "admin_test_sending_disabled" }), { action: "fail", error: "admin_test_sending_disabled" });
});

test("timeouts, proxy errors and unknown shapes leave the job queued (never assume failure)", () => {
  assert.deepEqual(classifyGatewayAnswer(502, {}), { action: "pending" });
  assert.deepEqual(classifyGatewayAnswer(504, { error: "upstream timeout" }), { action: "pending" });
  assert.deepEqual(classifyGatewayAnswer(200, {}), { action: "pending" });
  assert.deepEqual(classifyGatewayAnswer(500, { error: 5 }), { action: "pending" });
});

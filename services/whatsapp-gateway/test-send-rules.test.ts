import { expect, test } from "bun:test";
import { classifyTestSendFailure, isNoOpenSession, isUuid } from "./test-send-rules";

test("failures before transmission are failed; failures after sendMessage are unknown, never failed", () => {
  expect(classifyTestSendFailure("lookup").status).toBe("failed");
  expect(classifyTestSendFailure("session_refresh").status).toBe("failed");
  expect(classifyTestSendFailure("send").status).toBe("unknown");
  expect(classifyTestSendFailure("send_after_refresh").status).toBe("unknown");
});

test("a timeout while sending is not proof of failure", () => {
  expect(classifyTestSendFailure("send")).toEqual({ status: "unknown", error: "send_outcome_unknown" });
});

test("only the pre-transmission 'No open session' error triggers the single refresh retry", () => {
  expect(isNoOpenSession(new Error("No open session"))).toBe(true);
  expect(isNoOpenSession(new Error("Timed Out"))).toBe(false);
  expect(isNoOpenSession(undefined)).toBe(false);
});

test("job ids must be UUIDs", () => {
  expect(isUuid("3f2b8a52-6c58-4f0e-9d6a-0d3f4a7c9b11")).toBe(true);
  expect(isUuid("not-a-uuid")).toBe(false);
  expect(isUuid(undefined)).toBe(false);
});

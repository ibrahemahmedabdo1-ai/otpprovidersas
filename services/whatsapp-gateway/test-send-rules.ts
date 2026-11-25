/** Pure rules for the asynchronous Admin test-send job. No I/O. */
export type TestSendStage = "lookup" | "send" | "session_refresh" | "send_after_refresh";
export type TestJobOutcome = { status: "failed" | "unknown"; error: string };

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Baileys raises this before anything is transmitted, so a single session refresh and retry is safe. */
export function isNoOpenSession(err: unknown): boolean {
  return String((err as { message?: unknown } | null)?.message ?? "").includes("No open session");
}

/**
 * What to record when a stage throws. Only stages that happen BEFORE any transmission are `failed`.
 * Once sendMessage has been attempted the result is ambiguous (timeouts, socket drops), so it is `unknown`:
 * it must never be reported as failed, billed, or retried automatically.
 */
export function classifyTestSendFailure(stage: TestSendStage): TestJobOutcome {
  switch (stage) {
    case "lookup": return { status: "failed", error: "whatsapp_recipient_lookup_failed" };
    case "session_refresh": return { status: "failed", error: "signal_session_refresh_failed" };
    case "send":
    case "send_after_refresh": return { status: "unknown", error: "send_outcome_unknown" };
  }
}

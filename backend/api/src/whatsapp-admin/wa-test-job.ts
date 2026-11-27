/** Pure rules for asynchronous Admin WhatsApp test-send jobs. */
export type TestJobStatus = "queued" | "sending" | "accepted" | "failed" | "unknown";

/** A job the gateway never claimed within this window was never sent: safe to mark failed. */
export const QUEUED_STALE_SEC = 120;
/** A claimed job with no outcome: the send may or may not have happened. Never retry; report unknown. */
export const SENDING_STALE_SEC = 600;

export type StaleTransition = { to: "failed" | "unknown"; error: string } | null;

/** Which time-based transition (if any) applies to a job of the given status and age. */
export function staleTransition(status: string, ageSec: number): StaleTransition {
  if (status === "queued" && ageSec >= QUEUED_STALE_SEC) return { to: "failed", error: "gateway_did_not_start" };
  if (status === "sending" && ageSec >= SENDING_STALE_SEC) return { to: "unknown", error: "sending_outcome_unknown" };
  return null;
}

export type GatewayAnswer =
  | { action: "sending" }                          // gateway claimed the job (or it was already claimed)
  | { action: "fail"; error: string }              // gateway refused before claiming: nothing was sent
  | { action: "pending" };                         // no trustworthy answer: leave queued, never assume failure

/**
 * Interpret the gateway's reply to the enqueue call. Only a JSON refusal produced by the gateway itself
 * (status 400-503 with a string `error`) proves nothing was claimed. Timeouts, proxy errors and anything
 * ambiguous leave the job queued, because the gateway may still have claimed it.
 */
export function classifyGatewayAnswer(httpStatus: number, payload: Record<string, unknown>): GatewayAnswer {
  if (httpStatus === 202 || (httpStatus === 200 && payload.duplicate === true)) return { action: "sending" };
  if (httpStatus >= 400 && httpStatus <= 503 && typeof payload.error === "string" && /^[a-z0-9_]{1,80}$/.test(payload.error)) {
    return { action: "fail", error: payload.error };
  }
  return { action: "pending" };
}

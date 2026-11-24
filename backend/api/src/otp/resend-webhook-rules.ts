export type ResendDeliveryOutcome = "delivered" | "failed" | "complaint" | "ignored";

/**
 * Only Resend's explicit email.delivered event is billable evidence.
 * Complaints affect sender reputation but must never trigger a wallet charge.
 */
export function classifyResendEvent(type: string): ResendDeliveryOutcome {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced" || type === "email.failed") return "failed";
  if (type === "email.complained") return "complaint";
  return "ignored";
}

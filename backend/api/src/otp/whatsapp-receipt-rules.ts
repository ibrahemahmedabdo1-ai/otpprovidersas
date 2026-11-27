/** Only an explicit WhatsApp delivered receipt is billable. Accepted, server_ack, read and played are not billing proof. */
export function isBillableWhatsAppReceipt(status: string): boolean {
  return status === "delivered";
}

/**
 * Delivered receipts that still need billing. It must only return deliveries that are not yet billed and not
 * failed: otherwise the oldest 100 already-billed receipts would fill the LIMIT window and newer deliveries would
 * never be charged (or have their reservation released). Kept byte-for-byte equal to the query in
 * tests/whatsapp/delivered-reconciliation.test.sql (enforced by a unit test).
 */
export const UNBILLED_DELIVERED_RECEIPTS_SQL =
  "SELECT DISTINCT ON (w.otp_delivery_id) w.otp_delivery_id,w.id,w.message_id,w.device_id,w.status,w.created_at FROM wa_message_receipts w JOIN otp_deliveries d ON d.id=w.otp_delivery_id WHERE w.status='delivered' AND d.billed=false AND d.status<>'failed' ORDER BY w.otp_delivery_id,w.created_at ASC LIMIT 100";

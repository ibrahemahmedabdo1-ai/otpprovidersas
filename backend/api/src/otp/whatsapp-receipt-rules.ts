/** Only an explicit WhatsApp delivered receipt is billable. Accepted, server_ack, read and played are not billing proof. */
export function isBillableWhatsAppReceipt(status: string): boolean {
  return status === "delivered";
}

export type WhatsAppReceiptStatus =
  | "error"
  | "pending"
  | "server_ack"
  | "delivered"
  | "read"
  | "played";

const BAILEYS_MESSAGE_STATUS: Readonly<Record<number, WhatsAppReceiptStatus>> = Object.freeze({
  0: "error",
  1: "pending",
  2: "server_ack",
  3: "delivered",
  4: "read",
  5: "played",
});

export interface OutgoingBaileysMessageKey {
  id: string;
  fromMe: true;
  remoteJid?: string;
  remoteJidAlt?: string;
}

/** Preserve Baileys 7.x status values; unknown values are never promoted to delivery. */
export function mapBaileysMessageStatus(value: unknown): WhatsAppReceiptStatus | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const status = Number(value);
  if (!Number.isInteger(status)) return null;
  return BAILEYS_MESSAGE_STATUS[status] ?? null;
}

/** Only messages sent by this linked device with a stable message ID can produce receipts. */
export function isOutgoingBaileysMessageKey(value: unknown): value is OutgoingBaileysMessageKey {
  if (!value || typeof value !== "object") return false;
  const key = value as Record<string, unknown>;
  return key.fromMe === true && typeof key.id === "string" && key.id.trim().length > 0;
}

/** Prefer the PN alternate JID when Baileys supplies both PN and LID forms. */
export function baileysReceiptRecipient(key: OutgoingBaileysMessageKey): string {
  const alternate = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "";
  const primary = typeof key.remoteJid === "string" ? key.remoteJid : "";
  return alternate || primary;
}

/** Timestamps represent receipt milestones, not send acceptance. Each milestone is stored separately. */
export function mapBaileysReceiptTimestamps(receipt: unknown): WhatsAppReceiptStatus[] {
  if (!receipt || typeof receipt !== "object") return [];
  const value = receipt as Record<string, unknown>;
  const statuses: WhatsAppReceiptStatus[] = [];
  if (value.receiptTimestamp) statuses.push("delivered");
  if (value.readTimestamp) statuses.push("read");
  if (value.playedTimestamp) statuses.push("played");
  return statuses;
}

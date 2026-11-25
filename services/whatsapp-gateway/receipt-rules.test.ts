import { expect, test } from "bun:test";
import {
  baileysReceiptRecipient,
  isOutgoingBaileysMessageKey,
  mapBaileysMessageStatus,
  mapBaileysReceiptTimestamps,
} from "./receipt-rules";

test("maps all documented Baileys message status values without collapsing them", () => {
  expect(mapBaileysMessageStatus(0)).toBe("error");
  expect(mapBaileysMessageStatus(1)).toBe("pending");
  expect(mapBaileysMessageStatus(2)).toBe("server_ack");
  expect(mapBaileysMessageStatus(3)).toBe("delivered");
  expect(mapBaileysMessageStatus(4)).toBe("read");
  expect(mapBaileysMessageStatus(5)).toBe("played");
});

test("unknown and malformed message status values are not interpreted as delivery", () => {
  for (const value of [null, undefined, "", "not-a-number", -1, 6, 3.5, {}, true]) {
    expect(mapBaileysMessageStatus(value)).toBeNull();
  }
});

test("only fromMe=true messages with a non-empty message ID are eligible for receipt handling", () => {
  expect(isOutgoingBaileysMessageKey({ fromMe: true, id: "MSG123" })).toBe(true);
  expect(isOutgoingBaileysMessageKey({ fromMe: false, id: "MSG123" })).toBe(false);
  expect(isOutgoingBaileysMessageKey({ fromMe: true, id: "" })).toBe(false);
  expect(isOutgoingBaileysMessageKey({ id: "MSG123" })).toBe(false);
  expect(isOutgoingBaileysMessageKey(null)).toBe(false);
});

test("uses PN remoteJidAlt when available and falls back to remoteJid", () => {
  expect(baileysReceiptRecipient({
    fromMe: true, id: "MSG123",
    remoteJid: "12345@lid", remoteJidAlt: "12345@s.whatsapp.net",
  })).toBe("12345@s.whatsapp.net");
  expect(baileysReceiptRecipient({
    fromMe: true, id: "MSG124", remoteJid: "12345@s.whatsapp.net",
  })).toBe("12345@s.whatsapp.net");
});

test("receipt timestamps produce separate delivered, read and played events", () => {
  expect(mapBaileysReceiptTimestamps({
    receiptTimestamp: 10, readTimestamp: 11, playedTimestamp: 12,
  })).toEqual(["delivered", "read", "played"]);
  expect(mapBaileysReceiptTimestamps({ readTimestamp: 11 })).toEqual(["read"]);
  expect(mapBaileysReceiptTimestamps({})).toEqual([]);
  expect(mapBaileysReceiptTimestamps(null)).toEqual([]);
});

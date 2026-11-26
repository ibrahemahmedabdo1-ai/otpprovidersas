import { expect, test } from "bun:test";
import { compressAuthPayload, decompressAuthPayload, isDeterministicAuthPayloadError } from "./auth-compression";

test("compressed auth payload round-trips structured JSON", () => {
  const input = JSON.stringify({
    creds: { noiseKey: { private: { type: "Buffer", data: Array(128).fill(7) } } },
    sessions: Array.from({ length: 250 }, (_, i) => ({
      id: `device-session-${i}`,
      chain: Array(32).fill("repeated-auth-state"),
    })),
  });

  const compressed = compressAuthPayload(input);
  expect(decompressAuthPayload(compressed)).toBe(input);
  expect(compressed.byteLength).toBeLessThan(input.length);
});

test("compressed auth payload preserves UTF-8 and empty values", () => {
  for (const input of ["", "جلسة واتساب آمنة 🔐", JSON.stringify({ value: "é漢字🙂" })]) {
    expect(decompressAuthPayload(compressAuthPayload(input))).toBe(input);
  }
});


test("only deterministic payload corruption is quarantinable", () => {
  expect(isDeterministicAuthPayloadError(new SyntaxError("bad json"))).toBe(true);
  expect(isDeterministicAuthPayloadError({ code: "Z_DATA_ERROR" })).toBe(true);
  expect(isDeterministicAuthPayloadError({ message: "encrypted_session_invalid" })).toBe(true);
  expect(isDeterministicAuthPayloadError({ name: "OperationError", message: "The operation failed" })).toBe(false);
  expect(isDeterministicAuthPayloadError({ code: "ECONNRESET" })).toBe(false);
});

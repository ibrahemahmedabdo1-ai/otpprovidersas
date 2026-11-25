import { expect, test } from "bun:test";
import { compressAuthPayload, decompressAuthPayload } from "./auth-compression";

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

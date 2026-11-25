import { deflateSync, inflateSync } from "node:zlib";

export function compressAuthPayload(text: string): Uint8Array {
  return new Uint8Array(deflateSync(Buffer.from(text, "utf8"), { level: 6 }));
}

export function decompressAuthPayload(payload: Uint8Array): string {
  return inflateSync(Buffer.from(payload)).toString("utf8");
}

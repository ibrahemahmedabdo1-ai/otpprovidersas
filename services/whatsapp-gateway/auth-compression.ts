import { deflateSync, inflateSync } from "node:zlib";

export function compressAuthPayload(text: string): Uint8Array {
  return new Uint8Array(deflateSync(Buffer.from(text, "utf8"), { level: 6 }));
}

export function decompressAuthPayload(payload: Uint8Array): string {
  return inflateSync(Buffer.from(payload)).toString("utf8");
}


/**
 * Only deterministic payload-format failures are eligible for quarantine.
 * AES-GCM OperationError is deliberately excluded because it can indicate a
 * wrong/mismatched encryption key and must never cause session rows to be skipped.
 */
export function isDeterministicAuthPayloadError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  return code === "Z_DATA_ERROR" || code === "Z_BUF_ERROR" || message === "encrypted_session_invalid";
}

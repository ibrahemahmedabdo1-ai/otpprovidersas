import { createHash, randomBytes } from "node:crypto";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
/** Opaque random token; only its SHA-256 is ever stored. */
export function newToken(bytes = 32) {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: sha256(token) };
}

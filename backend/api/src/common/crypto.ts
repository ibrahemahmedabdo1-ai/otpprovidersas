import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const hmacHex = (pepper: string, value: string) => createHmac("sha256", pepper).update(value).digest("hex");
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Uniformly random numeric code from the OS CSPRNG. */
export function generateOtp(length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}
/** Bound to the request id, so a hash from one request can never validate another. */
export const hashOtp = (pepper: string, requestId: string, code: string) => hmacHex(pepper, `${requestId}:${code}`);

/** API keys are shown once; only an HMAC is stored. The prefix is safe to display. */
export function newApiKey(mode: "test" | "live", pepper: string) {
  const key = `otp_${mode}_${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 13), hash: hmacHex(pepper, key) };
}

/** AES-256-GCM envelope: v1.<iv>.<tag>.<ciphertext>. */
export function encryptString(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
export function decryptString(envelope: string, key: Buffer): string {
  const [v, iv, tag, ct] = envelope.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("invalid envelope");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

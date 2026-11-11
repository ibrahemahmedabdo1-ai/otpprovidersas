import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** AES-256-GCM envelope: v1.<iv>.<tag>.<ciphertext> (base64url). Key = 32 raw bytes, base64 in env. */
export function loadKey(b64: string): Buffer {
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return k;
}
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
export function decrypt(envelope: string, key: Buffer): string {
  const [v, iv, tag, ct] = envelope.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("invalid envelope");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const hmac = (pepper: string, value: string) => createHmac("sha256", pepper).update(value).digest("hex");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Uniform secure numeric code (rejection-sampled by randomInt). */
export function generateOtp(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}
export const hashOtp = (pepper: string, requestId: string, code: string) => hmac(pepper, `${requestId}:${code}`);

/** API keys: shown once, only an HMAC is stored. */
export function newApiKey(mode: "test" | "live", pepper: string) {
  const secret = randomBytes(32).toString("base64url");
  const key = `otp_${mode}_${secret}`;
  return { key, prefix: key.slice(0, 12), hash: hmac(pepper, key) };
}
export const hashApiKey = hmac;

/** Opaque session tokens: only SHA-256 stored. */
export function newSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

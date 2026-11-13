import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("invalid base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));
export const timeStep = (ms: number, period = 30) => Math.floor(ms / 1000 / period);

/** RFC 6238 / RFC 4226, HMAC-SHA1 (what authenticator apps use). */
export function totpAt(secretB32: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const off = h.readUInt8(h.length - 1) & 0x0f;
  const bin = h.readUInt32BE(off) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * Accepts the current step and one either side (clock drift). Returns the matched step so the caller can refuse
 * to accept the same step twice (replay), or null. Steps <= lastUsedStep are rejected.
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = timeStep(nowMs);
  let matched: number | null = null;
  for (const step of [cur - 1, cur, cur + 1]) {
    const expected = Buffer.from(totpAt(secretB32, step)), given = Buffer.from(code);
    if (timingSafeEqual(expected, given) && matched === null) matched = step;   // no early exit: constant work
  }
  if (matched === null) return null;
  if (lastUsedStep !== null && matched <= lastUsedStep) return null;
  return matched;
}

export const otpauthUri = (secret: string, email: string, issuer = "OTPProvider") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** 10 single-use recovery codes, e.g. "k3f9-82hd-q7xz". Shown once; only hashes are stored. */
export function newRecoveryCodes(n = 10): string[] {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = () => { const b = randomBytes(1).readUInt8(0); return b < 248 ? chars.charAt(b % chars.length) : null; };
  return Array.from({ length: n }, () => {
    let s = ""; while (s.length < 12) { const c = pick(); if (c) s += c; }
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  });
}
export const normalizeRecovery = (s: string) => s.trim().toLowerCase();

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224);
  }
  const v = ip.toLowerCase();
  return !(v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:"));
}

/** Registration-time check: public https host only. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (raw.length > 500 || u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  return isIP(h) === 0 ? h.includes(".") : isPublicIp(h);
}

/** Delivery-time check: every address the host resolves to must be public (guards against DNS pointing inside our network). */
export async function resolvesToPublicOnly(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, "");
  if (isIP(h)) return isPublicIp(h);
  try {
    const all = await lookup(h, { all: true });
    return all.length > 0 && all.every((a) => isPublicIp(a.address));
  } catch { return false; }
}

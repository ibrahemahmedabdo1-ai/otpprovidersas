/**
 * Protects text that must never be translated: URLs, e-mail addresses, UUIDs, API-key-like tokens, inline code, ticket ids and every number
 * (so OTP codes, amounts and dates survive unchanged). Protected parts are swapped for numbered markers before the text leaves the server
 * and are put back afterwards. If a marker comes back missing, duplicated or altered, restore() returns null and the caller must NOT show the result.
 */
export type Seg = { keep: boolean; v: string };

const PATTERNS: RegExp[] = [
  /`[^`\n]+`/,
  /\bhttps?:\/\/[^\s<>"')]+/i,
  /\bwww\.[^\s<>"')]+/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b(?:sk|pk|rk|key|tok|otp|whsec)_[A-Za-z0-9_-]{6,}\b/i,
  /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/,
  /#\d+\b/,
  /\b[A-Z]{2,}-\d+\b/,
  /\d+(?:[.,:/-]\d+)*/,
];
const COMBINED = new RegExp(PATTERNS.map((p) => `(?:${p.source})`).join("|"), "gi");

export function segment(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(COMBINED)) {
    const i = m.index ?? 0;
    if (m[0].length === 0) continue;
    if (i > last) out.push({ keep: false, v: text.slice(last, i) });
    out.push({ keep: true, v: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ keep: false, v: text.slice(last) });
  return out;
}

/** Builds the string sent to the provider. `esc` escapes the translatable text for the provider's markup, `mark` wraps a marker index. */
export function toMarked(segs: Seg[], esc: (s: string) => string, mark: (i: number) => string): { marked: string; keeps: string[] } {
  const keeps: string[] = [];
  let marked = "";
  for (const s of segs) {
    if (s.keep) { marked += mark(keeps.length); keeps.push(s.v); } else marked += esc(s.v);
  }
  return { marked, keeps };
}

/** Puts the protected parts back. `re` must have exactly one capture group: the marker index. Returns null if any marker is missing, repeated or unknown. */
export function restore(translated: string, keeps: string[], re: RegExp, unesc: (s: string) => string): string | null {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const seen = new Set<number>();
  let out = "";
  let last = 0;
  for (const m of translated.matchAll(g)) {
    const idx = Number(m[1]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= keeps.length || seen.has(idx)) return null;
    seen.add(idx);
    out += unesc(translated.slice(last, m.index ?? 0)) + keeps[idx];
    last = (m.index ?? 0) + m[0].length;
  }
  if (seen.size !== keeps.length) return null;
  return out + unesc(translated.slice(last));
}

export const hasTranslatableText = (segs: Seg[]): boolean => segs.some((s) => !s.keep && /\p{L}/u.test(s.v));

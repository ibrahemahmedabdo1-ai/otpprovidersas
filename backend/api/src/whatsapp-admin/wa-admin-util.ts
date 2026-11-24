/** Pure helpers for the admin-only WhatsApp test tools. */
export function normalizeRecipient(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}
export function parseAllowlist(env: string | undefined): string[] {
  return (env ?? "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean);
}
export function maskRecipient(d: string): string { return "***" + d.slice(-4); }
export function validTestMessage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim();
  // eslint-disable-next-line no-control-regex
  return m.length >= 1 && m.length <= 200 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(m) ? m : null;
}
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const isMessageId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9]{8,64}$/.test(v);

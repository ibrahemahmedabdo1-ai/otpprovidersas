import type { Result } from "../auth/validators";

export function parseProjectName(v: unknown): Result<string> {
  if (typeof v !== "string") return { ok: false, error: "name is required" };
  const n = v.trim();
  // eslint-disable-next-line no-control-regex
  if (n.length < 1 || n.length > 60 || /[\u0000-\u001f\u007f<>]/.test(n)) return { ok: false, error: "name must be 1-60 characters without control characters or < >" };
  return { ok: true, value: n };
}

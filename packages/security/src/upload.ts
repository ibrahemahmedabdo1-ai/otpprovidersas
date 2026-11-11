const ALLOWED = { "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff], "application/pdf": [0x25, 0x50, 0x44, 0x46] } as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type UploadCheck = { ok: true; contentType: keyof typeof ALLOWED } | { ok: false; reason: string };

/** Validates by size, declared type allow-list AND magic bytes (declared type alone is not trusted). */
export function validateUpload(bytes: Uint8Array, declared: string): UploadCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  const magic = ALLOWED[declared as keyof typeof ALLOWED];
  if (!magic) return { ok: false, reason: "type_not_allowed" };
  if (!magic.every((b, i) => bytes[i] === b)) return { ok: false, reason: "content_mismatch" };
  return { ok: true, contentType: declared as keyof typeof ALLOWED };
}
export const safeFilename = (n: string) => n.replace(/[^\w.\-]/g, "_").replace(/\.{2,}/g, ".").slice(0, 120) || "file";

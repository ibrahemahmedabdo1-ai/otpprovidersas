export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** CSRF defence for cookie sessions: browsers always send Origin on cross-site POSTs, so a wrong Origin is rejected.
 *  Requests without Origin (curl, mobile apps using bearer tokens) are not browser-CSRF vectors. */
export function isOriginAllowed(origin: string | undefined, allowed: string[], isProd: boolean): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  if (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

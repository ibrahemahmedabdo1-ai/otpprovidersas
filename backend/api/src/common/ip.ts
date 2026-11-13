import { isIP } from "node:net";
export function cleanIp(ip: string | undefined): string | null {
  const v = (ip ?? "").replace(/^::ffff:/, "");
  return isIP(v) ? v : null;
}

import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

// Argon2id (library default) with OWASP-recommended minimum parameters: 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, OPTIONS);
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try { return await verify(stored, password); } catch { return false; }
}

let dummy: Promise<string> | undefined;
/** Verifying against this keeps login timing similar whether or not the account exists. */
export function burnPasswordTime(password: string): Promise<boolean> {
  dummy ??= hashPassword(randomBytes(16).toString("hex"));
  return dummy.then((h) => verifyPassword(h, password));
}

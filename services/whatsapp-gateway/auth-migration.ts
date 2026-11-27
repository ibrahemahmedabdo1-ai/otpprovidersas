import { createHash } from "node:crypto";

/**
 * One-row-per-cycle enc:v1 -> enc:v2 conversion of wa_gateway_kv, written against a small
 * store interface so concurrency, failure and restart behaviour can be tested without a database.
 * It never deletes rows, never changes the encryption key or the storage format, and only
 * replaces a value that is byte-for-byte unchanged since it was read (compare-and-swap).
 */
export type KvRow = { k: string; v: unknown };

export interface AuthMigrationStore {
  /** Smallest enc:v1 row of the active device whose key is not in `excluded`, or null. */
  pickCandidate(excluded: string[]): Promise<KvRow | null>;
  /** Plain value decrypted from a stored row (v1 or v2). Throws on failure. */
  decrypt(v: unknown): Promise<unknown>;
  /** New stored (enc:v2) representation of a plain value. */
  encrypt(value: unknown): Promise<string>;
  /** Replaces the row only if it still equals `expected`. Returns whether a row was updated. */
  compareAndSwap(k: string, expected: unknown, next: string): Promise<boolean>;
  /** Canonical text of a plain value, used to prove the new row decrypts to the same data. */
  canonical(value: unknown): string;
}

export type MigrationOutcome = "idle" | "migrated" | "skipped_changed" | "failed" | "quarantined" | "busy";

export const MAX_ATTEMPTS_PER_ROW = 3;

export function keyFingerprint(k: string): string {
  return createHash("sha256").update(k).digest("hex").slice(0, 10);
}

function keyType(k: string): string {
  return k.split(":")[1] ?? "unknown";
}

export class AuthMigrationRunner {
  private inFlight = false;
  private readonly attempts = new Map<string, number>();
  private readonly quarantined = new Set<string>();

  constructor(private readonly store: AuthMigrationStore, private readonly log: (event: string, data: Record<string, unknown>) => void) {}

  get quarantinedCount(): number { return this.quarantined.size; }

  private noteFailure(k: string, reason: string): MigrationOutcome {
    const n = (this.attempts.get(k) ?? 0) + 1;
    this.attempts.set(k, n);
    if (n >= MAX_ATTEMPTS_PER_ROW) {
      this.quarantined.add(k);
      // The row is left untouched in the database; it is only skipped by this process.
      this.log("AUTH_COMPRESSION_ROW_QUARANTINED", { keyType: keyType(k), keyRef: keyFingerprint(k), reason, attempts: n });
      return "quarantined";
    }
    return reason === "changed_during_conversion" ? "skipped_changed" : "failed";
  }

  async runOnce(): Promise<MigrationOutcome> {
    if (this.inFlight) return "busy";
    this.inFlight = true;
    let row: KvRow | null = null;
    try {
      row = await this.store.pickCandidate([...this.quarantined]);
      if (!row) { this.log("AUTH_COMPRESSION_IDLE", { quarantined: this.quarantined.size }); return "idle"; }
      const before = await this.store.decrypt(row.v);
      const next = await this.store.encrypt(before);
      // Prove the new value decrypts to identical data before it can replace the old one.
      const after = await this.store.decrypt(next);
      if (this.store.canonical(after) !== this.store.canonical(before)) throw Object.assign(new Error("verification_mismatch"), { code: "verify" });
      const swapped = await this.store.compareAndSwap(row.k, row.v, next);
      const info = { keyType: keyType(row.k), keyRef: keyFingerprint(row.k) };
      if (!swapped) {
        this.log("AUTH_COMPRESSION_SKIPPED_CHANGED", { ...info, attempts: (this.attempts.get(row.k) ?? 0) + 1 });
        return this.noteFailure(row.k, "changed_during_conversion");
      }
      this.attempts.delete(row.k);
      this.log("AUTH_COMPRESSION_MIGRATED_ONE", { ...info, bytesBefore: String(row.v).length, bytesAfter: next.length });
      return "migrated";
    } catch (err: any) {
      const k = row?.k;
      this.log("AUTH_COMPRESSION_MIGRATION_FAILED", { ...(k ? { keyType: keyType(k), keyRef: keyFingerprint(k) } : {}), name: err?.name, code: err?.code, message: String(err?.message || "unknown").slice(0, 120) });
      return k ? this.noteFailure(k, "error") : "failed";
    } finally {
      this.inFlight = false;
    }
  }
}

import { expect, test } from "bun:test";
import { AuthMigrationRunner, MAX_ATTEMPTS_PER_ROW, type AuthMigrationStore, type KvRow } from "./auth-migration";

// In-memory store emulating wa_gateway_kv. "v1:" / "v2:" prefixes stand for the stored encodings.
function makeStore(initial: Record<string, string>, hooks: { beforeSwap?: (k: string) => void; badDecrypt?: Set<string>; corruptEncrypt?: boolean } = {}) {
  const rows = new Map(Object.entries(initial));
  const store: AuthMigrationStore = {
    async pickCandidate(excluded) {
      const c = [...rows].filter(([k, v]) => v.startsWith("v1:") && !excluded.includes(k)).sort((a, b) => a[1].length - b[1].length)[0];
      return c ? { k: c[0], v: c[1] } : null;
    },
    async decrypt(v) {
      const s = String(v);
      if (hooks.badDecrypt?.has(s)) throw new Error("decrypt_failed");
      return JSON.parse(s.slice(3));
    },
    async encrypt(value) { return "v2:" + JSON.stringify(hooks.corruptEncrypt ? { x: "corrupt" } : value); },
    async compareAndSwap(k, expected, next) {
      hooks.beforeSwap?.(k);
      if (rows.get(k) !== expected) return false;
      rows.set(k, next);
      return true;
    },
    canonical: (v) => JSON.stringify(v),
  };
  return { rows, store };
}
const logs = () => { const out: Array<[string, any]> = []; return { out, log: (e: string, d: any) => void out.push([e, d]) }; };
const v1 = (o: unknown) => "v1:" + JSON.stringify(o);

test("converts exactly one row per cycle, smallest first, and keeps data intact", async () => {
  const { rows, store } = makeStore({ "d:k:1": v1({ a: 1 }), "d:k:2": v1({ a: "longer value" }) });
  const l = logs(); const r = new AuthMigrationRunner(store, l.log);
  expect(await r.runOnce()).toBe("migrated");
  expect(rows.get("d:k:1")!.startsWith("v2:")).toBe(true);
  expect(rows.get("d:k:2")!.startsWith("v1:")).toBe(true);
  expect(l.out[0][0]).toBe("AUTH_COMPRESSION_MIGRATED_ONE");
  expect(await r.runOnce()).toBe("migrated");
  expect(await r.runOnce()).toBe("idle");
  expect(rows.size).toBe(2); // nothing deleted
});

test("does not overwrite a value that changed during conversion", async () => {
  const { rows, store } = makeStore({ "d:k:1": v1({ a: 1 }) }, { beforeSwap: (k) => rows.set(k, v1({ a: "newer" })) });
  const l = logs(); const r = new AuthMigrationRunner(store, l.log);
  expect(await r.runOnce()).toBe("skipped_changed");
  expect(rows.get("d:k:1")).toBe(v1({ a: "newer" }));
  expect(l.out.some(([e]) => e === "AUTH_COMPRESSION_SKIPPED_CHANGED")).toBe(true);
});

test("a value that fails verification is never written", async () => {
  const { rows, store } = makeStore({ "d:k:1": v1({ a: 1 }) }, { corruptEncrypt: true });
  const l = logs(); const r = new AuthMigrationRunner(store, l.log);
  expect(await r.runOnce()).toBe("failed");
  expect(rows.get("d:k:1")).toBe(v1({ a: 1 }));
  expect(l.out[0][0]).toBe("AUTH_COMPRESSION_MIGRATION_FAILED");
});

test("a poison row is quarantined after bounded attempts and the next row proceeds", async () => {
  const bad = "v1:" + "x";
  const { rows, store } = makeStore({ "d:k:bad": bad, "d:k:ok": v1({ longer: "value-value" }) }, { badDecrypt: new Set([bad]) });
  const l = logs(); const r = new AuthMigrationRunner(store, l.log);
  const results: string[] = [];
  for (let i = 0; i < MAX_ATTEMPTS_PER_ROW; i++) results.push(await r.runOnce());
  expect(results.at(-1)).toBe("quarantined");
  expect(r.quarantinedCount).toBe(1);
  expect(await r.runOnce()).toBe("migrated");
  expect(rows.get("d:k:bad")).toBe(bad); // untouched, not deleted
  expect(rows.get("d:k:ok")!.startsWith("v2:")).toBe(true);
  const q = l.out.find(([e]) => e === "AUTH_COMPRESSION_ROW_QUARANTINED")![1];
  expect(JSON.stringify(q)).not.toContain("d:k:bad"); // key id is not logged, only a fingerprint
});

test("restart resumes from database state: converted rows stay converted, remaining rows continue", async () => {
  const { rows, store } = makeStore({ "d:k:1": v1({ a: 1 }), "d:k:2": v1({ a: "second row" }) });
  await new AuthMigrationRunner(store, () => {}).runOnce();
  const afterRestart = new AuthMigrationRunner(store, () => {}); // new process, empty in-memory state
  expect(await afterRestart.runOnce()).toBe("migrated");
  expect([...rows.values()].every((v) => v.startsWith("v2:"))).toBe(true);
});

test("overlapping cycles never run concurrently", async () => {
  let release!: () => void; const gate = new Promise<void>((res) => (release = res));
  const { store } = makeStore({ "d:k:1": v1({ a: 1 }) });
  const slow: AuthMigrationStore = { ...store, pickCandidate: async (e) => { await gate; return store.pickCandidate(e); } };
  const r = new AuthMigrationRunner(slow, () => {});
  const first = r.runOnce();
  expect(await r.runOnce()).toBe("busy");
  release();
  expect(await first).toBe("migrated");
});

test("session data (Buffer-like creds) round-trips unchanged through conversion", async () => {
  const creds = { noiseKey: { private: { type: "Buffer", data: [1, 2, 3, 250] } }, registrationId: 42 };
  const { rows, store } = makeStore({ "d:creds:1": v1(creds) });
  await new AuthMigrationRunner(store, () => {}).runOnce();
  expect(JSON.parse(rows.get("d:creds:1")!.slice(3))).toEqual(creds);
});

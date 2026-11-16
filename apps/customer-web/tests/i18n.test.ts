import { test } from "node:test";
import assert from "node:assert/strict";
import en from "../src/i18n/en.ts";
import ar from "../src/i18n/ar.ts";
import ru from "../src/i18n/ru.ts";
import es from "../src/i18n/es.ts";
import de from "../src/i18n/de.ts";
import zh from "../src/i18n/zh.ts";

const all = { en, ar, ru, es, de, zh } as const;
type Tree = string | { [k: string]: Tree };
const leaves = (v: Tree, p = ""): Record<string, string> =>
  typeof v === "string" ? { [p]: v } : Object.assign({}, ...Object.entries(v).map(([k, x]) => leaves(x, p ? `${p}.${k}` : k)));
const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

const base = leaves(en as Tree);
for (const [name, d] of Object.entries(all)) {
  const l = leaves(d as Tree);
  test(`${name}: same keys as en`, () => assert.deepEqual(Object.keys(l).sort(), Object.keys(base).sort()));
  test(`${name}: no empty strings, same {placeholders}`, () => {
    for (const k of Object.keys(base)) { assert.ok((l[k] ?? "").trim().length > 0, k); assert.equal(vars(l[k]!), vars(base[k]!), k); }
  });
}

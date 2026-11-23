import { test } from "node:test";
import assert from "node:assert/strict";
import en from "../src/i18n/en.ts";
import ar from "../src/i18n/ar.ts";
import ru from "../src/i18n/ru.ts";
import es from "../src/i18n/es.ts";
import de from "../src/i18n/de.ts";
import zh from "../src/i18n/zh.ts";

const all = { en, ar, ru, es, de, zh } as const;
type Tree = string | Tree[] | { [k: string]: Tree };
const shape = (v: Tree): unknown => (typeof v === "string" ? "s" : Array.isArray(v) ? v.map(shape) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])));
// `warn` is an optional notice: an empty value means "show no notice" and is allowed.
const leaves = (v: Tree, out: string[] = []): string[] => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach((x) => leaves(x, out)); else Object.entries(v).forEach(([k, x]) => { if (k !== "warn") leaves(x, out); }); return out; };

test("every locale has exactly the same structure as English (no missing or extra keys, same list lengths)", () => {
  for (const [name, d] of Object.entries(all)) assert.deepEqual(shape(d as Tree), shape(en as Tree), name);
});

test("no empty strings, and non-English locales are actually translated", () => {
  for (const [name, d] of Object.entries(all)) {
    for (const s of leaves(d as Tree)) assert.ok(s.trim().length > 0, `${name}: empty string`);
    if (name === "en") continue;
    assert.notEqual(d.home.h1, en.home.h1, name);
    assert.notEqual(d.meta.home.title, en.meta.home.title, name);
  }
});

test("meta titles and descriptions are within search-result limits and unique per locale", () => {
  for (const [name, d] of Object.entries(all)) {
    const titles = Object.values(d.meta).map((m) => m.title);
    assert.equal(new Set(titles).size, titles.length, `${name}: duplicate titles`);
    const cjk = name === "zh" || name === "ar";
    for (const [page, m] of Object.entries(d.meta)) {
      assert.ok(m.title.length <= 75, `${name}.${page} title ${m.title.length} chars`);
      assert.ok(m.description.length >= (cjk ? 25 : 60) && m.description.length <= 200, `${name}.${page} description ${m.description.length} chars`);
    }
  }
});

test("honesty: no invented prices or guarantees in any language", () => {
  for (const [name, d] of Object.entries(all)) {
    for (const s of leaves(d as Tree)) {
      assert.ok(!/(\$|US\$|USD|دولار|долл|dólar|Dollar|美元)\s?\d/.test(s) && !/\d\s?(\$|USD|%)/.test(s), `${name}: looks like a price or statistic: ${s}`);
      assert.ok(!/99\.9|100% (uptime|delivery)|guaranteed delivery/i.test(s), `${name}: unsupported claim: ${s}`);
    }
  }
});

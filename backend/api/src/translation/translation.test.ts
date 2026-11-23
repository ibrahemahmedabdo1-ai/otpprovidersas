import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedReason, normalizeLang, parseSettings, resolveTargetLang, withinDailyLimit } from "./core";
import { DeepLProvider, GoogleProvider, ProviderError, providerFromEnv } from "./providers";
import { hasTranslatableText, restore, segment, toMarked } from "./protect";

const MARKS = { esc: (s: string) => s, mark: (i: number) => `<x>${i}</x>`, re: /<x>(\d+)<\/x>/g, unesc: (s: string) => s };
const keepsOf = (t: string) => segment(t).filter((s) => s.keep).map((s) => s.v);

test("URLs, e-mail addresses, UUIDs and API-key-like tokens are never translated", () => {
  const k = keepsOf("Visit https://otpprovider.com/docs?a=1 or mail help@otpprovider.com, id 3f2504e0-4f89-41d3-9a0c-0305e82c3301, key sk_live_abcDEF123456");
  assert.ok(k.includes("https://otpprovider.com/docs?a=1"));
  assert.ok(k.includes("help@otpprovider.com"));
  assert.ok(k.includes("3f2504e0-4f89-41d3-9a0c-0305e82c3301"));
  assert.ok(k.includes("sk_live_abcDEF123456"));
});

test("OTP codes, amounts, dates and ticket ids are protected", () => {
  const k = keepsOf("Your code 482913 costs 0.02 on 2026-03-01, see #1042 and ABC-77");
  for (const v of ["482913", "0.02", "2026-03-01", "#1042", "ABC-77"]) assert.ok(k.includes(v), v);
});

test("inline code is protected as a whole", () => {
  assert.deepEqual(keepsOf("Run `npm install foo` now"), ["`npm install foo`"]);
});

test("protect then restore returns the exact original when the provider keeps the markers", () => {
  const src = "Hello, your code is 123456. See https://x.io/a";
  const { marked, keeps } = toMarked(segment(src), MARKS.esc, MARKS.mark);
  assert.ok(!marked.includes("123456") && !marked.includes("https://"));
  const fake = marked.replace("Hello, your code is", "Hola, tu código es").replace("See", "Mira");
  assert.equal(restore(fake, keeps, MARKS.re, MARKS.unesc), "Hola, tu código es 123456. Mira https://x.io/a");
});

test("restore refuses a result with a missing marker", () => {
  const { marked, keeps } = toMarked(segment("code 111 and 222"), MARKS.esc, MARKS.mark);
  assert.equal(restore(marked.replace("<x>1</x>", ""), keeps, MARKS.re, MARKS.unesc), null);
});

test("restore refuses a duplicated or unknown marker", () => {
  const { keeps } = toMarked(segment("code 111 and 222"), MARKS.esc, MARKS.mark);
  assert.equal(restore("a <x>0</x> b <x>0</x> c <x>1</x>", keeps, MARKS.re, MARKS.unesc), null);
  assert.equal(restore("a <x>0</x> b <x>1</x> c <x>7</x>", keeps, MARKS.re, MARKS.unesc), null);
});

test("text that is only numbers or links has nothing to translate", () => {
  assert.equal(hasTranslatableText(segment("482913")), false);
  assert.equal(hasTranslatableText(segment("https://x.io 123")), false);
  assert.equal(hasTranslatableText(segment("مرحبا 123")), true);
});

test("provider language codes map to the six supported languages", () => {
  assert.equal(normalizeLang("EN-US"), "en");
  assert.equal(normalizeLang("zh-CN"), "zh");
  assert.equal(normalizeLang("AR"), "ar");
  assert.equal(normalizeLang("fr"), null);
  assert.equal(normalizeLang(undefined), null);
});

test("an agent override beats detection, which beats the account language", () => {
  assert.equal(resolveTargetLang({ override: "de", detected: "ru" }, "en"), "de");
  assert.equal(resolveTargetLang({ override: null, detected: "ru" }, "en"), "ru");
  assert.equal(resolveTargetLang({ override: null, detected: null }, "es"), "es");
});

test("translation is blocked, with a reason, unless every switch allows it", () => {
  const ok = { systemEnabled: true, configured: true, agentAllowed: true, agentEnabled: true, ticketEnabled: true, enabledLangs: ["en", "ar"] as const, target: "ar" as const };
  assert.equal(blockedReason(ok), null);
  assert.equal(blockedReason({ ...ok, systemEnabled: false }), "system_disabled");
  assert.equal(blockedReason({ ...ok, configured: false }), "not_configured");
  assert.equal(blockedReason({ ...ok, agentAllowed: false }), "agent_not_allowed");
  assert.equal(blockedReason({ ...ok, agentEnabled: false }), "agent_disabled");
  assert.equal(blockedReason({ ...ok, ticketEnabled: false }), "conversation_disabled");
  assert.equal(blockedReason({ ...ok, target: "zh" }), "language_not_enabled");
});

test("malformed stored settings fall back to disabled with safe limits", () => {
  assert.deepEqual(parseSettings(null), { enabled: false, languages: ["ar", "en", "ru", "es", "de", "zh"], dailyCharLimit: 200000 });
  const s = parseSettings({ enabled: "yes", languages: ["fr", "ar", "ar"], dailyCharLimit: 5 });
  assert.equal(s.enabled, false);
  assert.deepEqual(s.languages, ["ar"]);
  assert.equal(s.dailyCharLimit, 200000);
  assert.equal(parseSettings({ enabled: true, languages: ["en"], dailyCharLimit: 5000 }).enabled, true);
});

test("the daily character limit is inclusive", () => {
  assert.equal(withinDailyLimit(900, 100, 1000), true);
  assert.equal(withinDailyLimit(901, 100, 1000), false);
});

test("DeepL: key goes in the header only, markers are ignored tags, detection is mapped", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ translations: [{ text: "Hola <x>0</x>", detected_source_language: "EN" }] }), { status: 200 }); }) as unknown as typeof fetch;
  const r = await new DeepLProvider("secret-key:fx", f).translate("Hello <x>0</x>", "es");
  assert.deepEqual(r, { text: "Hola <x>0</x>", detected: "en" });
  const s = seen as unknown as { url: string; init: RequestInit };
  assert.ok(s.url.startsWith("https://api-free.deepl.com/"));
  assert.ok(!String(s.init.body).includes("secret-key"));
  assert.match(String((s.init.headers as Record<string, string>).authorization), /secret-key/);
  assert.match(String(s.init.body), /"ignore_tags":\["x"\]/);
});

test("provider failures become short codes that never contain the key", async () => {
  const f401 = (async () => new Response("denied secret-key", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(new GoogleProvider("secret-key", f401).translate("hi", "ar"), (e: unknown) => e instanceof ProviderError && e.code === "provider_auth" && !e.message.includes("secret"));
  const f429 = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(new DeepLProvider("k", f429).translate("hi", "ar"), (e: unknown) => e instanceof ProviderError && e.code === "provider_rate_limited");
  const fnet = (async () => { throw new Error("boom secret-key"); }) as unknown as typeof fetch;
  await assert.rejects(new DeepLProvider("k", fnet).translate("hi", "ar"), (e: unknown) => e instanceof ProviderError && e.code === "network" && !e.message.includes("secret"));
});

test("without a key or a known provider name, translation is reported as not configured", () => {
  assert.equal(providerFromEnv({}), null);
  assert.equal(providerFromEnv({ TRANSLATION_PROVIDER: "deepl" } as NodeJS.ProcessEnv), null);
  assert.equal(providerFromEnv({ TRANSLATION_API_KEY: "k" } as NodeJS.ProcessEnv), null);
  assert.equal(providerFromEnv({ TRANSLATION_API_KEY: "k", TRANSLATION_PROVIDER: "other" } as NodeJS.ProcessEnv), null);
  assert.equal(providerFromEnv({ TRANSLATION_API_KEY: "k", TRANSLATION_PROVIDER: "google" } as NodeJS.ProcessEnv)?.key, "google");
});

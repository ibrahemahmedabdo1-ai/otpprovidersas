import { normalizeLang, type Lang } from "./core";

export type ProviderResult = { text: string; detected: Lang | null };
export type Marks = { esc: (s: string) => string; unesc: (s: string) => string; mark: (i: number) => string; re: RegExp };
export interface TranslationProvider {
  readonly key: "deepl" | "google" | "libretranslate";
  readonly marks: Marks;
  translate(marked: string, target: Lang): Promise<ProviderResult>;
}
/** Minimal fetch shape. Declared here so the build does not depend on which DOM or Node typings happen to be installed. */
export type HttpResponse = { ok: boolean; status: number; json(): Promise<unknown> };
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<HttpResponse>;
const defaultFetch: FetchLike = (url, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(url, init);

export class ProviderError extends Error {
  constructor(readonly code: string) { super(code); }
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlUnesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

async function post(url: string, init: { method: string; headers: Record<string, string>; body: string }, f: FetchLike, timeoutMs: number): Promise<HttpResponse> {
  const ctl = new (globalThis as unknown as { AbortController: new () => { signal: AbortSignal; abort(): void } }).AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await f(url, { ...init, signal: ctl.signal }); }
  catch (e) { throw new ProviderError((e as Error)?.name === "AbortError" ? "timeout" : "network"); }
  finally { clearTimeout(timer); }
}
const httpError = (status: number) => new ProviderError(status === 401 || status === 403 ? "provider_auth" : status === 429 ? "provider_rate_limited" : status === 456 ? "provider_quota" : `provider_http_${status}`);

export class DeepLProvider implements TranslationProvider {
  readonly key = "deepl" as const;
  readonly marks: Marks = { esc: xmlEsc, unesc: xmlUnesc, mark: (i) => `<x>${i}</x>`, re: /<x>(\d+)<\/x>/g };
  constructor(private readonly apiKey: string, private readonly f: FetchLike = defaultFetch, private readonly timeoutMs = 8000) {}
  private static target(l: Lang): string { return l === "en" ? "EN-US" : l === "zh" ? "ZH-HANS" : l.toUpperCase(); }
  async translate(marked: string, target: Lang): Promise<ProviderResult> {
    const host = this.apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
    const res = await post(`https://${host}/v2/translate`, {
      method: "POST",
      headers: { authorization: `DeepL-Auth-Key ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ text: [marked], target_lang: DeepLProvider.target(target), tag_handling: "xml", ignore_tags: ["x"] }),
    }, this.f, this.timeoutMs);
    if (!res.ok) throw httpError(res.status);
    const j = (await res.json().catch(() => null)) as { translations?: { text?: string; detected_source_language?: string }[] } | null;
    const t = j?.translations?.[0];
    if (!t || typeof t.text !== "string") throw new ProviderError("bad_response");
    return { text: t.text, detected: normalizeLang(t.detected_source_language) };
  }
}

export class GoogleProvider implements TranslationProvider {
  readonly key = "google" as const;
  readonly marks: Marks = { esc: xmlEsc, unesc: xmlUnesc, mark: (i) => `<span translate="no">${i}</span>`, re: /<span translate="no">(\d+)<\/span>/g };
  constructor(private readonly apiKey: string, private readonly f: FetchLike = defaultFetch, private readonly timeoutMs = 8000) {}
  async translate(marked: string, target: Lang): Promise<ProviderResult> {
    const res = await post("https://translation.googleapis.com/language/translate/v2", {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ q: marked, target: target === "zh" ? "zh-CN" : target, format: "html" }),
    }, this.f, this.timeoutMs);
    if (!res.ok) throw httpError(res.status);
    const j = (await res.json().catch(() => null)) as { data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] } } | null;
    const t = j?.data?.translations?.[0];
    if (!t || typeof t.translatedText !== "string") throw new ProviderError("bad_response");
    return { text: t.translatedText, detected: normalizeLang(t.detectedSourceLanguage) };
  }
}


/** Self-hosted LibreTranslate. No API key is required unless the instance enables authentication. */
export class LibreTranslateProvider implements TranslationProvider {
  readonly key = "libretranslate" as const;
  readonly marks: Marks = { esc: xmlEsc, unesc: xmlUnesc, mark: (i) => `<span translate="no">${i}</span>`, re: /<span translate="no">(\d+)<\/span>/g };
  constructor(private readonly baseUrl: string, private readonly apiKey = "", private readonly f: FetchLike = defaultFetch, private readonly timeoutMs = 12000) {}
  async translate(marked: string, target: Lang): Promise<ProviderResult> {
    const body: Record<string, string> = { q: marked, source: "auto", target: target === "zh" ? "zh" : target, format: "html" };
    if (this.apiKey) body.api_key = this.apiKey;
    const res = await post(`${this.baseUrl.replace(/\/+$/, "")}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }, this.f, this.timeoutMs);
    if (!res.ok) throw httpError(res.status);
    const j = (await res.json().catch(() => null)) as { translatedText?: string; detectedLanguage?: { language?: string } } | null;
    if (!j || typeof j.translatedText !== "string") throw new ProviderError("bad_response");
    return { text: j.translatedText, detected: normalizeLang(j.detectedLanguage?.language) };
  }
}

/** Builds the provider from server-side environment variables only. Returns null when none is configured. The key never leaves this process. */
export function providerFromEnv(env: NodeJS.ProcessEnv, f: FetchLike = defaultFetch): TranslationProvider | null {
  const key = env.TRANSLATION_API_KEY?.trim() ?? "";
  const which = (env.TRANSLATION_PROVIDER ?? "").trim().toLowerCase();
  if (which === "libretranslate") {
    const base = env.TRANSLATION_BASE_URL?.trim();
    if (!base) return null;
    try { const u = new URL(base); if (u.protocol !== "https:" && u.hostname !== "localhost" && !u.hostname.endsWith(".railway.internal")) return null; }
    catch { return null; }
    return new LibreTranslateProvider(base, key, f);
  }
  if (!key) return null;
  if (which === "deepl") return new DeepLProvider(key, f);
  if (which === "google") return new GoogleProvider(key, f);
  return null;
}

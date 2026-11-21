import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "../i18n/config";
import type { Landing } from "../i18n/landing";
import { API_URL, CONSOLE, PLANS, contactHref, formatUsd } from "../lib/site";

const Svg = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Icons = {
  chat: <Svg><path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.6A8 8 0 1 1 21 12z" /></Svg>,
  coin: <Svg><circle cx="12" cy="12" r="9" /><path d="M9 12.5l2 2 4-4.5" /></Svg>,
  hook: <Svg><path d="M10 14a4 4 0 0 1 0-6l2-2a4 4 0 0 1 6 6l-1 1M14 10a4 4 0 0 1 0 6l-2 2a4 4 0 0 1-6-6l1-1" /></Svg>,
  shield: <Svg><path d="M12 3l8 3v6c0 4.4-3.2 8-8 9-4.8-1-8-4.6-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></Svg>,
  mail: <Svg size={16}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Svg>,
  dot: <Svg size={16}><circle cx="12" cy="12" r="4" /></Svg>,
  bolt: <Svg size={16}><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /></Svg>,
};
const FEATURE_ICONS = [Icons.chat, Icons.coin, Icons.hook, Icons.shield];

export function Hero({ locale, l, siteName }: { locale: Locale; l: Landing; siteName: string }) {
  const lines: ReactNode[] = [
    <><span className="k">POST</span> /v1/otp/send</>,
    <><span className="c">Authorization:</span> Bearer otp_test_…</>,
    <><span className="c">Idempotency-Key:</span> 3f2b9c1e…</>,
    <> </>,
    <>{"{"}</>,
    <>  <span className="k">&quot;channel&quot;</span>: <span className="s">&quot;whatsapp&quot;</span>,</>,
    <>  <span className="k">&quot;to&quot;</span>: <span className="s">&quot;+15550100&quot;</span></>,
    <>{"}"}</>,
  ];
  return (
    <section className="hero">
      <div className="wrap">
        <div>
          <p className="badge">{l.hero.badge}</p>
          <h1>{l.hero.h1}</h1>
          <p className="lead">{l.hero.sub}</p>
          <p className="cta">
            <a className="btn" href={CONSOLE.register} rel="noopener">{l.hero.cta1}</a>
            <Link className="btn ghost" href={`/${locale}/developers`}>{l.hero.cta2}</Link>
          </p>
        </div>
        <div className="vis" aria-hidden="true">
          <div className="win">
            <div className="win-bar"><i /><i /><i /><span>{l.hero.window}</span></div>
            <pre>{lines.map((ln, i) => <span key={i} className="ln" style={{ "--i": i } as CSSProperties}>{ln}{"\n"}</span>)}</pre>
          </div>
          <div className="phone">
            <div className="phone-screen">
              <div className="wa-status"><span dir="ltr">9:41</span><span className="wa-sig"><i /><i /><i /><i /></span></div>
              <div className="wa-head">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                <span className="av"><img src="/icon.svg" alt="" width={22} height={22} /></span>
                <div className="wa-who">
                  <b>{l.hero.chatName}<svg className="wa-verified" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#00a884" /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></b>
                  <small className="wa-sub"><span className="wa-online">{l.hero.chatOnline}</span><span className="wa-typing">{l.hero.chatTyping}</span></small>
                </div>
              </div>
              <div className="wa-body">
                <span className="wa-day">{l.hero.chatNow}</span>
                <div className="bubble">
                  <p>{l.hero.sms}</p>
                  <strong dir="ltr">582910</strong>
                  <p>{l.hero.chatExpire} {l.hero.chatShare}</p>
                  <small dir="ltr">9:41</small>
                </div>
              </div>
              <div className="wa-input"><span className="wa-field" /><span className="wa-mic" /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Strip({ l }: { l: Landing }) {
  const items = [...l.strip.items, ...l.strip.items];
  return (
    <section className="strip" aria-label={l.strip.title}>
      <p>{l.strip.title}</p>
      <div className="marq">
        <div className="marq-track">
          {items.map((it, i) => (
            <span className="chip" key={i} aria-hidden={i >= l.strip.items.length ? "true" : undefined}>{i % 3 === 0 ? Icons.mail : i % 3 === 1 ? Icons.bolt : Icons.dot}{it}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Why({ l }: { l: Landing }) {
  return (
    <section className="wrap section">
      <div className="sec-head"><h2>{l.why.title}</h2><p>{l.why.sub}</p></div>
      <div className="grid4">
        {l.why.items.map((f, i) => (
          <article className="feat" key={f.t}>
            <span className="ico">{FEATURE_ICONS[i]}</span>
            <div><h3>{f.t}</h3><p>{f.d}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

export async function Plans({ locale, l }: { locale: Locale; l: Landing }) {
  const catalog = await fetch(`${API_URL}/v1/public/pricing`, { cache: "no-store", signal: AbortSignal.timeout(3000) })
    .then(async (r) => r.ok ? await r.json() as { packages?: { id: string; name: string; priceMicroUsd: string; creditMicroUsd: string }[] } : null)
    .catch(() => null);
  const packages = catalog?.packages ?? [];
  return (
    <section className="wrap section" id="plans">
      <div className="sec-head"><h2>{l.plans.title}</h2><p>{l.plans.sub}</p></div>
      {packages.length > 0 ? (
        <div className="plans">
          {packages.map((p, i) => {
            const price = Number(p.priceMicroUsd) / 1_000_000;
            const credit = Number(p.creditMicroUsd) / 1_000_000;
            return (
              <article key={p.id} className={i === 1 ? "plan pop" : "plan"}>
                {i === 1 && <span className="tag">{l.plans.popular}</span>}
                <h3>{p.name}</h3>
                <p className="blurb">{locale === "ar" ? "رصيد مسبق الدفع في محفظتك" : "Prepaid wallet credit"}</p>
                <div className="price" dir="ltr" style={{ textAlign: "start" }}>{formatUsd(locale, price)}</div>
                <div className="unit">{locale === "ar" ? "رصيد المحفظة" : "Wallet credit"}: {formatUsd(locale, credit)}</div>
                <ul>{(l.plans.items[i]?.features ?? []).map((f) => <li key={f}>{f}</li>)}</ul>
                <a className={i === 1 ? "btn block" : "btn ghost block"} href={CONSOLE.register} rel="noopener">{l.plans.items[i]?.cta ?? (locale === "ar" ? "إنشاء حساب" : "Create account")}</a>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="plan">
          <h3>{locale === "ar" ? "الباقات قيد الاعتماد" : "Wallet packages are being prepared"}</h3>
          <p className="blurb">{locale === "ar" ? "التسجيل متاح الآن. ستظهر الباقات فور اعتمادها وتفعيلها في النظام، ولن نعرض سعرًا غير قابل للشراء." : "Registration is open. Packages will appear as soon as they are approved and activated in the billing system."}</p>
          <a className="btn block" href={CONSOLE.register} rel="noopener">{l.plans.items[0]?.cta ?? "Create account"}</a>
        </div>
      )}
      <p className="muted plans-note">{l.plans.note}</p>
    </section>
  );
}

const SAMPLES = {
  node: `const res = await fetch("${API_URL}/v1/otp/send", {
  method: "POST",
  headers: {
    Authorization: "Bearer otp_test_YOUR_KEY",
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ channel: "email", to: "user@example.com" }),
});
const { id } = await res.json();`,
  py: `import requests, uuid

r = requests.post(
    "${API_URL}/v1/otp/send",
    headers={"Authorization": "Bearer otp_test_YOUR_KEY",
             "Idempotency-Key": str(uuid.uuid4())},
    json={"channel": "email", "to": "user@example.com"},
)
print(r.json()["id"])`,
  curl: `curl -X POST ${API_URL}/v1/otp/send \\
  -H "Authorization: Bearer otp_test_YOUR_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"email","to":"user@example.com"}'`,
  go: `body := strings.NewReader(\`{"channel":"email","to":"user@example.com"}\`)
req, _ := http.NewRequest("POST", "${API_URL}/v1/otp/send", body)
req.Header.Set("Authorization", "Bearer otp_test_YOUR_KEY")
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Idempotency-Key", uuid.NewString())
res, err := http.DefaultClient.Do(req)`,
};

export function DevSection({ locale, l }: { locale: Locale; l: Landing }) {
  return (
    <section className="wrap section">
      <div className="dev">
        <div>
          <h2 style={{ marginTop: 0 }}>{l.dev.title}</h2>
          <p className="lead">{l.dev.sub}</p>
          <ul>{l.dev.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <Link className="btn ghost" href={`/${locale}/developers`}>{l.dev.docs}</Link>
        </div>
        <div className="tabs">
          <input type="radio" name="sdk" id="t-node" defaultChecked />
          <input type="radio" name="sdk" id="t-py" />
          <input type="radio" name="sdk" id="t-curl" />
          <input type="radio" name="sdk" id="t-go" />
          <div className="tab-row" role="presentation">
            <label htmlFor="t-node">Node.js</label>
            <label htmlFor="t-py">Python</label>
            <label htmlFor="t-curl">cURL</label>
            <label htmlFor="t-go">Go</label>
          </div>
          <pre className="pane p-node"><code>{SAMPLES.node}</code></pre>
          <pre className="pane p-py"><code>{SAMPLES.py}</code></pre>
          <pre className="pane p-curl"><code>{SAMPLES.curl}</code></pre>
          <pre className="pane p-go"><code>{SAMPLES.go}</code></pre>
        </div>
      </div>
    </section>
  );
}

export function CtaBand({ locale, l }: { locale: Locale; l: Landing }) {
  return (
    <section className="wrap">
      <div className="band">
        <div><h2>{l.cta.title}</h2><p>{l.cta.sub}</p></div>
        <p className="cta">
          <a className="btn" href={CONSOLE.register} rel="noopener">{l.cta.signup}</a>
          <Link className="btn ghost" href={`/${locale}/developers`}>{l.cta.docs}</Link>
        </p>
      </div>
    </section>
  );
}

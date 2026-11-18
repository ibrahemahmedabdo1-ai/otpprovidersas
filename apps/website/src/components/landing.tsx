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
              <div className="phone-top">
                <span className="av"><img src="/icon.svg" alt="" width={18} height={18} /></span>
                <div><b>{l.hero.chatName}</b><small>{siteName}</small></div>
              </div>
              <div className="phone-body">
                <div className="dots"><span /><span /><span /></div>
                <div className="bubble">
                  {l.hero.sms}
                  <strong>582910</strong>
                  <small><span>{l.hero.chatNow}</span><em>✓✓ {l.hero.delivered}</em></small>
                </div>
              </div>
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

export function Plans({ locale, l }: { locale: Locale; l: Landing }) {
  return (
    <section className="wrap section" id="plans">
      <div className="sec-head"><h2>{l.plans.title}</h2><p>{l.plans.sub}</p></div>
      <div className="plans">
        {PLANS.map((p, i) => {
          const c = l.plans.items[i]!;
          return (
            <article key={p.id} className={p.popular ? "plan pop" : "plan"}>
              {p.popular && <span className="tag">{l.plans.popular}</span>}
              <h3>{c.name}</h3>
              <p className="blurb">{c.blurb}</p>
              {p.amountUsd === null
                ? <div className="price custom">{l.plans.custom}</div>
                : <div className="price" dir="ltr" style={{ textAlign: "start" }}>{formatUsd(locale, p.amountUsd)}</div>}
              <div className="unit">{p.amountUsd === null ? "" : l.plans.unit}</div>
              <ul>{c.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <a className={p.popular ? "btn block" : "btn ghost block"} href={p.amountUsd === null ? contactHref() : CONSOLE.register} rel="noopener">{c.cta}</a>
            </article>
          );
        })}
      </div>
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

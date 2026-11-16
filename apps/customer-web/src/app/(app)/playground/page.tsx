"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Field } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";
import { validEmail, fmtDate } from "../../../lib/format";

type Sent = { id: string; status: string; expiresAt: string; sandbox?: { code: string; message: string } };
const KEY_RE = /^otp_test_[A-Za-z0-9_-]{8,}$/;

export default function Playground() {
  const { t, locale, testKey, setTestKey } = useApp();
  const [keyInput, setKeyInput] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [to, setTo] = useState("");
  const [toErr, setToErr] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [reqId, setReqId] = useState("");
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "verify" | "resend" | "cancel">("");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const auth = () => ({ authorization: `Bearer ${testKey}`, "x-client-type": "web" });

  function useKey() {
    const k = keyInput.trim();
    if (k.startsWith("otp_live_")) { setKeyErr(t.errors.keyLive); return; }
    if (!KEY_RE.test(k)) { setKeyErr(t.errors.keyFormat); return; }
    setKeyErr(""); setTestKey(k); setKeyInput("");
  }

  async function send(e: FormEvent) {
    e.preventDefault(); setErr(""); setOkMsg(""); setToErr("");
    const v = to.trim();
    if (channel === "email" ? !validEmail(v) : !/^\+[1-9]\d{6,14}$/.test(v)) { setToErr(channel === "email" ? t.errors.recipientEmail : t.errors.recipientPhone); return; }
    setBusy("send");
    const r = await api<Sent>("POST", "/v1/otp/send", { body: { channel, to: v }, headers: auth() });
    setBusy("");
    if (r.ok && r.data) { setSent(r.data); setReqId(r.data.id); setCode(""); } else setErr(errorText(t, r));
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setErr(""); setOkMsg(""); setCodeErr("");
    if (!reqId.trim()) { setErr(t.playground.needRequest); return; }
    if (!/^\d{4,8}$/.test(code.trim())) { setCodeErr(t.errors.codeFormat); return; }
    setBusy("verify");
    const r = await api("POST", "/v1/otp/verify", { body: { id: reqId.trim(), code: code.trim() }, headers: auth() });
    setBusy("");
    if (r.ok) { setOkMsg(t.playground.verified); setSent((s) => (s ? { ...s, status: "verified", sandbox: undefined } : s)); } else setErr(errorText(t, r));
  }
  async function resend() {
    setErr(""); setOkMsg(""); if (!reqId.trim()) { setErr(t.playground.needRequest); return; }
    setBusy("resend");
    const r = await api<Sent>("POST", "/v1/otp/resend", { body: { id: reqId.trim() }, headers: auth() });
    setBusy("");
    if (r.ok && r.data) { setOkMsg(t.playground.resent); const d = r.data; setSent((s) => (s ? { ...s, status: d.status, sandbox: d.sandbox } : s)); } else setErr(errorText(t, r));
  }
  async function cancel() {
    setErr(""); setOkMsg(""); if (!reqId.trim()) { setErr(t.playground.needRequest); return; }
    setBusy("cancel");
    const r = await api("POST", "/v1/otp/cancel", { body: { id: reqId.trim() }, headers: auth() });
    setBusy("");
    if (r.ok) { setOkMsg(t.playground.cancelled); setSent((s) => (s ? { ...s, status: "cancelled", sandbox: undefined } : s)); } else setErr(errorText(t, r));
  }
  const statusLabel = (s: string) => ({ sent: t.playground.statusSent, verified: t.playground.statusVerified, cancelled: t.playground.statusCancelled } as Record<string, string>)[s] ?? s;

  return (
    <>
      <div className="pagehead"><h1>{t.playground.title}</h1><p>{t.playground.sub}</p></div>
      <Alert kind="info">{t.common.sandboxBanner}</Alert>

      <div className="card">
        <h2>{t.playground.keyTitle}</h2>
        {testKey ? (
          <div className="row">
            <span className="chip ok">{t.playground.keySet}</span><code dir="ltr">{testKey.slice(0, 14)}…</code>
            <button className="btn ghost small" type="button" onClick={() => setTestKey("")}>{t.playground.keyClear}</button>
          </div>
        ) : (
          <>
            <p className="muted">{t.playground.keyNone} <Link href="/projects">{t.playground.keyGoProjects}</Link></p>
            <Field label={t.playground.keyLabel} hint={t.playground.keyHint} error={keyErr}>
              {(p) => <input {...p} type="password" autoComplete="off" spellCheck={false} dir="ltr" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />}
            </Field>
            <button className="btn" type="button" onClick={useKey} disabled={!keyInput}>{t.playground.keyUse}</button>
          </>
        )}
      </div>

      {err && <Alert>{err}</Alert>}
      {okMsg && <Alert kind="ok">{okMsg}</Alert>}

      <form className="card" onSubmit={send} noValidate>
        <h2>{t.playground.sendTitle}</h2>
        <div className="seg" role="group" aria-label={t.playground.channel}>
          <button type="button" aria-pressed={channel === "email"} onClick={() => setChannel("email")}>{t.common.email}</button>
          <button type="button" aria-pressed={channel === "whatsapp"} onClick={() => setChannel("whatsapp")}>{t.common.whatsapp}</button>
        </div>
        {channel === "whatsapp" && <Alert kind="warn">{t.playground.waWarn}</Alert>}
        <Field label={t.playground.to} error={toErr}>
          {(p) => <input {...p} dir="ltr" autoComplete="off" placeholder={channel === "email" ? t.playground.toEmailPh : t.playground.toPhonePh} value={to} onChange={(e) => setTo(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={!testKey || busy !== "" || !to}>{busy === "send" ? t.playground.sending : t.playground.send}</button>
      </form>

      {sent && (
        <div className="card">
          <h2>{t.playground.sentTitle}</h2>
          <dl style={{ margin: 0 }}>
            <dt className="muted">{t.playground.requestId}</dt><dd dir="ltr" style={{ margin: "0 0 .5rem" }}>{sent.id}</dd>
            <dt className="muted">{t.playground.status}</dt><dd style={{ margin: "0 0 .5rem" }}>{statusLabel(sent.status)}</dd>
            <dt className="muted">{t.playground.expiresAt}</dt><dd style={{ margin: "0 0 .5rem" }}>{fmtDate(sent.expiresAt, locale)}</dd>
          </dl>
          {sent.sandbox && (<><p className="muted">{t.playground.sandboxCode}</p><p className="code" dir="ltr">{sent.sandbox.code}</p><Alert kind="info">{t.playground.sandboxNote}</Alert></>)}
        </div>
      )}

      <form className="card" onSubmit={verify} noValidate>
        <h2>{t.playground.verifyTitle}</h2>
        <Field label={t.playground.requestIdLabel}>
          {(p) => <input {...p} dir="ltr" autoComplete="off" value={reqId} onChange={(e) => setReqId(e.target.value)} />}
        </Field>
        <Field label={t.playground.codeLabel} error={codeErr}>
          {(p) => <input {...p} inputMode="numeric" dir="ltr" autoComplete="off" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <div className="row">
          <button className="btn" type="submit" disabled={!testKey || busy !== "" || !code}>{busy === "verify" ? t.playground.verifying : t.playground.verify}</button>
          <button className="btn ghost" type="button" onClick={() => void resend()} disabled={!testKey || busy !== "" || !reqId}>{busy === "resend" ? t.playground.resending : t.playground.resend}</button>
          <button className="btn ghost" type="button" onClick={() => void cancel()} disabled={!testKey || busy !== "" || !reqId}>{busy === "cancel" ? t.playground.cancelling : t.playground.cancelRequest}</button>
        </div>
      </form>
    </>
  );
}

"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field, Loading } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";

function Inner() {
  const { user, refresh, signOut } = useApp();
  const router = useRouter();
  const enrollParam = useSearchParams().get("enroll") === "1";
  const [mode, setMode] = useState<"verify" | "enroll">(enrollParam ? "enroll" : "verify");
  const [secret, setSecret] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user === null) router.replace("/login");
    else if (user && !user.mfaPending && !codes) router.replace("/");
  }, [user, codes, router]);

  async function startEnroll() {
    setErr(""); setBusy(true);
    const r = await api<{ secret: string; otpauthUri: string }>("POST", "/v1/auth/mfa/setup");
    setBusy(false);
    if (r.ok && r.data) { setSecret(r.data); setMode("enroll"); } else setErr(errorText(r));
  }
  useEffect(() => { if (mode === "enroll" && !secret && !codes) void startEnroll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode]);

  async function confirm(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!/^\d{6}$/.test(code.trim())) { setErr("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    const r = await api<{ recoveryCodes: string[] }>("POST", "/v1/auth/mfa/confirm", { code: code.trim() });
    setBusy(false);
    if (r.ok && r.data) { setCodes(r.data.recoveryCodes); setSecret(null); setCode(""); } else setErr(errorText(r));
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setErr("");
    const v = code.trim();
    if (!useRecovery && !/^\d{6}$/.test(v)) { setErr("Enter the 6-digit code from your authenticator app."); return; }
    if (useRecovery && v.length < 6) { setErr("Enter one of your recovery codes."); return; }
    setBusy(true);
    const r = await api("POST", "/v1/auth/mfa/verify", useRecovery ? { recoveryCode: v } : { code: v });
    if (r.ok) { await refresh(); router.replace("/"); return; }
    setBusy(false); setErr(errorText(r));
  }
  async function finish() { await refresh(); router.replace("/"); }

  if (user === undefined) return <AuthFrame title="Two-step verification"><Loading /></AuthFrame>;

  if (codes) {
    return (
      <AuthFrame title="Save your recovery codes" sub="Each code works once if you lose your authenticator. They are shown only now.">
        <p className="code" dir="ltr" style={{ fontSize: "1.05rem", letterSpacing: ".08em", lineHeight: 1.9 }}>{codes.map((c) => <span key={c} style={{ display: "block" }}>{c}</span>)}</p>
        <Alert kind="warn">Store them in a password manager or printed in a safe place. Support cannot recover them for you.</Alert>
        <label className="row" style={{ margin: ".6rem 0" }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes</label>
        <button className="btn" disabled={!saved} onClick={() => void finish()}>Continue</button>
      </AuthFrame>
    );
  }
  if (mode === "enroll") {
    return (
      <AuthFrame title="Set up two-step verification" sub="Add this account to an authenticator app (Google Authenticator, Authy, 1Password…).">
        {err && <Alert>{err}</Alert>}
        {secret ? (
          <>
            <p className="muted">Enter this key manually in your app (time-based, 6 digits, 30 s):</p>
            <p className="code" dir="ltr" style={{ fontSize: "1.1rem", letterSpacing: ".1em", wordBreak: "break-all" }}>{secret.secret}</p>
            <details><summary>Setup link</summary><p dir="ltr" style={{ wordBreak: "break-all" }} className="muted">{secret.otpauthUri}</p></details>
            <form onSubmit={confirm} noValidate>
              <Field label="6-digit code">{(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
              <button className="btn" type="submit" disabled={busy || !code}>{busy ? "Checking" : "Confirm and enable"}</button>
            </form>
          </>
        ) : <Loading />}
        <p style={{ marginTop: "1rem" }}><button className="btn ghost small" onClick={() => void signOut()}>Sign out</button></p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Two-step verification" sub={useRecovery ? "Enter one of your recovery codes. It can be used once." : "Enter the 6-digit code from your authenticator app."}>
      <form onSubmit={verify} noValidate>
        {err && <Alert>{err}</Alert>}
        <Field label={useRecovery ? "Recovery code" : "6-digit code"}>
          {(p) => <input {...p} inputMode={useRecovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={useRecovery ? 32 : 6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={busy || !code}>{busy ? "Checking" : "Verify"}</button>
      </form>
      <p className="row" style={{ marginTop: "1rem" }}>
        <button className="btn ghost small" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setErr(""); }}>{useRecovery ? "Use authenticator code" : "Use a recovery code"}</button>
        <button className="btn ghost small" onClick={() => setMode("enroll")}>Not set up yet?</button>
        <button className="btn ghost small" onClick={() => void signOut()}>Sign out</button>
      </p>
    </AuthFrame>
  );
}
export default function Mfa() { return <Suspense fallback={null}><Inner /></Suspense>; }

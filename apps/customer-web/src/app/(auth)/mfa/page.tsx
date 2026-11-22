"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field, Loading } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";


const M = {
  en: { title: "Two-step verification", saveTitle: "Save your recovery codes", saveSub: "Each code works once if you lose your authenticator. They are shown only now.", saveWarn: "Store them in a password manager or printed in a safe place. Support cannot recover them for you.", saved: "I have saved these codes", cont: "Continue", setupTitle: "Set up two-step verification", setupSub: "Add this account to an authenticator app (Google Authenticator, Authy, 1Password…).", key: "Enter this key manually in your app (time-based, 6 digits, 30 s):", link: "Setup link", code6: "6-digit code", checking: "Checking", confirm: "Confirm and enable", recSub: "Enter one of your recovery codes. It can be used once.", codeSub: "Enter the 6-digit code from your authenticator app.", recErr: "Enter one of your recovery codes.", rec: "Recovery code", verify: "Verify", useApp: "Use authenticator code", useRec: "Use a recovery code", notYet: "Not set up yet?" },
  ar: { title: "التحقق بخطوتين", saveTitle: "احفظ رموز الاسترجاع", saveSub: "كل رمز يعمل مرة واحدة إذا فقدت تطبيق المصادقة. تظهر الآن فقط.", saveWarn: "احفظها في مدير كلمات مرور أو اطبعها وضعها في مكان آمن. لا يستطيع الدعم استرجاعها لك.", saved: "لقد حفظت هذه الرموز", cont: "متابعة", setupTitle: "إعداد التحقق بخطوتين", setupSub: "أضف هذا الحساب إلى تطبيق مصادقة (Google Authenticator أو Authy أو 1Password…).", key: "أدخل هذا المفتاح يدويًا في التطبيق (زمني، 6 أرقام، 30 ثانية):", link: "رابط الإعداد", code6: "رمز من 6 أرقام", checking: "جارٍ التحقق", confirm: "تأكيد وتفعيل", recSub: "أدخل أحد رموز الاسترجاع. يُستخدم مرة واحدة.", codeSub: "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.", recErr: "أدخل أحد رموز الاسترجاع.", rec: "رمز الاسترجاع", verify: "تحقق", useApp: "استخدم رمز التطبيق", useRec: "استخدم رمز استرجاع", notYet: "لم تُعدّه بعد؟" },
} as const;

function Inner() {
  const { t, locale, user, refresh, signOut } = useApp();
  const m = M[locale === "ar" ? "ar" : "en"];
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
    if (r.ok && r.data) { setSecret(r.data); setMode("enroll"); } else setErr(errorText(t, r));
  }
  useEffect(() => { if (mode === "enroll" && !secret && !codes) void startEnroll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode]);

  async function confirm(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!/^\d{6}$/.test(code.trim())) { setErr(m.codeSub); return; }
    setBusy(true);
    const r = await api<{ recoveryCodes: string[] }>("POST", "/v1/auth/mfa/confirm", { body: { code: code.trim() } });
    setBusy(false);
    if (r.ok && r.data) { setCodes(r.data.recoveryCodes); setSecret(null); setCode(""); } else setErr(errorText(t, r));
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setErr("");
    const v = code.trim();
    if (!useRecovery && !/^\d{6}$/.test(v)) { setErr(m.codeSub); return; }
    if (useRecovery && v.length < 6) { setErr(m.recErr); return; }
    setBusy(true);
    const r = await api("POST", "/v1/auth/mfa/verify", { body: useRecovery ? { recoveryCode: v } : { code: v } });
    if (r.ok) { await refresh(); router.replace("/"); return; }
    setBusy(false); setErr(errorText(t, r));
  }
  async function finish() { await refresh(); router.replace("/"); }

  if (user === undefined) return <AuthFrame title={m.title}><Loading /></AuthFrame>;

  if (codes) {
    return (
      <AuthFrame title={m.saveTitle} sub={m.saveSub}>
        <p className="code" dir="ltr" style={{ fontSize: "1.05rem", letterSpacing: ".08em", lineHeight: 1.9 }}>{codes.map((c) => <span key={c} style={{ display: "block" }}>{c}</span>)}</p>
        <Alert kind="warn">{m.saveWarn}</Alert>
        <label className="row" style={{ margin: ".6rem 0" }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> {m.saved}</label>
        <button className="btn" disabled={!saved} onClick={() => void finish()}>{m.cont}</button>
      </AuthFrame>
    );
  }
  if (mode === "enroll") {
    return (
      <AuthFrame title={m.setupTitle} sub={m.setupSub}>
        {err && <Alert>{err}</Alert>}
        {secret ? (
          <>
            <p className="muted">{m.key}</p>
            <p className="code" dir="ltr" style={{ fontSize: "1.1rem", letterSpacing: ".1em", wordBreak: "break-all" }}>{secret.secret}</p>
            <details><summary>{m.link}</summary><p dir="ltr" style={{ wordBreak: "break-all" }} className="muted">{secret.otpauthUri}</p></details>
            <form onSubmit={confirm} noValidate>
              <Field label={m.code6}>{(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
              <button className="btn" type="submit" disabled={busy || !code}>{busy ? m.checking : m.confirm}</button>
            </form>
          </>
        ) : <Loading />}
        <p style={{ marginTop: "1rem" }}><button className="btn ghost small" onClick={() => void signOut()}>{t.common.signOut}</button></p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={m.title} sub={useRecovery ? m.recSub : m.codeSub}>
      <form onSubmit={verify} noValidate>
        {err && <Alert>{err}</Alert>}
        <Field label={useRecovery ? m.rec : m.code6}>
          {(p) => <input {...p} inputMode={useRecovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={useRecovery ? 32 : 6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={busy || !code}>{busy ? m.checking : m.verify}</button>
      </form>
      <p className="row" style={{ marginTop: "1rem" }}>
        <button className="btn ghost small" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setErr(""); }}>{useRecovery ? m.useApp : m.useRec}</button>
        <button className="btn ghost small" onClick={() => setMode("enroll")}>{m.notYet}</button>
        <button className="btn ghost small" onClick={() => void signOut()}>{t.common.signOut}</button>
      </p>
    </AuthFrame>
  );
}
export default function Mfa() { return <Suspense fallback={null}><Inner /></Suspense>; }

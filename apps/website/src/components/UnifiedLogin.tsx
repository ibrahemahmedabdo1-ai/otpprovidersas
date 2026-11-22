"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "../i18n/config";
import { PANELS } from "../lib/site";
import { panelsFor, type Panel } from "../lib/panels";

const S = {
  en: { title: "Sign in", sub: "One sign-in for your console, the admin panel and support. You are sent to the right place for your account.", email: "Email", password: "Password", signin: "Sign in", checking: "Checking", code: "6-digit code", recovery: "Recovery code", verify: "Verify", useRecovery: "Use a recovery code", useApp: "Use authenticator code", mfaTitle: "Two-step verification", mfaSub: "Enter the code from your authenticator app.", choose: "Where do you want to go?", console: "Customer console", admin: "Admin panel", support: "Support panel", going: "Opening your panel…", bad: "Email or password is incorrect.", unverified: "Verify your email first, then sign in.", disabled: "This account is disabled.", limited: "Too many attempts. Wait a few minutes and try again.", failed: "Could not sign in. Try again.", badCode: "That code is not valid.", noMfa: "Two-step verification is not set up for this account yet. Sign in to your panel directly to set it up.", openPanel: "Open sign-in", register: "Create a customer account", cannot: "Your account cannot open a panel from here." },
  ar: { title: "تسجيل الدخول", sub: "دخول واحد للوحة العميل ولوحة الأدمن والدعم. نوجّهك إلى المكان المناسب لحسابك.", email: "البريد الإلكتروني", password: "كلمة المرور", signin: "دخول", checking: "جارٍ التحقق", code: "رمز من 6 أرقام", recovery: "رمز الاسترجاع", verify: "تحقق", useRecovery: "استخدم رمز استرجاع", useApp: "استخدم رمز التطبيق", mfaTitle: "التحقق بخطوتين", mfaSub: "أدخل الرمز من تطبيق المصادقة.", choose: "إلى أين تريد الذهاب؟", console: "لوحة العميل", admin: "لوحة الأدمن", support: "لوحة الدعم", going: "جارٍ فتح لوحتك…", bad: "البريد أو كلمة المرور غير صحيحة.", unverified: "فعّل بريدك أولًا ثم سجّل الدخول.", disabled: "هذا الحساب معطّل.", limited: "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجددًا.", failed: "تعذّر تسجيل الدخول. حاول مرة أخرى.", badCode: "الرمز غير صحيح.", noMfa: "لم يتم إعداد التحقق بخطوتين لهذا الحساب بعد. سجّل الدخول من لوحتك مباشرة لإعداده.", openPanel: "فتح صفحة الدخول", register: "إنشاء حساب عميل", cannot: "لا يمكن لحسابك فتح لوحة من هنا." },
} as const;

type Me = { role: string };
type Step = "creds" | "mfa" | "choose" | "going" | "nomfa";

async function call<T = Record<string, unknown>>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    let data: T | null = null;
    if (res.status !== 204) { try { data = (await res.json()) as T; } catch { data = null; } }
    return { ok: res.ok, status: res.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}

export default function UnifiedLogin({ locale }: { locale: Locale }) {
  const t = S[locale === "ar" ? "ar" : "en"];
  const [step, setStep] = useState<Step>("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go(target: Panel) {
    setStep("going"); setErr("");
    const r = await call<{ code: string }>("/v1/auth/sso/start", { target });
    if (!r.ok || !r.data?.code) { setStep("choose"); setErr(t.failed); return; }
    await call("/v1/auth/logout");   // leave nothing signed in on the website itself
    window.location.assign(`${PANELS[target]}/sso#code=${encodeURIComponent(r.data.code)}`);
  }
  function proceed(r: string) {
    setRole(r);
    const p = panelsFor(r);
    if (p.length === 1) void go(p[0]);
    else if (p.length > 1) setStep("choose");
    else { setErr(t.cannot); setStep("creds"); void call("/v1/auth/logout"); }
  }
  async function login(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await call<{ user?: Me; mfa?: { required: boolean; enrolled?: boolean }; error?: string }>("/v1/auth/login", { email: email.trim(), password });
    setBusy(false);
    if (!r.ok) {
      const k = r.data?.error;
      setErr(r.status === 429 ? t.limited : k === "email_not_verified" ? t.unverified : k === "account_disabled" ? t.disabled : k === "invalid_credentials" ? t.bad : t.failed);
      return;
    }
    const rl = r.data?.user?.role ?? "";
    setRole(rl); setPassword("");
    if (r.data?.mfa?.required) {
      if (!r.data.mfa.enrolled) { await call("/v1/auth/logout"); setStep("nomfa"); return; }
      setStep("mfa"); return;
    }
    proceed(rl);
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const v = code.trim();
    const r = await call("/v1/auth/mfa/verify", recovery ? { recoveryCode: v } : { code: v });
    setBusy(false);
    if (!r.ok) { setErr(r.status === 429 ? t.limited : t.badCode); return; }
    proceed(role);
  }

  const panelLabel: Record<Panel, string> = { console: t.console, admin: t.admin, support: t.support };
  return (
    <div className="card narrow" style={{ margin: "0 auto" }}>
      {step === "creds" && (
        <form onSubmit={login} noValidate>
          <h1>{t.title}</h1>
          <p className="muted">{t.sub}</p>
          {err && <p role="alert" className="muted" style={{ color: "var(--danger, #e5484d)" }}>{err}</p>}
          <label>{t.email}<input type="email" autoComplete="username" inputMode="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>{t.password}<input type="password" autoComplete="current-password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn" type="submit" disabled={busy || !email || !password}>{busy ? t.checking : t.signin}</button>
        </form>
      )}
      {step === "mfa" && (
        <form onSubmit={verify} noValidate>
          <h1>{t.mfaTitle}</h1>
          <p className="muted">{t.mfaSub}</p>
          {err && <p role="alert" className="muted" style={{ color: "var(--danger, #e5484d)" }}>{err}</p>}
          <label>{recovery ? t.recovery : t.code}<input inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={recovery ? 32 : 6} dir="ltr" required value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <button className="btn" type="submit" disabled={busy || !code}>{busy ? t.checking : t.verify}</button>{" "}
          <button className="btn ghost small" type="button" onClick={() => { setRecovery(!recovery); setCode(""); setErr(""); }}>{recovery ? t.useApp : t.useRecovery}</button>
        </form>
      )}
      {step === "choose" && (
        <div>
          <h1>{t.choose}</h1>
          {err && <p role="alert" className="muted">{err}</p>}
          <p style={{ display: "grid", gap: ".6rem" }}>{panelsFor(role).map((p) => <button key={p} className="btn" type="button" onClick={() => void go(p)}>{panelLabel[p]}</button>)}</p>
        </div>
      )}
      {step === "going" && <p role="status">{t.going}</p>}
      {step === "nomfa" && (
        <div>
          <h1>{t.mfaTitle}</h1>
          <p className="muted">{t.noMfa}</p>
          <p style={{ display: "grid", gap: ".6rem" }}>{panelsFor(role).map((p) => <a key={p} className="btn" href={`${PANELS[p]}/login`} rel="noopener">{panelLabel[p]}: {t.openPanel}</a>)}</p>
        </div>
      )}
    </div>
  );
}

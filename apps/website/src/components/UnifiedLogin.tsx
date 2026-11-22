"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "../i18n/config";
import { PANELS } from "../lib/site";
import { panelsFor, type Panel } from "../lib/panels";

const S = {
  en: { title: "Sign in", sub: "One sign-in for your console, the admin panel and support. You are sent to the right place for your account.", email: "Email", password: "Password", signin: "Sign in", checking: "Checking", code: "6-digit code", recovery: "Recovery code", verify: "Verify", useRecovery: "Use a recovery code", useApp: "Use authenticator code", mfaTitle: "Two-step verification", mfaSub: "Enter the code from your authenticator app.", choose: "Where do you want to go?", console: "Customer console", admin: "Admin panel", support: "Support panel", going: "Opening your panel…", bad: "Email or password is incorrect.", unverified: "Verify your email first, then sign in.", disabled: "This account is disabled.", limited: "Too many attempts. Wait a few minutes and try again.", failed: "Could not sign in. Try again.", badCode: "That code is not valid.", noMfa: "Two-step verification is not set up for this account yet. Sign in to your panel directly to set it up.", openPanel: "Open sign-in", register: "Create a customer account", cannot: "Your account cannot open a panel from here." },
  ar: { title: "تسجيل الدخول", sub: "دخول واحد للوحة العميل ولوحة الأدمن والدعم. نوجّهك إلى المكان المناسب لحسابك.", email: "البريد الإلكتروني", password: "كلمة المرور", signin: "دخول", checking: "جارٍ التحقق", code: "رمز من 6 أرقام", recovery: "رمز الاسترجاع", verify: "تحقق", useRecovery: "استخدم رمز استرجاع", useApp: "استخدم رمز التطبيق", mfaTitle: "التحقق بخطوتين", mfaSub: "أدخل الرمز من تطبيق المصادقة.", choose: "إلى أين تريد الذهاب؟", console: "لوحة العميل", admin: "لوحة الأدمن", support: "لوحة الدعم", going: "جارٍ فتح لوحتك…", bad: "البريد أو كلمة المرور غير صحيحة.", unverified: "فعّل بريدك أولًا ثم سجّل الدخول.", disabled: "هذا الحساب معطّل.", limited: "محاولات كثيرة. انتظر بضع دقائق ثم حاول مجددًا.", failed: "تعذّر تسجيل الدخول. حاول مرة أخرى.", badCode: "الرمز غير صحيح.", noMfa: "لم يتم إعداد التحقق بخطوتين لهذا الحساب بعد. سجّل الدخول من لوحتك مباشرة لإعداده.", openPanel: "فتح صفحة الدخول", register: "إنشاء حساب عميل", cannot: "لا يمكن لحسابك فتح لوحة من هنا." },
  ru: { title: "Вход", sub: "Один вход для консоли клиента, панели администратора и поддержки. Мы направим вас в нужный раздел.", email: "Эл. почта", password: "Пароль", signin: "Войти", checking: "Проверка", code: "6-значный код", recovery: "Код восстановления", verify: "Подтвердить", useRecovery: "Использовать код восстановления", useApp: "Использовать код из приложения", mfaTitle: "Двухэтапная проверка", mfaSub: "Введите код из приложения-аутентификатора.", choose: "Куда перейти?", console: "Консоль клиента", admin: "Панель администратора", support: "Панель поддержки", going: "Открываем вашу панель…", bad: "Неверная почта или пароль.", unverified: "Сначала подтвердите почту, затем войдите.", disabled: "Эта учётная запись отключена.", limited: "Слишком много попыток. Подождите несколько минут.", failed: "Не удалось войти. Повторите попытку.", badCode: "Неверный код.", noMfa: "Для этой учётной записи двухэтапная проверка ещё не настроена. Войдите прямо в свою панель, чтобы настроить её.", openPanel: "Открыть вход", register: "Создать аккаунт клиента", cannot: "Эта учётная запись не может открыть панель отсюда." },
  es: { title: "Iniciar sesión", sub: "Un solo acceso para tu consola, el panel de administración y soporte. Te enviamos al lugar correcto según tu cuenta.", email: "Correo electrónico", password: "Contraseña", signin: "Entrar", checking: "Comprobando", code: "Código de 6 dígitos", recovery: "Código de recuperación", verify: "Verificar", useRecovery: "Usar un código de recuperación", useApp: "Usar código de la app", mfaTitle: "Verificación en dos pasos", mfaSub: "Introduce el código de tu app de autenticación.", choose: "¿A dónde quieres ir?", console: "Consola de cliente", admin: "Panel de administración", support: "Panel de soporte", going: "Abriendo tu panel…", bad: "Correo o contraseña incorrectos.", unverified: "Verifica primero tu correo y luego inicia sesión.", disabled: "Esta cuenta está desactivada.", limited: "Demasiados intentos. Espera unos minutos.", failed: "No se pudo iniciar sesión. Inténtalo de nuevo.", badCode: "Ese código no es válido.", noMfa: "La verificación en dos pasos aún no está configurada para esta cuenta. Entra directamente en tu panel para configurarla.", openPanel: "Abrir inicio de sesión", register: "Crear una cuenta de cliente", cannot: "Tu cuenta no puede abrir un panel desde aquí." },
  de: { title: "Anmelden", sub: "Eine Anmeldung für Ihre Konsole, das Admin-Panel und den Support. Sie werden zum passenden Bereich weitergeleitet.", email: "E-Mail", password: "Passwort", signin: "Anmelden", checking: "Wird geprüft", code: "6-stelliger Code", recovery: "Wiederherstellungscode", verify: "Bestätigen", useRecovery: "Wiederherstellungscode verwenden", useApp: "Authenticator-Code verwenden", mfaTitle: "Zwei-Faktor-Bestätigung", mfaSub: "Geben Sie den Code aus Ihrer Authenticator-App ein.", choose: "Wohin möchten Sie?", console: "Kundenkonsole", admin: "Admin-Panel", support: "Support-Panel", going: "Ihr Panel wird geöffnet…", bad: "E-Mail oder Passwort ist falsch.", unverified: "Bestätigen Sie zuerst Ihre E-Mail und melden Sie sich dann an.", disabled: "Dieses Konto ist deaktiviert.", limited: "Zu viele Versuche. Bitte warten Sie einige Minuten.", failed: "Anmeldung nicht möglich. Bitte erneut versuchen.", badCode: "Dieser Code ist ungültig.", noMfa: "Die Zwei-Faktor-Bestätigung ist für dieses Konto noch nicht eingerichtet. Melden Sie sich direkt in Ihrem Panel an, um sie einzurichten.", openPanel: "Anmeldung öffnen", register: "Kundenkonto erstellen", cannot: "Ihr Konto kann von hier aus kein Panel öffnen." },
  zh: { title: "登录", sub: "一次登录即可进入客户控制台、管理后台和支持后台，系统会根据你的账号跳转到合适的位置。", email: "电子邮箱", password: "密码", signin: "登录", checking: "正在验证", code: "6 位验证码", recovery: "恢复码", verify: "验证", useRecovery: "使用恢复码", useApp: "使用验证器验证码", mfaTitle: "两步验证", mfaSub: "请输入验证器应用中的验证码。", choose: "你想前往哪里？", console: "客户控制台", admin: "管理后台", support: "支持后台", going: "正在打开你的后台…", bad: "邮箱或密码不正确。", unverified: "请先验证邮箱，然后再登录。", disabled: "此账号已被停用。", limited: "尝试次数过多，请等待几分钟后重试。", failed: "无法登录，请重试。", badCode: "验证码无效。", noMfa: "此账号尚未设置两步验证。请直接登录你的后台进行设置。", openPanel: "打开登录页", register: "创建客户账号", cannot: "你的账号无法从此处打开后台。" },
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
  const t = S[locale];
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
    if (p.length === 1 && p[0]) void go(p[0]);
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

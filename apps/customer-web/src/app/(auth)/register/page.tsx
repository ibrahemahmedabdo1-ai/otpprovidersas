"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";
import { validEmail } from "../../../lib/format";

type Fields = { email?: string; password?: string; name?: string };

export default function Register() {
  const { t, locale } = useApp();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resending,setResending]=useState(false);
  const [resendMsg,setResendMsg]=useState("");
  const [msg, setMsg] = useState("");
  const [fe, setFe] = useState<Fields>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(""); const f: Fields = {};
    if (!validEmail(email.trim())) f.email = t.errors.emailInvalid;
    if (password.length < 12) f.password = t.errors.passwordShort;
    if (password.length > 128) f.password = t.errors.passwordLong;
    setFe(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    const r = await api<{ fields?: Record<string, string> }>("POST", "/v1/auth/register", { body: { email: email.trim(), password, name: name.trim() || undefined, locale } });
    setBusy(false);
    if (r.ok) { setDone(true); return; }
    if (r.status === 400 && r.data?.fields) {
      const srv = r.data.fields;
      setFe({ email: srv.email ? t.errors.emailInvalid : undefined, password: srv.password ? t.errors.passwordCommon : undefined, name: srv.name ? t.errors.nameInvalid : undefined });
      setMsg(t.errors.validation_failed);
    } else setMsg(errorText(t, r));
  }

  if (done) {
    return (
      <AuthFrame title={t.auth.register.doneTitle}>
        <Alert kind="ok">{t.auth.register.doneBody}</Alert>
        {resendMsg&&<Alert>{resendMsg}</Alert>}
        <button className="btn ghost" disabled={resending} onClick={async()=>{setResending(true);setResendMsg("");const r=await api("POST","/v1/auth/resend-verification",{body:{email:email.trim()}});setResending(false);setResendMsg(r.ok?(locale==="ar"?"إذا كان الحساب يحتاج إلى التحقق فسيتم إرسال رسالة جديدة قريبًا.":"If the account needs verification, a new email will be sent shortly."):(locale==="ar"?"تعذر طلب رسالة جديدة الآن. حاول لاحقًا.":"Could not request another email right now. Try again later."));}}>{resending?(locale==="ar"?"جارٍ الإرسال…":"Sending…"):(locale==="ar"?"إعادة إرسال رسالة التحقق":"Resend verification email")}</button>
        <p><Link className="btn" href="/login">{t.auth.register.toLogin}</Link></p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={t.auth.register.title} sub={t.auth.register.sub}>
      <form onSubmit={submit} noValidate>
        {msg && <Alert>{msg}</Alert>}
        <Field label={t.auth.name} hint={t.auth.register.nameHint} error={fe.name}>
          {(p) => <input {...p} autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t.auth.email} error={fe.email}>
          {(p) => <input {...p} type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t.auth.password} hint={t.auth.register.passwordHint} error={fe.password}>
          {(p) => <input {...p} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={busy}>{busy ? t.auth.register.submitting : t.auth.register.submit}</button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>{t.auth.register.haveAccount} <Link href="/login">{t.auth.register.signIn}</Link></p>
    </AuthFrame>
  );
}

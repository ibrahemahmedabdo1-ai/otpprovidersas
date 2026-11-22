"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";
import { validEmail } from "../../../lib/format";

type LoginOk = { mfa?: { required: boolean; enrolled?: boolean } };

export default function Login() {
  const { t, refresh } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const [emailErr, setEmailErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!validEmail(email.trim())) { setEmailErr(t.errors.emailInvalid); return; }
    setEmailErr("");
    setBusy(true);
    const r = await api<LoginOk>("POST", "/v1/auth/login", { body: { email: email.trim(), password } });
    if (r.ok && r.data?.mfa?.required) {
      await refresh();
      router.replace(r.data.mfa.enrolled ? "/mfa" : "/mfa?enroll=1");
      return;
    } else if (r.ok) {
      await refresh();
      router.replace("/");
      return;
    } else {
      setMsg({ kind: "error", text: errorText(t, r) });
    }
    setBusy(false);
  }

  return (
    <AuthFrame title={t.auth.login.title} sub={t.auth.login.sub}>
      <form onSubmit={submit} noValidate>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Field label={t.auth.email} error={emailErr}>
          {(p) => <input {...p} type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t.auth.password}>
          {(p) => <input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={busy || !email || !password}>{busy ? t.auth.login.submitting : t.auth.login.submit}</button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}><Link href="/forgot-password">{t.forgot.link}</Link></p>
      <p className="muted" style={{ marginTop: ".4rem" }}>{t.auth.login.noAccount} <Link href="/register">{t.auth.login.create}</Link></p>
    </AuthFrame>
  );
}

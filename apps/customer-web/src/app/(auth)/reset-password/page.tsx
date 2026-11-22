"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";

export default function Reset() {
  const { t } = useApp();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [fe, setFe] = useState("");
  const [state, setState] = useState<"form" | "ok" | "fail">("form");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token")); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setFe("");
    if (password.length < 12) { setFe(t.errors.passwordShort); return; }
    if (password.length > 128) { setFe(t.errors.passwordLong); return; }
    setBusy(true);
    const r = await api<{ error?: string; fields?: { password?: string } }>("POST", "/v1/auth/password/reset", { body: { token, password } });
    setBusy(false);
    if (r.ok) { setState("ok"); setPassword(""); return; }
    const code = r.data?.error;
    if (code === "invalid_or_expired_token") setState("fail");
    else if (code === "validation_failed") setFe(t.errors.passwordCommon);
    else setErr(errorText(t, r));
  }
  if (token === undefined) return <AuthFrame title={t.reset.title}><p role="status">{t.common.loading}…</p></AuthFrame>;
  return (
    <AuthFrame title={state === "ok" ? t.reset.okTitle : t.reset.title} sub={state === "form" && token ? t.reset.sub : undefined}>
      {!token && <Alert kind="warn">{t.reset.missing}</Alert>}
      {token && state === "form" && (
        <form onSubmit={submit} noValidate>
          {err && <Alert>{err}</Alert>}
          <Field label={t.reset.newPassword} error={fe} hint={t.auth.register.passwordHint}>{(p) => <input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <button className="btn" type="submit" disabled={busy || !password}>{busy ? t.reset.submitting : t.reset.submit}</button>
        </form>
      )}
      {state === "ok" && <><Alert kind="ok">{t.reset.okBody}</Alert><Link className="btn" href="/login">{t.auth.verify.toLogin}</Link></>}
      {state === "fail" && <><Alert>{t.reset.failBody}</Alert><Link className="btn" href="/forgot-password">{t.forgot.link}</Link></>}
    </AuthFrame>
  );
}

"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";
import { validEmail } from "../../../lib/format";

export default function Forgot() {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!validEmail(email.trim())) { setErr(t.errors.emailInvalid); return; }
    setBusy(true);
    const r = await api("POST", "/v1/auth/password/forgot", { body: { email: email.trim() } });
    setBusy(false);
    if (r.ok) setDone(true); else setErr(errorText(t, r));
  }
  return (
    <AuthFrame title={done ? t.forgot.doneTitle : t.forgot.title} sub={done ? undefined : t.forgot.sub}>
      {done ? <Alert kind="ok">{t.forgot.doneBody}</Alert> : (
        <form onSubmit={submit} noValidate>
          {err && <Alert>{err}</Alert>}
          <Field label={t.auth.email}>{(p) => <input {...p} type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <button className="btn" type="submit" disabled={busy || !email}>{busy ? t.forgot.submitting : t.forgot.submit}</button>
        </form>
      )}
      <p className="muted" style={{ marginTop: "1rem" }}><Link href="/login">{t.forgot.back}</Link></p>
    </AuthFrame>
  );
}

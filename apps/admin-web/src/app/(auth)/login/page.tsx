"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Field } from "../../../components/ui";
import { api, errorText, validEmail } from "../../../lib/api";

type LoginOk = { mfa?: { required: boolean; enrolled: boolean } };

export default function Login() {
  const { refresh } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!validEmail(email.trim())) { setErr("Enter a valid email address."); return; }
    setBusy(true);
    const r = await api<LoginOk>("POST", "/v1/auth/login", { email: email.trim(), password });
    if (!r.ok) { setErr(errorText(r)); setBusy(false); return; }
    await refresh();
    if (r.data?.mfa?.required) router.replace(r.data.mfa.enrolled ? "/mfa" : "/mfa?enroll=1");
    else router.replace("/");
  }
  return (
    <AuthFrame title="Staff sign in" sub="Staff accounts always require two-step verification.">
      <form onSubmit={submit} noValidate>
        {err && <Alert>{err}</Alert>}
        <Field label="Email">{(p) => <input {...p} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">{(p) => <input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <button className="btn" type="submit" disabled={busy || !email || !password}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </AuthFrame>
  );
}

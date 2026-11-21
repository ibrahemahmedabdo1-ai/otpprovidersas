"use client";
import { useState, type FormEvent } from "react";
import { Alert, Field } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText } from "../../../lib/api";

export default function Staff() {
  const { user } = useApp();
  const isSuper = user?.role === "super_admin";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("support_staff");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ k: "ok" | "error"; t: string } | null>(null);
  async function create(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    const r = await api("POST", "/v1/admin/staff", { email: email.trim(), name: name.trim(), role, password });
    if (r.ok) { setMsg({ k: "ok", t: `Account created for ${email.trim()}. Share the password privately. They must set up MFA at first sign-in.` }); setEmail(""); setName(""); setPassword(""); }
    else setMsg({ k: "error", t: errorText(r) });
  }
  if (!isSuper) return <Alert kind="warn">Only a Super Admin can create staff accounts.</Alert>;
  return (
    <>
      <div className="pagehead"><h1>Staff accounts</h1><p>Create an Admin or Support account. The new person must enrol MFA at first sign-in. Suspend them later from Users.</p></div>
      {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
      <form className="card" onSubmit={create}>
        <Field label="Email">{(p) => <input {...p} type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />}</Field>
        <Field label="Display name">{(p) => <input {...p} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Role">{(p) => <select {...p} value={role} onChange={(e) => setRole(e.target.value)}><option value="support_staff">Support</option><option value="admin_staff">Admin</option></select>}</Field>
        <Field label="Initial password" hint="At least 12 characters. Not stored in plain text.">{(p) => <input {...p} type="password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}</Field>
        <button className="btn" type="submit">Create account</button>
      </form>
    </>
  );
}

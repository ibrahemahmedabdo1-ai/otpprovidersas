"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Field, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText } from "../../../lib/api";

type C = { legalName: string; address: string; email: string; phone: string };

export default function Company() {
  const { user } = useApp();
  const isSuper = user?.role === "super_admin";
  const [c, setC] = useState<C | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "error"; t: string } | null>(null);
  useEffect(() => { void api<C>("GET", "/v1/admin/company").then((r) => setC(r.ok && r.data ? r.data : { legalName: "", address: "", email: "", phone: "" })); }, []);
  async function save(e: FormEvent) {
    e.preventDefault(); if (!c) return; setMsg(null);
    const r = await api("POST", "/v1/admin/company", c);
    setMsg(r.ok ? { k: "ok", t: "Saved. The website footer updates within a few minutes." } : { k: "error", t: errorText(r) });
  }
  if (!c) return <Loading />;
  const set = (k: keyof C) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value });
  return (
    <>
      <div className="pagehead"><h1>Company details</h1><p>Shown in the public website footer. Leave a field empty to hide it. Only a Super Admin can change these.</p></div>
      {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
      <form className="card" onSubmit={save}>
        <Field label="Legal name">{(p) => <input {...p} value={c.legalName} maxLength={120} onChange={set("legalName")} disabled={!isSuper} />}</Field>
        <Field label="Address" hint="Up to 400 characters. Use a new line or | between lines.">{(p) => <textarea {...p} rows={3} value={c.address} maxLength={400} onChange={set("address")} disabled={!isSuper} />}</Field>
        <Field label="Email">{(p) => <input {...p} type="email" value={c.email} maxLength={120} onChange={set("email")} disabled={!isSuper} />}</Field>
        <Field label="Phone">{(p) => <input {...p} type="tel" value={c.phone} maxLength={40} onChange={set("phone")} disabled={!isSuper} />}</Field>
        {isSuper && <button className="btn" type="submit">Save changes</button>}
      </form>
    </>
  );
}

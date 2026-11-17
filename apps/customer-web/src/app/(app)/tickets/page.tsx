"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Empty, Field, Loading } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";
import { fmtDate } from "../../../lib/format";

type T = { id: string; subject: string; status: string; updatedAt: string };

export default function Tickets() {
  const { t, locale } = useApp();
  const [rows, setRows] = useState<T[] | null>(null);
  const [err, setErr] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api<T[]>("GET", "/v1/console/tickets");
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(t, r)); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function create(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await api("POST", "/v1/console/tickets", { body: { subject: subject.trim(), body: body.trim() } });
    setBusy(false);
    if (r.ok) { setSubject(""); setBody(""); await load(); } else setErr(r.status === 400 ? t.errors.required : errorText(t, r));
  }
  const status = (s: string) => (t.tickets.status as Record<string, string>)[s] ?? s;
  return (
    <>
      <div className="pagehead"><h1>{t.tickets.title}</h1><p>{t.tickets.sub}</p></div>
      {err && <Alert>{err}</Alert>}
      <form className="card" onSubmit={create} noValidate>
        <h2>{t.tickets.newTitle}</h2>
        <Field label={t.tickets.subjectLabel}>{(p) => <input {...p} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
        <Field label={t.tickets.bodyLabel} hint={t.tickets.bodyHint}>{(p) => <textarea {...p} rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <button className="btn" type="submit" disabled={busy || subject.trim().length < 3 || !body.trim()}>{busy ? t.tickets.creating : t.tickets.create}</button>
      </form>
      <h2>{t.tickets.listTitle}</h2>
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title={t.tickets.empty} body={t.tickets.emptyBody} /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">{t.tickets.colSubject}</th><th scope="col">{t.tickets.colStatus}</th><th scope="col">{t.tickets.colUpdated}</th></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id}><td><Link href={`/tickets/${x.id}`}>{x.subject}</Link></td><td><span className={`chip ${x.status === "resolved" || x.status === "closed" ? "ok" : "warn"}`}>{status(x.status)}</span></td><td>{fmtDate(x.updatedAt, locale)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

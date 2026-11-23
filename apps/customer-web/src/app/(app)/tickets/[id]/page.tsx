"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../../../components/Providers";
import { Alert, Field, Loading } from "../../../../components/ui";
import { api, errorText } from "../../../../lib/api";
import { fmtDate } from "../../../../lib/format";

type Detail = { ticket: { id: string; subject: string; status: string }; messages: { id: string; from: "you" | "support"; body: string; original: string | null; translated: boolean; createdAt: string }[] };

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useApp();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOrig, setShowOrig] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    const r = await api<Detail>("GET", `/v1/console/tickets/${id}`);
    if (r.ok && r.data) setD(r.data); else setErr(r.status === 404 ? t.tickets.notFound : errorText(t, r));
  }, [id, t]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);
  async function reply() {
    setErr(""); setBusy(true);
    const r = await api("POST", `/v1/console/tickets/${id}/reply`, { body: { body: body.trim() } });
    setBusy(false);
    if (r.ok) { setBody(""); await load(); } else setErr(errorText(t, r));
  }
  const closed = d?.ticket.status === "closed";
  return (
    <>
      <p><Link href="/tickets">← {t.tickets.back}</Link></p>
      {err && <Alert>{err}</Alert>}
      {!d ? (err ? null : <Loading />) : (
        <>
          <div className="pagehead"><h1>{d.ticket.subject}</h1><p>{(t.tickets.status as Record<string, string>)[d.ticket.status] ?? d.ticket.status}</p></div>
          {d.messages.map((m) => (
            <div key={m.id} className="card"><p className="muted">{m.from === "you" ? t.tickets.you : t.tickets.support} · {fmtDate(m.createdAt, locale)}{m.translated && <> · {t.tickets.autoTranslated}</>}</p><p style={{ whiteSpace: "pre-wrap", margin: 0 }} dir="auto">{m.translated && showOrig[m.id] && m.original ? m.original : m.body}</p>{m.translated && m.original && <button className="btn ghost small" style={{ marginTop: ".5rem" }} onClick={() => setShowOrig((o) => ({ ...o, [m.id]: !o[m.id] }))}>{showOrig[m.id] ? t.tickets.showTranslation : t.tickets.showOriginal}</button>}</div>
          ))}
          {closed ? <Alert kind="info">{t.tickets.closedNote}</Alert> : (
            <div className="card">
              <Field label={t.tickets.replyLabel} hint={t.tickets.sub}>{(p) => <textarea {...p} rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
              <button className="btn" disabled={busy || !body.trim()} onClick={() => void reply()}>{busy ? t.tickets.replying : t.tickets.reply}</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

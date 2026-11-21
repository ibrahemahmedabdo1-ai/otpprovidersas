"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../../../components/Providers";
import { Alert, Loading } from "../../../../components/ui";
import { api, errorText, fmtDate } from "../../../../lib/api";
import { STATUSES, STATUS_LABEL, UNAVAILABLE, type Ticket, type TicketMessage } from "../../../../lib/tickets";

type Detail = { ticket: Ticket; messages: TicketMessage[] };

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Detail>("GET", `/v1/support/tickets/${id}`);
    if (r.ok && r.data) setD(r.data); else setErr(r.status === 404 ? UNAVAILABLE + " Or this ticket does not exist." : errorText(r));
  }, [id]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);

  async function post(path: string, payload: unknown) {
    setErr(""); setBusy(true);
    const r = await api("POST", `/v1/support/tickets/${id}/${path}`, payload);
    setBusy(false);
    if (r.ok) await load(); else setErr(errorText(r));
    return r.ok;
  }
  async function send() {
    if (body.trim().length < 1) return;
    if (await post(internal ? "notes" : "reply", { body: body.trim() })) setBody("");
  }
  return (
    <>
      <p><Link href="/">← All tickets</Link></p>
      {err && <Alert>{err}</Alert>}
      {!d ? (err ? null : <Loading />) : (
        <>
          <div className="pagehead"><h1>{d.ticket.subject}</h1><p>{d.ticket.requester} · {STATUS_LABEL[d.ticket.status] ?? d.ticket.status} · {d.ticket.priority} · {d.ticket.assignee ?? "Unassigned"}</p></div>
          <div className="row" style={{ marginBottom: "1rem" }}>
            <button className="btn ghost small" disabled={busy || d.ticket.assignee === user?.email} onClick={() => void post("assign", {})}>Assign to me</button>
            {STATUSES.map((s) => <button key={s} className="btn ghost small" disabled={busy || d.ticket.status === s} onClick={() => void post("status", { status: s })}>Mark {(STATUS_LABEL[s] ?? s).toLowerCase()}</button>)}
          </div>
          {d.messages.map((m) => (
            <div key={m.id} className="card" style={m.kind === "internal" ? { borderStyle: "dashed" } : undefined}>
              <p className="muted">{m.author} · {fmtDate(m.createdAt)} {m.kind === "internal" && <span className="chip warn">Internal note</span>}</p>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.body}</p>
            </div>
          ))}
          <div className="card">
            <div className="field"><label htmlFor="b">{internal ? "Internal note (customers never see this)" : "Reply to customer"}</label><textarea id="b" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
            <label className="row" style={{ margin: ".4rem 0" }}><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note only</label>
            <p className="hint">Never ask for or paste passwords, API keys, one-time codes or recovery codes.</p>
            <button className="btn" disabled={busy || !body.trim()} onClick={() => void send()}>{internal ? "Add note" : "Send reply"}</button>
          </div>
        </>
      )}
    </>
  );
}

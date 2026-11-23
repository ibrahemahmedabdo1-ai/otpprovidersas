"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../../../components/Providers";
import { Alert, Loading } from "../../../../components/ui";
import { api, errorText, fmtDate } from "../../../../lib/api";
import { LANGS, REASON, STATUSES, STATUS_LABEL, UNAVAILABLE, type Ticket, type TicketMessage, type TranslationStatus } from "../../../../lib/tickets";

type Detail = { ticket: Ticket; messages: TicketMessage[] };

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tr, setTr] = useState<TranslationStatus | null>(null);
  const [showOrig, setShowOrig] = useState<Record<string, boolean>>({});
  const [trNote, setTrNote] = useState("");
  const asked = useRef<string>("");

  const load = useCallback(async () => {
    const r = await api<Detail>("GET", `/v1/support/tickets/${id}`);
    if (r.ok && r.data) setD(r.data); else setErr(r.status === 404 ? UNAVAILABLE + " Or this ticket does not exist." : errorText(r));
  }, [id]);
  const loadTr = useCallback(async () => { const r = await api<TranslationStatus>("GET", "/v1/support/translation"); if (r.ok && r.data) setTr(r.data); }, []);
  useEffect(() => { void loadTr(); }, [loadTr]);

  // Translate the customer's messages that have no translation yet. Asked once per set of pending messages, so a failure never loops.
  const pending = d && tr?.available && d.ticket.translationEnabled
    ? d.messages.filter((m) => m.kind === "public" && m.author === d.ticket.requester && !m.translation).map((m) => m.id).join(",") : "";
  useEffect(() => {
    if (!pending || asked.current === pending) return;
    asked.current = pending;
    void (async () => {
      const r = await api<{ translated: number; skipped: string | null; errors: string[] }>("POST", `/v1/support/translation/tickets/${id}/translate`, {});
      if (r.ok && r.data) { setTrNote(r.data.errors.length ? `Some messages could not be translated (${r.data.errors.join(", ")}). The originals are shown.` : r.data.skipped ? (REASON[r.data.skipped] ?? "") : ""); await load(); }
    })();
  }, [pending, id, load]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);

  async function post(path: string, payload: unknown) {
    setErr(""); setBusy(true);
    const r = await api("POST", `/v1/support/tickets/${id}/${path}`, payload);
    setBusy(false);
    if (r.ok) await load(); else setErr(errorText(r));
    return r.ok;
  }
  async function prefs(p: { enabled?: boolean; language?: string }) { const r = await api<TranslationStatus>("PATCH", "/v1/support/translation", p); if (r.ok && r.data) { setTr(r.data); asked.current = ""; } else setErr("Could not save your translation setting."); }
  async function ticketTr(p: { enabled?: boolean; customerLanguage?: string | null }) { setBusy(true); const r = await api("POST", `/v1/support/translation/tickets/${id}/settings`, p); setBusy(false); if (r.ok) { asked.current = ""; await load(); } else setErr("Could not save the conversation setting."); }
  async function send() {
    if (body.trim().length < 1) return;
    const viaTr = !internal && tr?.available && d?.ticket.translationEnabled;
    setErr(""); setBusy(true);
    const path = internal ? `/v1/support/tickets/${id}/notes` : viaTr ? `/v1/support/translation/tickets/${id}/reply` : `/v1/support/tickets/${id}/reply`;
    const r = await api<{ translated?: boolean; translationSkipped?: string | null }>("POST", path, { body: body.trim() });
    setBusy(false);
    if (!r.ok) { setErr(errorText(r)); return; }
    setBody(""); await load();
    if (viaTr) setTrNote(r.data?.translated ? "Reply sent and translated for the customer." : `Reply sent in your language only (${r.data?.translationSkipped ?? "not translated"}).`);
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
          <div className="card">
            <strong>Automatic translation</strong>
            {!tr ? <span className="muted"> Checking…</span> : (
              <>
                <div className="row" style={{ gap: "1rem", flexWrap: "wrap", margin: ".5rem 0" }}>
                  <label className="row"><input type="checkbox" checked={tr.agent.enabled} disabled={!tr.agent.allowed} onChange={(e) => void prefs({ enabled: e.target.checked })} /> On for me</label>
                  <label className="row">My language <select value={tr.agent.language} onChange={(e) => void prefs({ language: e.target.value })} style={{ width: "auto" }}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
                  <label className="row"><input type="checkbox" checked={d.ticket.translationEnabled} disabled={busy} onChange={(e) => void ticketTr({ enabled: e.target.checked })} /> On for this conversation</label>
                  <label className="row">Customer language <select value={d.ticket.customerLanguageSource === "override" ? d.ticket.customerLanguage ?? "" : ""} disabled={busy} onChange={(e) => void ticketTr({ customerLanguage: e.target.value || null })} style={{ width: "auto" }}>
                    <option value="">{d.ticket.customerLanguage ? `Detected: ${d.ticket.customerLanguage}` : "Auto-detect"}</option>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
                </div>
                {!tr.available && tr.unavailableReason && <Alert kind="warn">{REASON[tr.unavailableReason] ?? "Translation is not available."}</Alert>}
                {trNote && <p className="hint">{trNote}</p>}
              </>
            )}
          </div>
          {d.messages.map((m) => {
            const showT = m.translation !== null && !showOrig[m.id];
            return (
              <div key={m.id} className="card" style={m.kind === "internal" ? { borderStyle: "dashed" } : undefined}>
                <p className="muted">{m.author} · {fmtDate(m.createdAt)} {m.kind === "internal" && <span className="chip warn">Internal note</span>} {m.translation !== null && <span className="chip">{showT ? `Translated to ${m.translationLang}` : "Original"}</span>}</p>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }} dir="auto">{showT ? m.translation : m.body}</p>
                {m.translation !== null && <button className="btn ghost small" style={{ marginTop: ".5rem" }} onClick={() => setShowOrig((o) => ({ ...o, [m.id]: showT }))}>{showT ? "Show original" : "Show translation"}</button>}
              </div>
            );
          })}
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

"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, fmtDate } from "../../../lib/api";

type Ap = { id: string; depositId: string; requestedBy: string; organization: string | null; amountUsd: string | null; createdAt: string };

export default function Approvals() {
  const { user } = useApp();
  const [rows, setRows] = useState<Ap[] | null>(null);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [open, setOpen] = useState<{ id: string; decision: "approved" | "rejected" } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Ap[]>("GET", "/v1/admin/approvals");
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!open) return;
    setBusy(true); setErr(""); setOkMsg("");
    const r = await api("POST", `/v1/admin/approvals/${open.id}/decide`, { decision: open.decision, note: text.trim() });
    setBusy(false);
    if (r.ok) { setOkMsg(open.decision === "approved" ? "Approval granted. The requesting Admin can now approve the deposit." : "Approval rejected."); setOpen(null); setText(""); await load(); } else setErr(errorText(r));
  }
  if (user && user.role !== "super_admin") return <Alert kind="warn">Only a Super Admin can decide approvals.</Alert>;
  return (
    <>
      <div className="pagehead"><h1>Approvals</h1><p>Requests from Admins who need your approval before they can approve a deposit. You cannot decide a request you raised yourself.</p></div>
      {err && <Alert>{err}</Alert>}{okMsg && <Alert kind="ok">{okMsg}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No pending approvals" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Organization</th><th scope="col">Amount</th><th scope="col">Requested by</th><th scope="col">Requested</th><th scope="col">Actions</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}><td>{a.organization ?? ""}</td><td dir="ltr">{a.amountUsd ? `$${a.amountUsd.replace(/(\.\d\d)\d*$/, "$1")}` : ""}</td><td>{a.requestedBy}</td><td>{fmtDate(a.createdAt)}</td>
              <td><span className="row">
                <button className="btn small" onClick={() => { setOpen({ id: a.id, decision: "approved" }); setText(""); }}>Approve…</button>
                <button className="btn danger small" onClick={() => { setOpen({ id: a.id, decision: "rejected" }); setText(""); }}>Reject…</button>
              </span></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {open && (
        <div className="card" role="dialog" aria-label="Decide approval">
          <h2>{open.decision === "approved" ? "Grant approval" : "Reject approval"}</h2>
          <div className="field"><label htmlFor="n">Decision note (required, 5–500 characters)</label><textarea id="n" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="row">
            <button className={open.decision === "approved" ? "btn" : "btn danger"} disabled={busy || text.trim().length < 5} onClick={() => void submit()}>{busy ? "Saving" : "Confirm"}</button>
            <button className="btn ghost" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

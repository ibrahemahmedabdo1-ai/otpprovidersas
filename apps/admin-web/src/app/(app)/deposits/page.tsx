"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, fmtDate } from "../../../lib/api";

type Dep = { id: string; amountUsd: string; note: string | null; status: string; receiptVerified: boolean; receiptNote: string | null; organization: { id: string; name: string }; approvalStatus: string | null; createdAt: string; decidedAt: string | null };
const STATUSES = ["", "requested", "under_review", "approved", "rejected"] as const;
const LABEL: Record<string, string> = { "": "All", requested: "Requested", under_review: "Under review", approved: "Approved", rejected: "Rejected" };

export default function Deposits() {
  const { user } = useApp();
  const [status, setStatus] = useState<string>("requested");
  const [rows, setRows] = useState<Dep[] | null>(null);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [open, setOpen] = useState<{ id: string; kind: "approve" | "reject" } | null>(null);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const r = await api<Dep[]>("GET", `/v1/admin/deposits${status ? `?status=${status}` : ""}`);
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  function openPanel(id: string, kind: "approve" | "reject") { setOpen({ id, kind }); setText(""); setConfirmed(false); setErr(""); setOkMsg(""); }

  async function submit() {
    if (!open) return;
    setErr(""); setOkMsg(""); setBusy(true);
    const path = `/v1/admin/deposits/${open.id}/${open.kind}`;
    const r = await api<{ credited?: boolean; changed?: boolean }>("POST", path, open.kind === "approve" ? { receiptNote: text.trim() } : { reason: text.trim() });
    setBusy(false);
    if (r.ok) {
      setOkMsg(open.kind === "approve" ? (r.data?.credited === false ? "Already approved earlier. Nothing was credited twice." : "Approved. The customer's wallet was credited.") : "Rejected.");
      setOpen(null); await load();
    } else setErr(errorText(r));
  }
  async function requestApproval(id: string) {
    setErr(""); setOkMsg("");
    const r = await api("POST", `/v1/admin/deposits/${id}/request-approval`);
    if (r.ok) { setOkMsg("Approval requested. A Super Admin must approve it before you can approve this deposit."); await load(); } else setErr(errorText(r));
  }
  const isAdminOnly = user?.role === "admin_staff";
  const tooShort = text.trim().length < 5;

  return (
    <>
      <div className="pagehead"><h1>Deposits</h1><p>Approve a deposit only after you have independently verified in the receiving account that the money arrived. Do not rely on what the customer says.</p></div>
      <div className="seg" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{LABEL[s]}</button>)}
      </div>
      {err && <Alert>{err}</Alert>}
      {okMsg && <Alert kind="ok">{okMsg}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No deposits" body="Nothing matches this filter." /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Organization</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Approval</th><th scope="col">Requested</th><th scope="col">Customer note</th><th scope="col">Actions</th></tr></thead>
          <tbody>{rows.map((d) => {
            const openRow = d.status === "requested" || d.status === "under_review";
            return (
              <tr key={d.id}>
                <td>{d.organization.name}</td><td dir="ltr">${d.amountUsd.replace(/(\.\d\d)\d*$/, "$1")}</td>
                <td><span className={`chip ${d.status === "approved" ? "ok" : d.status === "rejected" ? "bad" : "warn"}`}>{LABEL[d.status] ?? d.status}</span></td>
                <td>{d.approvalStatus ?? ""}</td><td>{fmtDate(d.createdAt)}</td><td>{d.note ?? ""}</td>
                <td>{openRow ? (
                  <span className="row">
                    {isAdminOnly && d.approvalStatus !== "approved" && d.approvalStatus !== "pending" && <button className="btn ghost small" onClick={() => void requestApproval(d.id)}>Request approval</button>}
                    <button className="btn small" onClick={() => openPanel(d.id, "approve")}>Approve…</button>
                    <button className="btn danger small" onClick={() => openPanel(d.id, "reject")}>Reject…</button>
                  </span>
                ) : (d.receiptNote ?? "")}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {open && (
        <div className="card" role="dialog" aria-label={open.kind === "approve" ? "Approve deposit" : "Reject deposit"}>
          <h2>{open.kind === "approve" ? "Approve deposit" : "Reject deposit"}</h2>
          <div className="field">
            <label htmlFor="note">{open.kind === "approve" ? "Receipt verification note (required, 5–500 characters)" : "Reason (required, 5–500 characters)"}</label>
            <textarea id="note" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
            {open.kind === "approve" && <p className="hint">Say how you verified, for example the bank reference you saw in the receiving account.</p>}
          </div>
          {open.kind === "approve" && <label className="row" style={{ margin: ".5rem 0" }}><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirmed in the receiving account that these funds arrived.</label>}
          <div className="row">
            <button className={open.kind === "approve" ? "btn" : "btn danger"} disabled={busy || tooShort || (open.kind === "approve" && !confirmed)} onClick={() => void submit()}>{busy ? "Saving" : open.kind === "approve" ? "Approve and credit" : "Reject"}</button>
            <button className="btn ghost" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

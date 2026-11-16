"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../components/ui";
import { api, errorText, fmtDate } from "../../lib/api";
import { STATUSES, STATUS_LABEL, UNAVAILABLE, type Ticket } from "../../lib/tickets";

export default function Tickets() {
  const [status, setStatus] = useState<string>("open");
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setRows(null); setErr("");
    const r = await api<Ticket[]>("GET", `/v1/support/tickets?status=${status}`);
    if (r.ok && r.data) setRows(r.data);
    else { setRows([]); setErr(r.status === 404 ? UNAVAILABLE : errorText(r)); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <div className="pagehead"><h1>Tickets</h1><p>Support can reply to customers and add internal notes. Support cannot see secrets or change any balance.</p></div>
      <div className="seg" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>)}
      </div>
      {err && <Alert kind={err === UNAVAILABLE ? "warn" : "error"}>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? (!err && <Empty title="No tickets" body="Nothing matches this filter." />) : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Subject</th><th scope="col">Requester</th><th scope="col">Priority</th><th scope="col">Assignee</th><th scope="col">Updated</th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id}><td><Link href={`/tickets/${t.id}`}>{t.subject}</Link></td><td>{t.requester}</td><td>{t.priority}</td><td>{t.assignee ?? "Unassigned"}</td><td>{fmtDate(t.updatedAt)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

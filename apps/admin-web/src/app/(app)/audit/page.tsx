"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, fmtDate } from "../../../lib/api";

type E = { id: string; action: string; actor: string | null; subjectType: string | null; subjectId: string | null; ip: string | null; createdAt: string };

export default function Audit() {
  const [action, setAction] = useState("");
  const [rows, setRows] = useState<E[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (a: string) => {
    setRows(null); setErr("");
    const r = await api<E[]>("GET", `/v1/admin/audit${a ? `?action=${encodeURIComponent(a)}` : ""}`);
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(""); }, [load]);
  function filter(e: FormEvent) { e.preventDefault(); void load(action.trim()); }
  return (
    <>
      <div className="pagehead"><h1>Audit log</h1><p>Newest 100 events. The log is append-only; entries cannot be edited or deleted. Details are not shown here.</p></div>
      <form className="row" onSubmit={filter} role="search">
        <input aria-label="Filter by exact action" placeholder="Exact action, e.g. deposit.approved" value={action} maxLength={60} onChange={(e) => setAction(e.target.value)} />
        <button className="btn" type="submit">Filter</button>
      </form>
      {err && <Alert>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No events" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Subject</th><th scope="col">IP</th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}><td>{fmtDate(e.createdAt)}</td><td dir="ltr">{e.action}</td><td>{e.actor ?? "system"}</td><td dir="ltr">{e.subjectType ? `${e.subjectType}:${(e.subjectId ?? "").slice(0, 8)}` : ""}</td><td dir="ltr">{e.ip ?? ""}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

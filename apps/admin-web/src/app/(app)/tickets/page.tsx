"use client";
import { useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, fmtDate } from "../../../lib/api";

type T = { id: string; subject: string; status: string; priority: string; organization: string; assignee: string | null; updatedAt: string };

export default function Tickets() {
  const [rows, setRows] = useState<T[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { void api<T[]>("GET", "/v1/admin/tickets").then((r) => { if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); } }); }, []);
  return (
    <>
      <div className="pagehead"><h1>Support tickets</h1><p>Read-only oversight of every customer ticket. Replies and assignment happen in the support console.</p></div>
      {err && <Alert>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No tickets yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Subject</th><th scope="col">Organization</th><th scope="col">Status</th><th scope="col">Priority</th><th scope="col">Assignee</th><th scope="col">Updated</th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id}><td>{t.subject}</td><td>{t.organization}</td><td><span className={`chip ${t.status === "resolved" || t.status === "closed" ? "ok" : t.status === "escalated" ? "bad" : "warn"}`}>{t.status.replace("_", " ")}</span></td><td>{t.priority}</td><td>{t.assignee ?? "Unassigned"}</td><td>{fmtDate(t.updatedAt)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

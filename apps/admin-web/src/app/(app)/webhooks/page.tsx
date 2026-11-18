"use client";
import { useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, fmtDate } from "../../../lib/api";

type D = { id: string; event: string; status: string; attempts: number; code: number | null; error: string | null; host: string; createdAt: string };

export default function Webhooks() {
  const [rows, setRows] = useState<D[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { void api<D[]>("GET", "/v1/admin/webhook-deliveries").then((r) => { if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); } }); }, []);
  return (
    <>
      <div className="pagehead"><h1>Webhook deliveries</h1><p>The latest 100 deliveries to customer endpoints. Payloads and secrets are never shown.</p></div>
      {err && <Alert>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No deliveries yet" body="Deliveries appear once customers add webhook endpoints and events fire." /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Event</th><th scope="col">Endpoint host</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Last code</th><th scope="col">Error</th><th scope="col">Created</th></tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id}><td>{d.event}</td><td>{d.host}</td><td><span className={`chip ${d.status === "delivered" ? "ok" : d.status === "pending" ? "warn" : "bad"}`}>{d.status}</span></td><td>{d.attempts}</td><td>{d.code ?? ""}</td><td>{d.error ?? ""}</td><td>{fmtDate(d.createdAt)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

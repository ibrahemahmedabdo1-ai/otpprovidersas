"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, fmtDate } from "../../../lib/api";

type Row = { id: string; amountUsd: string; status: string; evidenceNote: string | null; ticketId: string | null; organization: string; createdAt: string };

export default function TopUps() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const r = await api<Row[]>("GET", "/v1/support/deposits");
    if (r.ok && r.data) { setRows(r.data); setErr(""); } else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit(id: string) {
    setMsg(""); setErr("");
    const r = await api("POST", `/v1/support/deposits/${id}/submit`, { evidenceNote: notes[id] ?? "" });
    if (r.ok) { setMsg("Sent to administrators for review. The balance changes only after an administrator approves."); void load(); } else setErr(errorText(r));
  }
  return (
    <>
      <div className="pagehead"><h1>Top-ups</h1><p>Guide the customer in the linked ticket, check their transfer evidence, then send it for administrator review. Support cannot approve or credit a balance.</p></div>
      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="ok">{msg}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No open top-ups" body="New requests appear here." /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Organization</th><th scope="col">Amount (USD)</th><th scope="col">Status</th><th scope="col">Requested</th><th scope="col">Ticket</th><th scope="col">Evidence note</th></tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id}>
              <td>{d.organization}</td><td>{d.amountUsd}</td><td>{d.status === "under_review" ? "Awaiting administrator" : "Requested"}</td><td>{fmtDate(d.createdAt)}</td>
              <td>{d.ticketId ? <Link href={`/tickets/${d.ticketId}`}>Open</Link> : "-"}</td>
              <td>
                <input aria-label="Evidence note" maxLength={500} placeholder="What you verified (min 5 characters)" defaultValue={d.evidenceNote ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
                <button type="button" onClick={() => void submit(d.id)}>Send for review</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

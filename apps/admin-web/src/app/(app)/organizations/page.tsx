"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText, fmtDate } from "../../../lib/api";

type O = { id: string; name: string; country: string; status: string; riskLevel: string; owner: string; verification: string; createdAt: string };
const RISK = ["low", "normal", "elevated", "high"];

export default function Organizations() {
  const { user } = useApp();
  const isSuper = user?.role === "super_admin";
  const [rows, setRows] = useState<O[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await api<O[]>("GET", "/v1/admin/organizations");
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function update(id: string, body: Record<string, unknown>) {
    setErr("");
    const r = await api("POST", `/v1/admin/organizations/${id}/update`, body);
    if (!r.ok) setErr(errorText(r));
    await load();
  }
  async function verify(id: string, status: "approved" | "rejected") {
    setErr("");
    const r = await api("POST", `/v1/admin/organizations/${id}/verification`, { status });
    if (!r.ok) setErr(errorText(r));
    await load();
  }
  return (
    <>
      <div className="pagehead"><h1>Organizations</h1><p>A Super Admin can rename an organization, set its country and risk level, or suspend it.</p></div>
      {err && <Alert>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No organizations yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Name</th><th scope="col">Owner</th><th scope="col">Country</th><th scope="col">Risk</th><th scope="col">Verification</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Actions</th></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id}><td>{o.name}</td><td>{o.owner}</td><td>{o.country}</td>
              <td>{isSuper ? <select aria-label={`Risk level for ${o.name}`} value={o.riskLevel} onChange={(e) => void update(o.id, { riskLevel: e.target.value })}>{RISK.map((r) => <option key={r}>{r}</option>)}</select> : o.riskLevel}</td>
              <td><span className={`chip ${o.verification === "approved" ? "ok" : o.verification === "rejected" ? "bad" : "warn"}`}>{o.verification}</span></td>
              <td><span className={`chip ${o.status === "active" ? "ok" : "bad"}`}>{o.status}</span></td><td>{fmtDate(o.createdAt)}</td>
              <td>{isSuper ? <>
                {o.verification !== "approved" && <><button className="btn small" onClick={() => void verify(o.id, "approved")}>Verify</button>{" "}</>}
                {o.verification === "approved" && <><button className="btn small" onClick={() => void verify(o.id, "rejected")}>Revoke verification</button>{" "}</>}
                <button className="btn small" onClick={() => { const n = window.prompt("New organization name", o.name); if (n && n.trim() !== o.name) void update(o.id, { name: n.trim() }); }}>Rename</button>{" "}
                <button className="btn small" onClick={() => void update(o.id, { status: o.status === "active" ? "suspended" : "active" })}>{o.status === "active" ? "Suspend" : "Reactivate"}</button></> : <span className="muted">Super Admin only</span>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

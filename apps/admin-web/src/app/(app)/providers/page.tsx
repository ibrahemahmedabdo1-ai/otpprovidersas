"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText } from "../../../lib/api";

type P = { id: string; key: string; channel: string; kind: string; enabled: boolean; maintenance: boolean; priority: number; weight: number };

export default function Providers() {
  const { user } = useApp();
  const isSuper = user?.role === "super_admin";
  const [rows, setRows] = useState<P[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await api<P[]>("GET", "/v1/admin/providers");
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function set(id: string, body: Record<string, unknown>) {
    setErr("");
    const r = await api("POST", `/v1/admin/providers/${id}/set`, body);
    if (!r.ok) setErr(errorText(r));
    await load();
  }
  return (
    <>
      <div className="pagehead"><h1>Providers</h1><p>Providers are off until a Super Admin turns them on. WhatsApp providers stay off until the account is reviewed and approved for that use.</p></div>
      {err && <Alert>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No providers configured" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Key</th><th scope="col">Channel</th><th scope="col">Priority</th><th scope="col">Weight</th><th scope="col">State</th><th scope="col">Actions</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td>{p.key}</td><td>{p.channel}</td><td>{p.priority}</td><td>{p.weight}</td>
              <td><span className={`chip ${p.enabled && !p.maintenance ? "ok" : p.maintenance ? "warn" : "bad"}`}>{p.maintenance ? "maintenance" : p.enabled ? "enabled" : "disabled"}</span></td>
              <td>{isSuper ? <><button className="btn small" onClick={() => void set(p.id, { enabled: !p.enabled })}>{p.enabled ? "Disable" : "Enable"}</button>{" "}<button className="btn small" onClick={() => void set(p.id, { maintenance: !p.maintenance })}>{p.maintenance ? "End maintenance" : "Maintenance"}</button></> : <span className="muted">Super Admin only</span>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

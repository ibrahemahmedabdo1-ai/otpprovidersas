"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText, fmtDate, ROLE_LABEL } from "../../../lib/api";

type U = { id: string; email: string; name: string; role: string; status: string; organization: string | null; createdAt: string };

export default function Users() {
  const { user: me } = useApp();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<U[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (query: string) => {
    setRows(null); setErr("");
    const r = await api<U[]>("GET", `/v1/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(""); }, [load]);
  async function toggle(u: U) {
    setErr("");
    const r = await api("POST", `/v1/admin/users/${u.id}/status`, { status: u.status === "active" ? "suspended" : "active" });
    if (!r.ok) setErr(errorText(r));
    await load(q.trim());
  }
  function search(e: FormEvent) { e.preventDefault(); void load(q.trim()); }
  return (
    <>
      <div className="pagehead"><h1>Users</h1><p>Password hashes, secrets and MFA data are never shown. A Super Admin can suspend or reactivate customer and staff accounts; suspending ends their sessions.</p></div>
      <form className="row" onSubmit={search} role="search">
        <input aria-label="Search by email or name" placeholder="Email or name" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">Search</button>
      </form>
      {err && <Alert>{err}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No users found" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Email</th><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Organization</th><th scope="col">Created</th><th scope="col">Action</th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}><td>{u.email}</td><td>{u.name}</td><td>{ROLE_LABEL[u.role] ?? u.role}</td><td><span className={`chip ${u.status === "active" ? "ok" : u.status === "suspended" ? "bad" : "warn"}`}>{u.status}</span></td><td>{u.organization ?? ""}</td><td>{fmtDate(u.createdAt)}</td><td>{me?.role === "super_admin" && u.role !== "super_admin" && u.id !== me.id && (u.status === "active" || u.status === "suspended") ? <button className="btn small" onClick={() => void toggle(u)}>{u.status === "active" ? "Suspend" : "Reactivate"}</button> : ""}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

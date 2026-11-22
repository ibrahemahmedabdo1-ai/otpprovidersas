"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText, fmtDate, ROLE_LABEL } from "../../../lib/api";

type U = { id: string; email: string; name: string; role: string; status: string; organization: string | null; availableUsd: string; createdAt: string };

export default function Users() {
  const { user: me } = useApp();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<U[] | null>(null);
  const [err, setErr] = useState("");
  const [creditUser, setCreditUser] = useState<U | null>(null);
  const [creditAmount, setCreditAmount] = useState("5.00");
  const [creditBucket, setCreditBucket] = useState<"paid" | "promo">("promo");
  const [creditReason, setCreditReason] = useState("");
  const [creditConfirmed, setCreditConfirmed] = useState(false);
  const [creditBusy, setCreditBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async (query: string) => {
    setRows(null); setErr("");
    const r = await api<U[]>("GET", `/v1/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (r.ok && r.data) setRows(r.data); else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(""); }, [load]);
  async function sendReset(u: U) {
    if (!window.confirm("Email a one-time password reset link (valid 1 hour) to " + u.email + "?")) return;
    setErr(""); setNotice("");
    const r = await api("POST", `/v1/auth/customers/${u.id}/password-reset`, {});
    if (r.ok) setNotice("Reset link sent to " + u.email + "."); else setErr(errorText(r));
  }
  async function toggle(u: U) {
    setErr("");
    const r = await api("POST", `/v1/admin/users/${u.id}/status`, { status: u.status === "active" ? "suspended" : "active" });
    if (!r.ok) setErr(errorText(r));
    await load(q.trim());
  }
  async function submitCredit(e: FormEvent) {
    e.preventDefault();
    if (!creditUser || !creditConfirmed) return;
    setCreditBusy(true); setErr(""); setNotice("");
    const r = await api<{ credited: boolean; amountUsd: string; bucket: string }>("POST", "/v1/admin/users/" + creditUser.id + "/credit", { amountUsd: creditAmount.trim(), bucket: creditBucket, reason: creditReason.trim() });
    setCreditBusy(false);
    if (r.ok && r.data) {
      setNotice("Added $" + r.data.amountUsd + " " + (r.data.bucket === "promo" ? "bonus" : "paid") + " credit to " + creditUser.email + ".");
      setCreditUser(null); setCreditReason(""); setCreditConfirmed(false); await load(q.trim());
    } else setErr(errorText(r));
  }
  function search(e: FormEvent) { e.preventDefault(); void load(q.trim()); }
  return (
    <>
      <div className="pagehead"><h1>Users</h1><p>Password hashes, secrets and MFA data are never shown. A Super Admin can manage accounts and grant paid or bonus wallet credit. Every grant is recorded in the immutable ledger.</p></div>
      <form className="row" onSubmit={search} role="search">
        <input aria-label="Search by email or name" placeholder="Email or name" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">Search</button>
      </form>
      {err && <Alert>{err}</Alert>}{notice && <Alert kind="ok">{notice}</Alert>}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty title="No users found" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Email</th><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Organization</th><th scope="col">Available balance</th><th scope="col">Created</th><th scope="col">Action</th></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id}><td>{u.email}</td><td>{u.name}</td><td>{ROLE_LABEL[u.role] ?? u.role}</td><td><span className={`chip ${u.status === "active" ? "ok" : u.status === "suspended" ? "bad" : "warn"}`}>{u.status}</span></td><td>{u.organization ?? ""}</td><td dir="ltr">${u.availableUsd}</td><td>{fmtDate(u.createdAt)}</td><td>{u.role === "customer" && u.status === "active" ? <button className="btn small" onClick={() => void sendReset(u)}>Send reset link</button> : null} {me?.role === "super_admin" && u.role === "customer" && u.status === "active" ? <button className="btn small" onClick={() => { setCreditUser(u); setCreditAmount("5.00"); setCreditBucket("promo"); setCreditReason(""); setCreditConfirmed(false); }}>Add credit</button> : null} {me?.role === "super_admin" && u.role !== "super_admin" && u.id !== me.id && (u.status === "active" || u.status === "suspended") ? <button className="btn small" onClick={() => void toggle(u)}>{u.status === "active" ? "Suspend" : "Reactivate"}</button> : ""}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {creditUser && (
        <div className="card" role="dialog" aria-modal="true" aria-label="Add customer wallet credit">
          <h2>Add wallet credit</h2>
          <p><strong>{creditUser.name || creditUser.email}</strong> · {creditUser.email}</p>
          <p className="hint">Current available balance: ${creditUser.availableUsd} USD</p>
          <form onSubmit={(e) => void submitCredit(e)}>
            <div className="field"><label htmlFor="credit-amount">Amount (USD)</label><input id="credit-amount" inputMode="decimal" value={creditAmount} maxLength={9} onChange={(e) => setCreditAmount(e.target.value)} required /></div>
            <div className="field"><label htmlFor="credit-bucket">Credit type</label><select id="credit-bucket" value={creditBucket} onChange={(e) => setCreditBucket(e.target.value as "paid" | "promo")}><option value="promo">Bonus credit (promotional / free)</option><option value="paid">Paid credit (funds received)</option></select></div>
            <div className="field"><label htmlFor="credit-reason">Reason (required, 5–500 characters)</label><textarea id="credit-reason" rows={3} maxLength={500} value={creditReason} onChange={(e) => setCreditReason(e.target.value)} required /></div>
            <label className="row" style={{ margin: ".5rem 0" }}><input type="checkbox" checked={creditConfirmed} onChange={(e) => setCreditConfirmed(e.target.checked)} /> I confirm this wallet credit and understand it will be recorded in the ledger.</label>
            <div className="row"><button className="btn" type="submit" disabled={creditBusy || !creditConfirmed || creditReason.trim().length < 5 || !/^\d{1,6}(\.\d{1,2})?$/.test(creditAmount.trim()) || Number(creditAmount) <= 0 || Number(creditAmount) > 10000}>{creditBusy ? "Adding credit…" : "Confirm and add credit"}</button><button className="btn ghost" type="button" disabled={creditBusy} onClick={() => setCreditUser(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  );
}

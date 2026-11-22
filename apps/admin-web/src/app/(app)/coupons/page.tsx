"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText, fmtDate } from "../../../lib/api";

type Coupon = { id: string; code: string; name: string; creditMicroUsd: string; active: boolean; maxRedemptions: number | null; maxPerOrg: number; redeemed: number; expiresAt: string | null };
const usd = (micro: string) => `$${(Number(micro) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

export default function Coupons() {
  const { user } = useApp();
  const isSuper = user?.role === "super_admin";
  const [items, setItems] = useState<Coupon[] | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "error"; t: string } | null>(null);
  const load = useCallback(async () => {
    const r = await api<Coupon[]>("GET", "/v1/admin/coupons");
    setItems(r.ok && r.data ? r.data : []);
    if (!r.ok) setMsg({ k: "error", t: errorText(r) });
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(path: string, body: unknown) {
    setMsg(null);
    const r = await api("POST", path, body);
    if (r.ok) setMsg({ k: "ok", t: "Saved." }); else setMsg({ k: "error", t: errorText(r) });
    await load();
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const opt = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? undefined : v; };
    await run("/v1/admin/coupons", {
      code: String(f.get("code")), name: String(f.get("name")), creditUsd: String(f.get("credit")),
      maxRedemptions: opt("total") === undefined ? undefined : Number(opt("total")), maxPerOrg: Number(opt("per") ?? 1),
      expiresAt: opt("expires") ? new Date(String(opt("expires"))).toISOString() : undefined,
    });
    form.reset();
  }
  return (
    <>
      <div className="pagehead"><h1>Coupons</h1><p>A coupon adds promotional credit to a customer wallet. The Super Admin chooses the amount, how many times it can be used in total and per customer, and when it expires. Every change is written to the audit log.</p></div>
      {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
      {isSuper ? (
        <form className="row" onSubmit={add}>
          <input name="code" aria-label="Coupon code" placeholder="Code (e.g. WELCOME5)" required minLength={3} maxLength={32} />
          <input name="name" aria-label="Internal name" placeholder="Internal name" required maxLength={80} />
          <input name="credit" aria-label="Credit in USD" type="number" min={0.0001} max={1000} step="any" placeholder="Credit USD" required />
          <input name="total" aria-label="Total uses" type="number" min={1} step={1} placeholder="Total uses (empty = unlimited)" />
          <input name="per" aria-label="Uses per customer" type="number" min={1} max={100} step={1} defaultValue={1} placeholder="Uses per customer" required />
          <input name="expires" aria-label="Expires" type="datetime-local" />
          <button className="btn" type="submit">Create coupon</button>
        </form>
      ) : <Alert kind="info">Only a Super Admin can create or change coupons.</Alert>}
      {items === null ? <Loading /> : items.length === 0 ? <Empty title="No coupons yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Credit</th><th scope="col">Used</th><th scope="col">Per customer</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>{items.map((c) => (
            <tr key={c.id}><td><code>{c.code}</code></td><td>{c.name}</td><td>{usd(c.creditMicroUsd)}</td>
              <td>{c.redeemed}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}</td><td>{c.maxPerOrg}</td><td>{c.expiresAt ? fmtDate(c.expiresAt) : "Never"}</td>
              <td><span className={`chip ${c.active ? "ok" : "warn"}`}>{c.active ? "active" : "inactive"}</span></td>
              <td>{isSuper ? <button className="btn small" onClick={() => void run(`/v1/admin/coupons/${c.id}/set`, { active: !c.active })}>{c.active ? "Deactivate" : "Activate"}</button> : null}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

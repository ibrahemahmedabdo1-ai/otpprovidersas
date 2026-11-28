"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText, fmtDate } from "../../../lib/api";

type Pkg = { id: string; name: string; priceMicroUsd: string; creditMicroUsd: string; active: boolean; approved: boolean; createdAt: string };
const PRESETS = [
  { name: "Mini", price: 4.99, description: "A low-commitment way to try OTPProvider and send a small number of verification requests." },
  { name: "Starter", price: 9.99, description: "A practical option for individuals and small projects beginning regular verification traffic." },
  { name: "Growth", price: 24.90, description: "A flexible prepaid balance for growing products. Recommended for most customers." },
  { name: "Business", price: 49.90, description: "A larger prepaid balance for businesses with steady verification demand and operational teams." },
  { name: "Professional", price: 99.90, description: "The largest standard prepaid option for established services with higher expected usage." },
];
const descriptionFor = (name: string) => PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase())?.description ?? "Prepaid wallet credit for Email OTP and WhatsApp OTP usage.";
type Price = { id: string; channel: string; country: string; unitPriceMicroUsd: string; version: number; status: string; effectiveFrom: string | null };
const usd = (micro: string) => `$${(Number(micro) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;

export default function Pricing() {
  const { user } = useApp();
  const isSuper = user?.role === "super_admin";
  const [pk, setPk] = useState<Pkg[] | null>(null);
  const [pr, setPr] = useState<Price[] | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "error"; t: string } | null>(null);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api<Pkg[]>("GET", "/v1/admin/packages"), api<Price[]>("GET", "/v1/admin/prices")]);
    setPk(a.ok && a.data ? a.data : []); setPr(b.ok && b.data ? b.data : []);
    if (!a.ok) setMsg({ k: "error", t: errorText(a) });
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(path: string, body?: unknown) {
    setMsg(null);
    const r = await api("POST", path, body ?? {});
    if (r.ok) setMsg({ k: "ok", t: "Saved." }); else setMsg({ k: "error", t: errorText(r) });
    await load();
  }
  async function addPkg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); e.currentTarget.reset();
    await run("/v1/admin/packages", { name: String(f.get("name")), priceUsd: Number(f.get("price")), creditUsd: Number(f.get("credit")) });
  }
  async function addRecommendedPackages() {
    setMsg(null);
    const existing = new Set((pk ?? []).map((p) => p.name.toLowerCase()));
    const missing = PRESETS.filter((p) => !existing.has(p.name.toLowerCase()));
    for (const p of missing) {
      const r = await api("POST", "/v1/admin/packages", { name: p.name, priceUsd: p.price, creditUsd: p.price });
      if (!r.ok) { setMsg({ k: "error", t: errorText(r) }); await load(); return; }
    }
    setMsg({ k: "ok", t: missing.length ? `Created ${missing.length} package(s). They remain inactive until a Super Admin approves and activates them.` : "All five recommended packages already exist." });
    await load();
  }
  async function addPrice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); e.currentTarget.reset();
    await run("/v1/admin/prices", { channel: String(f.get("channel")), country: String(f.get("country") || "*"), unitPriceMicroUsd: Math.round(Number(f.get("usd")) * 1_000_000) });
  }
  return (
    <>
      <div className="pagehead"><h1>Pricing and packages</h1><p>New prices and packages start inactive. Only a Super Admin can activate them, and every change is written to the audit log.</p></div>
      {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
      <h2>Packages</h2>\n      <p className="muted">Prepaid wallet credit. The number of OTPs depends on the active per-message price, destination and successful delivery; no fixed message count is promised.</p>\n      {isSuper && <button className="btn" type="button" onClick={() => void addRecommendedPackages()} disabled={pk === null}>Add the five recommended packages</button>}
      <form className="row" onSubmit={addPkg}>
        <input name="name" aria-label="Package name" placeholder="Name" required maxLength={80} />
        <input name="price" aria-label="Price in USD" type="number" min={0.01} step="0.01" placeholder="Price USD" required />
        <input name="credit" aria-label="Wallet credit in USD" type="number" min={0.01} step="0.01" placeholder="Credit USD" required />
        <button className="btn" type="submit">Add package</button>
      </form>
      {pk === null ? <Loading /> : pk.length === 0 ? <Empty title="No packages yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Name</th><th scope="col">Price</th><th scope="col">Credit</th><th scope="col">Details</th><th scope="col">Approval</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>{pk.map((p) => (
            <tr key={p.id}><td>{p.name}</td><td>{usd(p.priceMicroUsd)}</td><td>{usd(p.creditMicroUsd)}</td>
              <td><span className={`chip ${p.active ? "ok" : "warn"}`}>{p.active ? "active" : "inactive"}</span></td>
              <td>{isSuper ? <button className="btn small" onClick={() => void run(`/v1/admin/packages/${p.id}/set`, { active: !p.active })}>{p.active ? "Deactivate" : "Approve and activate"}</button> : <span className="muted">Super Admin only</span>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <h2>Per-message prices</h2>
      <form className="row" onSubmit={addPrice}>
        <select name="channel" aria-label="Channel" defaultValue="email"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select>
        <input name="country" aria-label="Country code or *" placeholder="Country (* = all)" maxLength={2} defaultValue="*" />
        <input name="usd" aria-label="Price per message in USD" type="number" min={0} step="0.000001" placeholder="USD per message" required />
        <button className="btn" type="submit">Propose price</button>
      </form>
      {pr === null ? <Loading /> : pr.length === 0 ? <Empty title="No prices yet" /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">Channel</th><th scope="col">Country</th><th scope="col">Per message</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Effective</th><th scope="col">Action</th></tr></thead>
          <tbody>{pr.map((p) => (
            <tr key={p.id}><td>{p.channel}</td><td>{p.country}</td><td>{usd(p.unitPriceMicroUsd)}</td><td>{p.version}</td>
              <td><span className={`chip ${p.status === "active" ? "ok" : p.status === "retired" ? "bad" : "warn"}`}>{p.status.replace("_", " ")}</span></td>
              <td>{p.effectiveFrom ? fmtDate(p.effectiveFrom) : ""}</td>
              <td>{p.status === "pending_approval" ? (isSuper ? <button className="btn small" onClick={() => void run(`/v1/admin/prices/${p.id}/approve`)}>Approve</button> : <span className="muted">Super Admin only</span>) : ""}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

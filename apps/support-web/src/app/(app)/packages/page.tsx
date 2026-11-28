"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";

type PackageRow = { id: string; name: string; priceMicroUsd: string; creditMicroUsd: string; active: boolean; approved: boolean; createdAt: string };
const DETAILS: Record<string, string> = {
  mini: "A low-commitment way to try OTPProvider and send a small number of verification requests.",
  starter: "A practical option for individuals and small projects beginning regular verification traffic.",
  growth: "A flexible prepaid balance for growing products. Recommended for most customers.",
  business: "A larger prepaid balance for businesses with steady verification demand and operational teams.",
  professional: "The largest standard prepaid option for established services with higher expected usage.",
};
const usd = (micro: string) => `$${(Number(micro) / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Packages() {
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await api<PackageRow[]>("GET", "/v1/support/packages");
    if (r.ok && r.data) { setRows(r.data); setErr(""); }
    else { setRows([]); setErr(errorText(r)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <>
    <div className="pagehead"><h1>Package catalog</h1><p>Approved packages available to recommend to customers. This catalog is read-only for Support.</p></div>
    {err && <Alert kind="error">{err}</Alert>}
    <Alert kind="warn">Package purchase is prepaid wallet credit, not a guaranteed number of OTP messages. Email and WhatsApp have separate per-message prices, and charges follow confirmed delivery.</Alert>
    {rows === null ? <Loading /> : rows.length === 0 ? (!err && <Empty title="No active packages" body="No packages have been approved and activated by a Super Admin yet." />) : <div className="tablewrap"><table>
      <thead><tr><th scope="col">Package</th><th scope="col">Price</th><th scope="col">Wallet credit</th><th scope="col">Description</th><th scope="col">Status</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id}>
        <td><strong>{p.name}</strong>{p.name.toLowerCase() === "growth" && <div><span className="chip ok">Most popular</span></div>}</td>
        <td>{usd(p.priceMicroUsd)}</td><td>{usd(p.creditMicroUsd)}</td>
        <td>{DETAILS[p.name.toLowerCase()] ?? "Prepaid wallet credit for Email OTP and WhatsApp OTP usage."}</td>
        <td><span className="chip ok">Active</span></td>
      </tr>)}</tbody>
    </table></div>}
    <section className="card" style={{ marginTop: 24 }}>
      <h2>Support permissions</h2>
      <ul>
        <li>Explain package prices, wallet credit and the differences between packages.</li>
        <li>Guide customers to select their country, contact Support and submit payment evidence.</li>
        <li>Check purchase/top-up status through the existing support workflow.</li>
        <li>Do not edit package prices, activate packages, approve payments, or credit/refund wallets.</li>
      </ul>
    </section>
  </>;
}

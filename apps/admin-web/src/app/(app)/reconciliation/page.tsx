"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Loading } from "../../../components/ui";
import { api, errorText } from "../../../lib/api";

type Rec = { checkedWallets: number; mismatches: { walletId: string; bucket: string; walletMicroUsd: string; ledgerMicroUsd: string }[] };
const usd = (micro: string) => { const n = Number(micro) / 1_000_000; return `$${n.toFixed(6)}`; };

export default function Reconciliation() {
  const [d, setD] = useState<Rec | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setD(null); setErr("");
    const r = await api<Rec>("GET", "/v1/admin/reconciliation");
    if (r.ok && r.data) setD(r.data); else setErr(errorText(r));
  }, []);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <div className="pagehead"><h1>Reconciliation</h1><p>Checks that every wallet balance equals the sum of its ledger entries. Read-only: this page never changes a balance.</p></div>
      {err && <Alert>{err}</Alert>}
      {!d ? (err ? null : <Loading />) : d.mismatches.length === 0 ? (
        <Alert kind="ok">All {d.checkedWallets} wallet(s) agree with the ledger.</Alert>
      ) : (
        <>
          <Alert>{d.mismatches.length} wallet bucket(s) differ from the ledger. Do not edit balances by hand: investigate, then post a compensating ledger entry.</Alert>
          <div className="tablewrap"><table>
            <thead><tr><th scope="col">Wallet</th><th scope="col">Bucket</th><th scope="col">Wallet says</th><th scope="col">Ledger says</th></tr></thead>
            <tbody>{d.mismatches.map((m) => <tr key={m.walletId + m.bucket}><td dir="ltr">{m.walletId.slice(0, 8)}</td><td>{m.bucket}</td><td dir="ltr">{usd(m.walletMicroUsd)}</td><td dir="ltr">{usd(m.ledgerMicroUsd)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
      <p><button className="btn ghost" onClick={() => void load()}>Run again</button></p>
    </>
  );
}

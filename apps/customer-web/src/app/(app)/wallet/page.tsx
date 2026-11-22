"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Empty, Field, Loading, Money } from "../../../components/ui";
import { CouponRedeem } from "../../../components/CouponRedeem";
import { api, errorText, type Deposit, type Tx, type Wallet } from "../../../lib/api";
import { fmt } from "../../../i18n";
import { fmtDate, fmtUsd, validAmount } from "../../../lib/format";

export default function WalletPage() {
  const { t, locale } = useApp();
  const [w, setW] = useState<Wallet | null>(null);
  const [deps, setDeps] = useState<Deposit[] | null>(null);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountErr, setAmountErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState("");

  const loadAll = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      api<Wallet>("GET", "/v1/console/wallet"),
      api<Deposit[]>("GET", "/v1/console/wallet/deposits"),
      api<{ items: Tx[]; nextBefore: string | null }>("GET", "/v1/console/wallet/transactions?limit=25"),
    ]);
    if (a.ok && a.data) setW(a.data); else setErr(errorText(t, a));
    if (b.ok && b.data) setDeps(b.data);
    if (c.ok && c.data) { setTxs(c.data.items); setNext(c.data.nextBefore); }
  }, [t]);
  useEffect(() => { void loadAll(); }, [loadAll]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    const r = await api<{ items: Tx[]; nextBefore: string | null }>("GET", `/v1/console/wallet/transactions?limit=25&before=${encodeURIComponent(next)}`);
    setMore(false);
    if (r.ok && r.data) { const d = r.data; setTxs((x) => [...(x ?? []), ...d.items]); setNext(d.nextBefore); } else setErr(errorText(t, r));
  }

  async function request(e: FormEvent) {
    e.preventDefault(); setErr(""); setOkMsg(""); setAmountErr("");
    const a = amount.trim();
    if (!validAmount(a)) { setAmountErr(t.errors.amountFormat); return; }
    setBusy(true);
    const r = await api<{ amountUsd: string }>("POST", "/v1/console/wallet/deposits", { body: { amountUsd: a, note: note.trim() || undefined } });
    setBusy(false);
    if (r.ok && r.data) {
      setOkMsg(fmt(t.wallet.requested, { amount: fmtUsd(r.data.amountUsd, locale) }));
      setAmount(""); setNote(""); await loadAll();
    } else if (r.status === 400) setAmountErr(t.errors.amountRange);
    else setErr(errorText(t, r));
  }

  const statusLabel = (s: string) => ({ requested: t.wallet.statusRequested, under_review: t.wallet.statusUnderReview, approved: t.wallet.statusApproved, rejected: t.wallet.statusRejected } as Record<string, string>)[s] ?? t.wallet.statusUnknown;
  const typeLabel = (s: string) => (t.wallet.type as Record<string, string>)[s] ?? s;
  const bucketLabel = (s: string) => (t.wallet.bucket as Record<string, string>)[s] ?? s;

  return (
    <>
      <div className="pagehead"><h1>{t.wallet.title}</h1><p>{t.wallet.sub}</p></div>
      {err && <Alert>{err}</Alert>}
      <CouponRedeem onDone={() => void loadAll()} />
      {!w ? <Loading /> : (
        <div className="grid">
          <Money big label={t.wallet.available} hint={t.wallet.availableHint} value={fmtUsd(w.available.usd, locale)} />
          <Money label={t.wallet.paid} hint={t.wallet.paidHint} value={fmtUsd(w.paid.usd, locale)} />
          <Money label={t.wallet.promotional} hint={t.wallet.promotionalHint} value={fmtUsd(w.promotional.usd, locale)} />
          <Money label={t.wallet.reserved} hint={t.wallet.reservedHint} value={fmtUsd(w.reserved.usd, locale)} />
          <Money label={t.wallet.pending} hint={t.wallet.pendingHint} value={fmtUsd(w.pending.usd, locale)} />
        </div>
      )}

      <form className="card" onSubmit={request} noValidate>
        <h2>{t.wallet.topupTitle}</h2>
        <Alert kind="info">{t.wallet.honest}</Alert>
        {okMsg && <Alert kind="ok">{okMsg}</Alert>}
        <Field label={t.wallet.amountLabel} hint={t.wallet.amountHint} error={amountErr}>
          {(p) => <input {...p} inputMode="decimal" autoComplete="off" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label={`${t.wallet.noteLabel}`} hint={t.wallet.noteHint}>
          {(p) => <input {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={busy || !amount}>{busy ? t.wallet.submitting : t.wallet.submit}</button>
      </form>

      <h2>{t.wallet.depositsTitle}</h2>
      {deps === null ? <Loading /> : deps.length === 0 ? <Empty title={t.wallet.depositsEmpty} /> : (
        <div className="tablewrap"><table>
          <thead><tr><th scope="col">{t.wallet.colAmount}</th><th scope="col">{t.wallet.colStatus}</th><th scope="col">{t.wallet.colRequested}</th><th scope="col">{t.wallet.colDecided}</th><th scope="col">{t.wallet.colNote}</th></tr></thead>
          <tbody>{deps.map((d) => (
            <tr key={d.id}>
              <td dir="ltr">{fmtUsd(d.amountUsd, locale)}</td>
              <td><span className={`chip ${d.status === "approved" ? "ok" : d.status === "rejected" ? "bad" : "warn"}`}>{statusLabel(d.status)}</span></td>
              <td>{fmtDate(d.createdAt, locale)}</td><td>{d.decidedAt ? fmtDate(d.decidedAt, locale) : ""}</td><td>{d.note ?? ""}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      <h2 style={{ marginTop: "1.6rem" }}>{t.wallet.txTitle}</h2>
      {txs === null ? <Loading /> : txs.length === 0 ? <Empty title={t.wallet.txEmpty} /> : (
        <>
          <div className="tablewrap"><table>
            <thead><tr><th scope="col">{t.wallet.colDate}</th><th scope="col">{t.wallet.colType}</th><th scope="col">{t.wallet.colBucket}</th><th scope="col">{t.wallet.colAmount}</th><th scope="col">{t.wallet.colMemo}</th></tr></thead>
            <tbody>{txs.map((x) => (
              <tr key={x.id}><td>{fmtDate(x.createdAt, locale)}</td><td>{typeLabel(x.type)}</td><td>{bucketLabel(x.bucket)}</td><td dir="ltr">{x.amountUsd.startsWith("-") ? "-" + fmtUsd(x.amountUsd.slice(1), locale) : fmtUsd(x.amountUsd, locale)}</td><td>{x.memo ?? ""}</td></tr>
            ))}</tbody>
          </table></div>
          {next && <button className="btn ghost" onClick={() => void loadMore()} disabled={more}>{more ? t.wallet.loadingMore : t.wallet.loadMore}</button>}
        </>
      )}
    </>
  );
}

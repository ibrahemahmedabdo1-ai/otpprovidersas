"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "../../components/Providers";
import { Alert, Empty, Loading, Money } from "../../components/ui";
import { api, errorText, type Project, type Wallet } from "../../lib/api";
import { fmt } from "../../i18n";
import { fmtDate, fmtUsd } from "../../lib/format";

type Usage = { periodDays: number; items: { day: string; channel: string; mode: string; requests: number; verified: number }[] };
type AccountStatus = { organizationStatus:string; verificationStatus:string; emailAccountApproved:boolean; whatsappLiveEligible:boolean; message:string };

export default function Dashboard() {
  const { t, locale, user, testKey } = useApp();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [accountStatus,setAccountStatus]=useState<AccountStatus|null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [err, setErr] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageErr, setUsageErr] = useState("");
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [w, p, s] = await Promise.all([api<Wallet>("GET", "/v1/console/wallet"), api<Project[]>("GET", "/v1/console/projects"), api<AccountStatus>("GET","/v1/console/status")]);
      if (!live) return;
      if (w.ok && w.data) setWallet(w.data); else setErr(errorText(t, w));
      if (p.ok && p.data) setProjects(p.data); else setErr((e) => e || errorText(t, p));
      if (s.ok && s.data) setAccountStatus(s.data);
    })();
    return () => { live = false; };
  }, [t]);

  async function loadUsage() {
    setLoadingUsage(true); setUsageErr("");
    const r = await api<Usage>("GET", "/v1/usage", { headers: { authorization: `Bearer ${testKey}` } });
    setLoadingUsage(false);
    if (r.ok && r.data) setUsage(r.data); else setUsageErr(errorText(t, r));
  }

  const first = user?.name?.split(" ")[0];
  const total = usage?.items.reduce((n, i) => n + i.requests, 0) ?? 0;
  return (
    <>
      <div className="pagehead">
        <h1>{first ? fmt(t.dashboard.hello, { name: first }) : t.dashboard.helloNoName}</h1>
        <p>{t.dashboard.sub}</p>
      </div>
      {err && <Alert>{err}</Alert>}
      {accountStatus && (!accountStatus.emailAccountApproved || !accountStatus.whatsappLiveEligible) && <Alert kind="warn"><strong>Service activation status / حالة تفعيل الخدمات</strong><br />{accountStatus.message}<br />{!accountStatus.emailAccountApproved&&<Link href="/verification">Complete organization verification / استكمال التحقق</Link>}<br />Email live: {accountStatus.emailAccountApproved ? "Account approved; wallet and project checks still apply" : "Waiting for account approval"} · WhatsApp live: {accountStatus.whatsappLiveEligible ? "Available" : "Not yet enabled"}</Alert>}

      <h2>{t.dashboard.walletTitle}</h2>
      {!wallet ? <Loading /> : (
        <div className="grid">
          <Money big label={t.wallet.available} hint={t.wallet.availableHint} value={fmtUsd(wallet.available.usd, locale)} />
          <Money label={t.wallet.paid} value={fmtUsd(wallet.paid.usd, locale)} />
          <Money label={t.wallet.promotional} value={fmtUsd(wallet.promotional.usd, locale)} />
          <Money label={t.wallet.reserved} value={fmtUsd(wallet.reserved.usd, locale)} />
          <Money label={t.wallet.pending} value={fmtUsd(wallet.pending.usd, locale)} />
        </div>
      )}
      <p><Link href="/wallet">{t.dashboard.openWallet}</Link></p>

      <h2 style={{ marginTop: "1.6rem" }}>{t.dashboard.projectsTitle}</h2>
      {projects === null ? <Loading /> : projects.length === 0 ? (
        <Empty title={t.dashboard.projectsNone} body={t.dashboard.startTitle}>
          <ol style={{ textAlign: "start", display: "inline-block" }}><li>{t.dashboard.step1}</li><li>{t.dashboard.step2}</li><li>{t.dashboard.step3}</li></ol>
          <p><Link className="btn" href="/projects">{t.dashboard.manageProjects}</Link></p>
        </Empty>
      ) : (
        <p>{projects.length === 1 ? t.dashboard.projectsOne : fmt(t.dashboard.projectsCount, { n: projects.length })} · <Link href="/projects">{t.dashboard.manageProjects}</Link></p>
      )}

      <h2 style={{ marginTop: "1.6rem" }}>{t.dashboard.usageTitle}</h2>
      {!testKey ? (
        <Alert kind="info">{t.dashboard.usageNeedsKey} <Link href="/playground">{t.dashboard.usageGoPlayground}</Link></Alert>
      ) : (
        <>
          <p className="muted">{t.dashboard.usageHaveKey}</p>
          <button className="btn" onClick={() => void loadUsage()} disabled={loadingUsage}>{usage ? t.dashboard.usageReload : t.dashboard.usageLoad}</button>
          {usageErr && <Alert>{usageErr}</Alert>}
          {usage && (usage.items.length === 0 ? <Empty title={t.dashboard.usageEmpty} /> : (
            <div className="tablewrap" style={{ marginTop: "1rem" }}><table>
              <caption className="sr">{t.dashboard.usageProject}</caption>
              <thead><tr><th scope="col">{t.dashboard.colDay}</th><th scope="col">{t.dashboard.colChannel}</th><th scope="col">{t.dashboard.colMode}</th><th scope="col">{t.dashboard.colRequests}</th><th scope="col">{t.dashboard.colVerified}</th></tr></thead>
              <tbody>
                {usage.items.map((i) => (
                  <tr key={`${i.day}${i.channel}${i.mode}`}>
                    <td>{fmtDate(i.day, locale, false)}</td><td>{i.channel === "email" ? t.common.email : t.common.whatsapp}</td>
                    <td>{i.mode === "live" ? t.common.live : t.common.test}</td><td>{i.requests}</td><td>{i.verified}</td>
                  </tr>
                ))}
                <tr><th scope="row" colSpan={3}>{t.dashboard.total}</th><td colSpan={2}><strong>{total}</strong></td></tr>
              </tbody>
            </table></div>
          ))}
        </>
      )}
    </>
  );
}

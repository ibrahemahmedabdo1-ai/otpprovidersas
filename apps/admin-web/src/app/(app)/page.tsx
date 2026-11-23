"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "../../components/Providers";
import { Alert, Loading } from "../../components/ui";
import { api } from "../../lib/api";

type Ch = { channel: string; requests: number; delivered: number; failed: number; deliveryRatePct: number | null };
type Stats = {
  periodDays: number; generatedAt: string;
  customers: { total: number; active: number; pendingEmailVerification: number; suspended: number; pendingOrganizationReview: number };
  otp: { channels: Ch[]; requests: number; delivered: number; failed: number };
  daily: { day: string; sent: number; delivered: number }[];
  money: { depositsUsd30d: number; usageRevenueUsd30d: number; usageRevenueUsdAllTime: number; walletLiabilitiesPaidUsd: number; walletLiabilitiesPromoUsd: number };
  pendingDeposits: { count: number; amountUsd: number };
  providers: { key: string; channel: string; enabled: boolean; maintenance: boolean; health: string; successRate: number | null; checkedAt: string | null }[];
  whatsappDevices: { total: number; connected: number; routingEligible: number };
  tickets: { open: number; escalated: number; pendingCustomer: number };
  openIncidents: number;
};

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n);

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "warn" | "bad" | "ok" }) {
  return (
    <div className="stat" style={tone ? { borderColor: `var(--${tone === "bad" ? "danger" : tone})` } : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" dir="ltr">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function Bars({ data }: { data: Stats["daily"] }) {
  const W = 600, H = 150, pad = 4;
  const max = Math.max(1, ...data.map((d) => d.sent));
  const bw = (W - pad * 2) / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label="Live OTP requests per day with confirmed deliveries, last 30 days" preserveAspectRatio="none" style={{ width: "100%", height: "auto", display: "block" }}>
      {data.map((d, i) => (
        <g key={d.day}>
          <title>{`${d.day}: ${d.sent} requests, ${d.delivered} delivered`}</title>
          <rect x={pad + i * bw + 1} y={H - (d.sent / max) * H} width={Math.max(1, bw - 2)} height={(d.sent / max) * H} rx={2} fill="var(--surface-2)" stroke="var(--line)" />
          <rect x={pad + i * bw + 1} y={H - (d.delivered / max) * H} width={Math.max(1, bw - 2)} height={(d.delivered / max) * H} rx={2} fill="var(--brand)" />
        </g>
      ))}
      <line x1={0} x2={W} y1={H} y2={H} stroke="var(--line)" />
    </svg>
  );
}

export default function Overview() {
  const { user, t } = useApp();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await api<Stats>("GET", "/v1/admin/stats");
      if (!live) return;
      if (r.ok && r.data) setS(r.data); else setErr(r.status === 403 ? "Your role cannot view these statistics." : "Statistics could not be loaded. Try again in a moment.");
    })();
    return () => { live = false; };
  }, []);

  return (
    <>
      <div className="pagehead"><h1>{t("ov.title")}</h1><p>{t("ov.sub")}</p></div>
      {err && <Alert>{err}</Alert>}
      {!s && !err && <Loading />}
      {s && (
        <>
          <h2>{t("ov.customers")}</h2>
          <div className="grid">
            <Stat label={t("ov.totalCustomers")} value={s.customers.total} />
            <Stat label={t("ov.active")} value={s.customers.active} />
            <Stat label={t("ov.emailUnverified")} value={s.customers.pendingEmailVerification} />
            <Stat label={t("ov.orgReview")} value={s.customers.pendingOrganizationReview} tone={s.customers.pendingOrganizationReview > 0 ? "warn" : undefined} />
            <Stat label={t("ov.suspended")} value={s.customers.suspended} />
          </div>

          <h2>{t("ov.money")}</h2>
          <div className="grid">
            <Stat label={t("ov.pendingDeposits")} value={s.pendingDeposits.count} hint={usd(s.pendingDeposits.amountUsd) + " waiting for a decision"} tone={s.pendingDeposits.count > 0 ? "warn" : undefined} />
            <Stat label={t("ov.deposits30")} value={usd(s.money.depositsUsd30d)} />
            <Stat label={t("ov.usage30")} value={usd(s.money.usageRevenueUsd30d)} hint="Confirmed deliveries, net of refunds" />
            <Stat label={t("ov.usageAll")} value={usd(s.money.usageRevenueUsdAllTime)} />
            <Stat label={t("ov.liabilities")} value={usd(s.money.walletLiabilitiesPaidUsd)} hint={`Paid balances. Promotional credit: ${usd(s.money.walletLiabilitiesPromoUsd)}`} />
          </div>

          <h2>{t("ov.traffic", { n: s.periodDays })}</h2>
          <div className="grid">
            <Stat label={t("ov.liveRequests")} value={s.otp.requests} />
            <Stat label={t("ov.delivered")} value={s.otp.delivered} />
            <Stat label={t("ov.failed")} value={s.otp.failed} tone={s.otp.failed > 0 ? "warn" : undefined} />
            {s.otp.channels.map((c) => <Stat key={c.channel} label={`${c.channel === "email" ? "Email" : "WhatsApp"} delivery rate`} value={c.deliveryRatePct === null ? "No data" : `${c.deliveryRatePct}%`} hint={`${c.delivered} delivered of ${c.requests} requests`} />)}
          </div>
          <div className="card"><Bars data={s.daily} /><p className="hint">Grey: requests. Green: confirmed deliveries.</p></div>

          <h2>{t("ov.providers")}</h2>
          <div className="grid">
            <Stat label={t("ov.devices")} value={s.whatsappDevices.total} hint={`${s.whatsappDevices.connected} connected, ${s.whatsappDevices.routingEligible} routing-eligible`} tone={s.whatsappDevices.total > 0 && s.whatsappDevices.routingEligible === 0 ? "warn" : undefined} />
            {s.providers.map((p) => {
              const state = !p.enabled ? "Disabled" : p.maintenance ? "Maintenance" : p.health === "unknown" ? "No health data" : p.health[0]!.toUpperCase() + p.health.slice(1);
              const tone = !p.enabled || p.health === "healthy" ? undefined : p.health === "down" ? "bad" : "warn";
              return <Stat key={p.key} label={p.key} value={state} hint={`${p.channel}${p.successRate !== null ? `, success ${(p.successRate * 100).toFixed(1)}%` : ""}${p.checkedAt ? `, checked ${new Date(p.checkedAt).toLocaleString("en-GB")}` : ""}`} tone={tone} />;
            })}
          </div>

          <h2>{t("ov.support")}</h2>
          <div className="grid">
            <Stat label={t("ov.openTickets")} value={s.tickets.open} />
            <Stat label={t("ov.escalated")} value={s.tickets.escalated} tone={s.tickets.escalated > 0 ? "warn" : undefined} />
            <Stat label={t("ov.waitingCustomer")} value={s.tickets.pendingCustomer} />
            <Stat label={t("ov.incidents")} value={s.openIncidents} tone={s.openIncidents > 0 ? "bad" : undefined} />
          </div>

          <h2>{t("ov.shortcuts")}</h2>
          <div className="grid">
            <Link className="card" href="/deposits"><h3>Deposits</h3><p className="muted">Approve only after independently confirming the funds arrived.</p></Link>
            <Link className="card" href="/tickets"><h3>Tickets</h3><p className="muted">Escalated and open conversations.</p></Link>
            {user?.role === "super_admin" && <Link className="card" href="/approvals"><h3>Approvals</h3><p className="muted">Decide approval requests raised by Admins.</p></Link>}
          </div>
          <p className="hint">Generated {new Date(s.generatedAt).toLocaleString("en-GB")}.</p>
        </>
      )}
    </>
  );
}

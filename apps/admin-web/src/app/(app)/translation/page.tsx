"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Loading } from "../../../components/ui";
import { api } from "../../../lib/api";
import { LOCALES, NATIVE_NAMES, type Locale } from "../../../i18n";

type Overview = {
  configured: boolean; provider: string | null; note: string | null;
  settings: { enabled: boolean; languages: Locale[]; dailyCharLimit: number }; usedTodayChars: number;
  last30Days: { translations: number; errors: number; chars: number };
  errorBreakdown: { code: string; count: number; lastAt: string | null }[];
  agents: { id: string; email: string; role: string; allowed: boolean; enabled: boolean; language: string }[];
};
const ERR: Record<string, string> = {
  translation_not_configured: "No translation provider is configured on the server, so it cannot be turned on.",
  validation_failed: "Check the values and the data-sharing confirmation.", forbidden: "Your role cannot change translation settings.",
};

export default function TranslationPage() {
  const { t } = useApp();
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [langs, setLangs] = useState<Locale[]>([]); const [limit, setLimit] = useState("");

  const load = useCallback(async () => {
    const r = await api<Overview>("GET", "/v1/admin/translation");
    if (r.ok && r.data) { setO(r.data); setLangs(r.data.settings.languages); setLimit(String(r.data.settings.dailyCharLimit)); }
    else setErr(ERR[(r.data as { error?: string } | null)?.error ?? ""] ?? "Could not load translation settings.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(body: unknown, okMsg: string) {
    setErr(""); setMsg(""); setBusy(true);
    const r = await api<Overview>("PATCH", "/v1/admin/translation", body);
    setBusy(false);
    if (r.ok && r.data) { setO(r.data); setMsg(okMsg); } else setErr(ERR[(r.data as unknown as { error?: string } | null)?.error ?? ""] ?? "The change was not saved.");
  }
  async function test() {
    setErr(""); setMsg(""); setBusy(true);
    const r = await api<{ ok: boolean; error?: string; ms?: number }>("POST", "/v1/admin/translation/test");
    setBusy(false); await load();
    if (r.ok && r.data?.ok) setMsg(`Provider answered in ${r.data.ms} ms.`);
    else setErr(`Provider test failed: ${r.data?.error ?? "unknown"}.`);
  }
  async function allow(id: string, allowed: boolean) {
    setBusy(true); const r = await api("PATCH", `/v1/admin/translation/agents/${id}`, { allowed }); setBusy(false);
    if (r.ok) await load(); else setErr("The permission was not saved.");
  }

  if (!o) return err ? <Alert>{err}</Alert> : <Loading />;
  const s = o.settings;
  return (
    <>
      <div className="pagehead"><h1>{t("tm.title")}</h1><p>{t("tm.sub")}</p></div>
      {err && <Alert>{err}</Alert>}{msg && <Alert kind="ok">{msg}</Alert>}
      <div className="card">
        <h2>{t("tm.provider")}</h2>
        <p>{o.configured ? <strong>{o.provider}</strong> : <span className="chip warn">{t("tm.notConfigured")}</span>}</p>
        {o.note && <Alert kind="warn">{o.note}</Alert>}
        <button className="btn ghost small" disabled={busy || !o.configured} onClick={() => void test()}>{busy ? t("tm.testing") : t("tm.test")}</button>
      </div>

      <div className="card">
        <h2>{t("tm.system")}: {s.enabled ? t("tm.on") : t("tm.off")}</h2>
        {!s.enabled && <label className="row"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> {t("tm.confirm")}</label>}
        <button className="btn" disabled={busy || (!s.enabled && (!o.configured || !confirm))} onClick={() => void patch(s.enabled ? { enabled: false } : { enabled: true, confirmDataSharing: true }, s.enabled ? "Translation turned off." : "Translation turned on.")}>{s.enabled ? t("tm.disable") : t("tm.enable")}</button>
        <h3 style={{ marginTop: "1.2rem" }}>{t("tm.languages")}</h3>
        <div className="row" style={{ flexWrap: "wrap", gap: "1rem" }}>
          {LOCALES.map((l) => (
            <label key={l} className="row"><input type="checkbox" checked={langs.includes(l)} onChange={(e) => setLangs((cur) => e.target.checked ? [...cur, l] : cur.filter((x) => x !== l))} /> {NATIVE_NAMES[l]}</label>
          ))}
        </div>
        <div className="field" style={{ maxWidth: 260 }}><label htmlFor="lim">{t("tm.limit")}</label><input id="lim" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} /></div>
        <button className="btn ghost" disabled={busy || langs.length === 0} onClick={() => void patch({ languages: langs, dailyCharLimit: Number(limit) }, "Saved.")}>{t("tm.save")}</button>
      </div>

      <div className="grid">
        <div className="stat"><div className="stat-label">{t("tm.usedToday")}</div><div className="stat-value" dir="ltr">{o.usedTodayChars} / {s.dailyCharLimit}</div></div>
        <div className="stat"><div className="stat-label">{t("tm.translations")} ({t("tm.last30")})</div><div className="stat-value" dir="ltr">{o.last30Days.translations}</div></div>
        <div className="stat"><div className="stat-label">{t("tm.errors")} ({t("tm.last30")})</div><div className="stat-value" dir="ltr">{o.last30Days.errors}</div></div>
        <div className="stat"><div className="stat-label">{t("tm.chars")} ({t("tm.last30")})</div><div className="stat-value" dir="ltr">{o.last30Days.chars}</div></div>
      </div>
      {o.errorBreakdown.length > 0 && (
        <div className="tablewrap"><table><thead><tr><th scope="col">{t("tm.errors")}</th><th scope="col">#</th></tr></thead>
          <tbody>{o.errorBreakdown.map((e) => <tr key={e.code}><td>{e.code}</td><td>{e.count}</td></tr>)}</tbody></table></div>
      )}

      <h2>{t("tm.agents")}</h2>
      <div className="tablewrap"><table>
        <thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">{t("shell.language")}</th><th scope="col">{t("tm.allowed")}</th></tr></thead>
        <tbody>{o.agents.map((a) => (
          <tr key={a.id}><td>{a.email}</td><td>{a.role}</td><td>{a.language}</td>
            <td><input type="checkbox" aria-label={`${t("tm.allowed")}: ${a.email}`} checked={a.allowed} disabled={busy} onChange={(e) => void allow(a.id, e.target.checked)} /></td></tr>
        ))}</tbody></table></div>
    </>
  );
}

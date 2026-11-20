"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../../../components/Providers";
import { Alert, CopyButton, Empty, Loading } from "../../../../components/ui";
import { api, errorText, type ApiKey, type Project } from "../../../../lib/api";
import { fmt } from "../../../../i18n";
import { fmtDate } from "../../../../lib/format";
import WhatsAppTemplates from "./WhatsAppTemplates";

type NewKey = { id: string; prefix: string; key: string };

export default function ProjectDetail() {
  const { t, locale, setTestKey } = useApp();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<NewKey | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [p, k] = await Promise.all([api<Project[]>("GET", "/v1/console/projects"), api<ApiKey[]>("GET", `/v1/console/projects/${id}/keys`)]);
    if (p.ok && p.data) setProject(p.data.find((x) => x.id === id) ?? null); else { setProject(null); setErr(errorText(t, p)); }
    if (k.ok && k.data) setKeys(k.data); else setKeys([]);
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);

  async function createKey() {
    setBusy(true); setErr(""); setNote("");
    const r = await api<NewKey>("POST", `/v1/console/projects/${id}/keys`, { body: { mode: "test" } });
    setBusy(false);
    if (r.ok && r.data) { setFresh(r.data); setNote(t.project.keyCreatedAnnounce); await load(); } else setErr(errorText(t, r));
  }
  async function revoke(keyId: string) {
    setErr("");
    const r = await api("DELETE", `/v1/console/projects/${id}/keys/${keyId}`);
    setAsking(null);
    if (r.ok) await load(); else setErr(errorText(t, r));
  }

  if (project === undefined) return <Loading />;
  if (project === null) {
    return <Empty title={t.project.notFoundTitle} body={t.project.notFoundBody}><Link className="btn" href="/projects">{t.project.back}</Link></Empty>;
  }
  return (
    <>
      <p><Link href="/projects">← {t.project.back}</Link></p>
      <div className="pagehead"><h1>{project.name}</h1></div>
      {err && <Alert>{err}</Alert>}

      <div className="card">
        <h2>{t.project.channelsTitle}</h2>
        <p><span className={`chip ${project.channels.email ? "ok" : ""}`}>{t.project.emailLine}: {project.channels.email ? t.common.on : t.common.off}</span>{" "}
          <span className="chip">{t.project.whatsappLine}: {project.channels.whatsapp ? t.common.on : t.common.off}</span></p>
        <Alert kind="warn">{t.project.whatsappWarn}</Alert>
        <h3>{t.project.settingsTitle}</h3>
        <p className="hint">{t.project.settingsNote}</p>
        <dl className="row" style={{ gap: "1.5rem" }}>
          <div><dt className="muted">{t.project.length}</dt><dd style={{ margin: 0 }}>{fmt(t.project.digits, { n: project.otp.length })}</dd></div>
          <div><dt className="muted">{t.project.ttl}</dt><dd style={{ margin: 0 }}>{fmt(t.common.seconds, { n: project.otp.ttlSeconds })}</dd></div>
          <div><dt className="muted">{t.project.attempts}</dt><dd style={{ margin: 0 }}>{project.otp.maxAttempts}</dd></div>
          <div><dt className="muted">{t.project.cooldown}</dt><dd style={{ margin: 0 }}>{fmt(t.common.seconds, { n: project.otp.resendCooldownSeconds })}</dd></div>
          <div><dt className="muted">{t.project.daily}</dt><dd style={{ margin: 0 }}>{project.dailyLimit ?? t.common.none}</dd></div>
        </dl>
      </div>

      <WhatsAppTemplates projectId={id} enabled={project.channels.whatsapp} />

      <div className="card">
        <h2>{t.project.keysTitle}</h2>
        <p className="muted">{t.project.keysSub}</p>
        <span className="sr" aria-live="polite">{note}</span>
        {fresh && (
          <Alert kind="warn">
            <strong>{t.project.newKeyTitle}</strong>
            <p>{t.project.newKeyWarn}</p>
            <div className="keybox" data-testid="new-key">{fresh.key}</div>
            <div className="row">
              <CopyButton value={fresh.key} label={t.project.copyKey} />
              <Link className="btn ghost" href="/playground" onClick={() => setTestKey(fresh.key)}>{t.project.usePlayground}</Link>
              <button className="btn" onClick={() => setFresh(null)}>{t.project.dismissKey}</button>
            </div>
            <p className="hint">{t.project.dismissWarn}</p>
          </Alert>
        )}
        <div className="row" style={{ marginBottom: "1rem" }}>
          <button className="btn" onClick={() => void createKey()} disabled={busy}>{busy ? t.project.creatingKey : t.project.createTest}</button>
          <button className="btn ghost" disabled aria-describedby="live-note">{t.project.liveButton}</button>
          <span id="live-note" className="muted">{t.project.liveBody}</span>
        </div>
        {keys === null ? <Loading /> : keys.length === 0 ? <Empty title={t.project.keysEmptyTitle} body={t.project.keysEmptyBody} /> : (
          <div className="tablewrap"><table>
            <thead><tr><th scope="col">{t.project.colKey}</th><th scope="col">{t.project.colMode}</th><th scope="col">{t.project.colCreated}</th><th scope="col">{t.project.colLastUsed}</th><th scope="col">{t.project.colStatus}</th><th scope="col">{t.project.colActions}</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="mono" dir="ltr">{k.prefix}…</td>
                  <td>{k.mode === "live" ? t.common.live : t.common.test}</td>
                  <td>{fmtDate(k.createdAt, locale)}</td>
                  <td>{k.lastUsedAt ? fmtDate(k.lastUsedAt, locale) : t.common.never}</td>
                  <td>{k.revokedAt ? <span className="chip bad">{fmt(t.project.revokedOn, { date: fmtDate(k.revokedAt, locale, false) })}</span> : <span className="chip ok">{t.common.active}</span>}</td>
                  <td>
                    {k.revokedAt ? null : asking === k.id ? (
                      <span className="row"><span>{t.project.revokeAsk}</span>
                        <button className="btn danger small" onClick={() => void revoke(k.id)}>{t.project.revokeConfirm}</button>
                        <button className="btn ghost small" onClick={() => setAsking(null)}>{t.common.cancel}</button></span>
                    ) : <button className="btn ghost small" onClick={() => setAsking(k.id)}>{t.project.revoke}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

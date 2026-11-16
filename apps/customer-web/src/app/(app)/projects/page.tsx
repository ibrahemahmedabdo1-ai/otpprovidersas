"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useApp } from "../../../components/Providers";
import { Alert, Empty, Field, Loading } from "../../../components/ui";
import { api, errorText, type Project } from "../../../lib/api";
import { fmt } from "../../../i18n";
import { fmtDate } from "../../../lib/format";

export default function Projects() {
  const { t, locale } = useApp();
  const [items, setItems] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [nameErr, setNameErr] = useState("");

  const load = useCallback(async () => {
    const r = await api<Project[]>("GET", "/v1/console/projects");
    if (r.ok && r.data) setItems(r.data); else setErr(errorText(t, r));
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setErr(""); setNameErr("");
    const n = name.trim();
    // eslint-disable-next-line no-control-regex
    if (n.length < 1 || n.length > 60 || /[\u0000-\u001f<>]/.test(n)) { setNameErr(t.errors.projectName); return; }
    setBusy(true);
    const r = await api("POST", "/v1/console/projects", { body: { name: n } });
    setBusy(false);
    if (r.ok) { setName(""); await load(); } else setErr(errorText(t, r));
  }

  return (
    <>
      <div className="pagehead"><h1>{t.projects.title}</h1><p>{t.projects.sub}</p></div>
      <form className="card" onSubmit={create} noValidate>
        <h2>{t.projects.createTitle}</h2>
        {err && <Alert>{err}</Alert>}
        <Field label={t.projects.nameLabel} error={nameErr}>
          {(p) => <input {...p} maxLength={60} placeholder={t.projects.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <button className="btn" type="submit" disabled={busy || !name.trim()}>{busy ? t.projects.creating : t.projects.create}</button>
      </form>
      <h2>{t.projects.listTitle}</h2>
      {items === null ? <Loading /> : items.length === 0 ? <Empty title={t.projects.emptyTitle} body={t.projects.emptyBody} /> : (
        <ul className="list">
          {items.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <div className="muted">{fmt(t.projects.created, { date: fmtDate(p.createdAt, locale, false) })} · {p.activeKeys === 1 ? t.projects.keysOne : fmt(t.projects.keys, { n: p.activeKeys })}</div>
                <div className="row" style={{ marginTop: ".4rem" }}>
                  <span className={`chip ${p.channels.email ? "ok" : ""}`}>{t.projects.emailChannel}: {p.channels.email ? t.common.on : t.common.off}</span>
                  <span className={`chip ${p.channels.whatsapp ? "warn" : ""}`}>{t.projects.whatsappChannel}: {p.channels.whatsapp ? t.common.on : t.common.off}</span>
                </div>
              </div>
              <Link className="btn ghost" href={`/projects/${p.id}`}>{t.projects.open}</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

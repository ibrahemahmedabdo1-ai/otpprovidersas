"use client";
import { useCallback, useEffect, useState } from "react";
import { LOCALES, NATIVE_NAMES, type Locale } from "../../../i18n";
import { useApp, type Theme } from "../../../components/Providers";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api, errorText, type Session } from "../../../lib/api";
import { fmtDate } from "../../../lib/format";

export default function Settings() {
  const { t, locale, setLocale, theme, setTheme, user, signOut } = useApp();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<Session[]>("GET", "/v1/auth/sessions");
    if (r.ok && r.data) setSessions(r.data); else setErr(errorText(t, r));
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function revoke(id: string) {
    const r = await api("DELETE", `/v1/auth/sessions/${id}`);
    setAsking(null);
    if (r.ok) await load(); else setErr(errorText(t, r));
  }
  const themes: Theme[] = ["system", "light", "dark"];
  const others = sessions?.filter((s) => !s.current) ?? [];
  return (
    <>
      <div className="pagehead"><h1>{t.settings.title}</h1><p>{t.settings.sub}</p></div>
      {err && <Alert>{err}</Alert>}
      <div className="card">
        <h2>{t.settings.accountTitle}</h2>
        <dl style={{ margin: 0 }}>
          <dt className="muted">{t.settings.emailLabel}</dt><dd style={{ margin: "0 0 .6rem" }}>{user?.email}</dd>
          <dt className="muted">{t.settings.nameLabel}</dt><dd style={{ margin: "0 0 .6rem" }}>{user?.name}</dd>
          <dt className="muted">{t.settings.roleLabel}</dt><dd style={{ margin: 0 }}>{user?.role === "super_admin" ? t.settings.roleSuperAdmin : t.settings.roleCustomer}</dd>
        </dl>
      </div>
      <div className="card">
        <h2>{t.settings.languageTitle}</h2>
        <p className="hint">{t.settings.languageHint}</p>
        <div className="seg" role="group" aria-label={t.settings.languageTitle}>
          {LOCALES.map((l: Locale) => <button key={l} type="button" lang={l} aria-pressed={l === locale} onClick={() => setLocale(l)}>{NATIVE_NAMES[l]}</button>)}
        </div>
      </div>
      <div className="card">
        <h2>{t.settings.themeTitle}</h2>
        <p className="hint">{t.settings.themeHint}</p>
        <div className="seg" role="group" aria-label={t.settings.themeTitle}>
          {themes.map((x) => <button key={x} type="button" aria-pressed={x === theme} onClick={() => setTheme(x)}>{t.themes[x]}</button>)}
        </div>
      </div>
      <div className="card">
        <h2>{t.settings.sessionsTitle}</h2>
        <p className="muted">{t.settings.sessionsSub}</p>
        {sessions === null ? <Loading /> : sessions.length === 0 ? <Empty title={t.settings.sessionsEmpty} /> : (
          <div className="tablewrap"><table>
            <thead><tr><th scope="col">{t.settings.device}</th><th scope="col">{t.settings.ip}</th><th scope="col">{t.settings.started}</th><th scope="col">{t.settings.lastSeen}</th><th scope="col">{t.settings.expires}</th><th scope="col" /></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td title={s.userAgent ?? ""}>{(s.userAgent ?? t.settings.unknownDevice).slice(0, 48)} {s.current && <span className="chip ok">{t.common.thisSession}</span>}</td>
                  <td dir="ltr">{s.ip ?? ""}</td><td>{fmtDate(s.createdAt, locale)}</td><td>{fmtDate(s.lastSeenAt, locale)}</td><td>{fmtDate(s.expiresAt, locale)}</td>
                  <td>{s.current ? null : asking === s.id ? (
                    <span className="row"><span>{t.settings.revokeAsk}</span><button className="btn danger small" onClick={() => void revoke(s.id)}>{t.settings.revokeConfirm}</button><button className="btn ghost small" onClick={() => setAsking(null)}>{t.common.cancel}</button></span>
                  ) : <button className="btn ghost small" onClick={() => setAsking(s.id)}>{t.settings.revoke}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {sessions && others.length === 0 && sessions.length > 0 && <p className="hint">{t.settings.sessionsEmpty}</p>}
      </div>
      <div className="card">
        <h2>{t.settings.signOutTitle}</h2><p className="muted">{t.settings.signOutBody}</p>
        <button className="btn ghost" onClick={() => void signOut()}>{t.common.signOut}</button>
      </div>
    </>
  );
}

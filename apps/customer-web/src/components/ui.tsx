"use client";
import { useId, useState, type ReactNode } from "react";
import { useApp } from "./Providers";

export function Alert({ kind = "error", children }: { kind?: "error" | "ok" | "warn" | "info"; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode }) {
  const id = useId();
  const d = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": d, "aria-invalid": error ? true : undefined })}
      {hint && <p id={`${id}-h`} className="hint">{hint}</p>}
      {error && <p id={`${id}-e`} className="err" role="alert">{error}</p>}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useApp();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked */ }
    }}>
      {done ? t.common.copied : label}
      <span className="sr" aria-live="polite">{done ? t.common.copied : ""}</span>
    </button>
  );
}

export function Money({ label, hint, value, big }: { label: string; hint?: string; value: string; big?: boolean }) {
  return (
    <div className={`stat${big ? " big" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" dir="ltr">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{body && <p>{body}</p>}{children}</div>;
}

export function Loading() {
  const { t } = useApp();
  return <p className="muted" role="status">{t.common.loading}…</p>;
}

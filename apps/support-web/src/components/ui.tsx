"use client";
import { useId, type ReactNode } from "react";

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
export function Empty({ title, body }: { title: string; body?: string }) { return <div className="empty"><h3>{title}</h3>{body && <p>{body}</p>}</div>; }
export function Loading() { return <p className="muted" role="status">Loading…</p>; }

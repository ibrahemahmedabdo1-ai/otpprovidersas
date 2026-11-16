"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function VerifyEmail() {
  const { t } = useApp();
  const [state, setState] = useState<"working" | "ok" | "fail" | "missing">("working");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setState("missing"); return; }
    let live = true;
    void api("POST", "/v1/auth/verify-email", { body: { token } }).then((r) => { if (live) setState(r.ok ? "ok" : "fail"); });
    return () => { live = false; };
  }, []);
  return (
    <AuthFrame title={state === "ok" ? t.auth.verify.okTitle : state === "fail" ? t.auth.verify.failTitle : t.auth.verify.title}>
      {state === "working" && <p role="status">{t.auth.verify.working}…</p>}
      {state === "ok" && <Alert kind="ok">{t.auth.verify.okBody}</Alert>}
      {state === "fail" && <Alert>{t.auth.verify.failBody}</Alert>}
      {state === "missing" && <Alert kind="warn">{t.auth.verify.missing}</Alert>}
      {state !== "working" && <Link className="btn" href="/login">{t.auth.verify.toLogin}</Link>}
    </AuthFrame>
  );
}

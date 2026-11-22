"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";
import { Alert, Loading } from "../../../components/ui";
import { api } from "../../../lib/api";

/** Single sign-in landing: the website hands over a one-time code in the URL fragment (never sent to a server or logged). */
export default function Sso() {
  const {  refresh } = useApp();
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    history.replaceState(null, "", window.location.pathname);
    if (!code) { setFailed(true); return; }
    void (async () => {
      const r = await api("POST", "/v1/auth/sso/redeem", { code });
      if (r.ok) { await refresh(); router.replace("/"); } else setFailed(true);
    })();
  }, [refresh, router]);
  return (
    <AuthFrame title={"Signing you in"}>
      {failed ? (<><Alert>{"This sign-in link expired or was already used. Sign in again from the website."}</Alert><p><Link className="btn" href="/login">{"Go to sign in"}</Link></p></>) : <Loading />}
    </AuthFrame>
  );
}

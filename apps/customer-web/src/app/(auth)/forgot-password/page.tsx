"use client";
import Link from "next/link";
import { AuthFrame } from "../../../components/AuthFrame";
import { useApp } from "../../../components/Providers";

/** Recovery is handled by our team (Admin sends a one-time link), so there is no form here. */
export default function Forgot() {
  const { t } = useApp();
  return (
    <AuthFrame title={t.forgot.title} sub={t.forgot.sub}>
      <p className="muted" style={{ marginTop: "1rem" }}><Link href="/login">{t.forgot.back}</Link></p>
    </AuthFrame>
  );
}

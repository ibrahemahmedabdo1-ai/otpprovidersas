"use client";
import { useState, type FormEvent } from "react";
import { useApp } from "./Providers";
import { Alert } from "./ui";
import { api } from "../lib/api";

const S = {
  en: { title: "Have a coupon?", hint: "Enter the code to add promotional credit to your wallet.", code: "Coupon code", apply: "Apply", working: "Applying", ok: (x: string) => `Added ${x} of promotional credit.`, invalid: "This coupon is not valid.", exhausted: "This coupon has run out.", used: "You have already used this coupon.", limited: "Too many attempts. Try again later.", failed: "Could not apply the coupon. Try again." },
  ar: { title: "لديك كوبون؟", hint: "أدخل الكود لإضافة رصيد ترويجي إلى محفظتك.", code: "كود الكوبون", apply: "تطبيق", working: "جارٍ التطبيق", ok: (x: string) => `تمت إضافة رصيد ترويجي بقيمة ${x}.`, invalid: "هذا الكوبون غير صالح.", exhausted: "انتهت كمية هذا الكوبون.", used: "لقد استخدمت هذا الكوبون من قبل.", limited: "محاولات كثيرة. حاول لاحقًا.", failed: "تعذّر تطبيق الكوبون. حاول مرة أخرى." },
} as const;

export function CouponRedeem({ onDone }: { onDone: () => void }) {
  const { locale } = useApp();
  const s = S[locale === "ar" ? "ar" : "en"];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await api<{ creditedUsd: string }>("POST", "/v1/console/wallet/coupons/redeem", { body: { code: code.trim() } });
    setBusy(false);
    if (r.ok && r.data) { setMsg({ kind: "ok", text: s.ok(`$${r.data.creditedUsd}`) }); setCode(""); onDone(); return; }
    const k = (r.data as { error?: string } | null)?.error;
    setMsg({ kind: "error", text: r.status === 429 ? s.limited : k === "coupon_exhausted" ? s.exhausted : k === "coupon_already_used" ? s.used : k === "coupon_invalid" ? s.invalid : s.failed });
  }
  return (
    <section className="card" style={{ marginTop: "1.5rem" }}>
      <h2>{s.title}</h2>
      <p className="muted">{s.hint}</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <form className="row" onSubmit={submit}>
        <input aria-label={s.code} placeholder={s.code} value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} dir="ltr" required />
        <button className="btn" type="submit" disabled={busy || code.trim().length < 3}>{busy ? s.working : s.apply}</button>
      </form>
    </section>
  );
}

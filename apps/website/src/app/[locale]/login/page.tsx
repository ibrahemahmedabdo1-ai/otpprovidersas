import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../i18n/config";
import { getDict } from "../../../i18n";
import { Shell } from "../../../components/Shell";
import UnifiedLogin from "../../../components/UnifiedLogin";

type P = { params: Promise<{ locale: string }> };
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function Login({ params }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Shell locale={locale} t={getDict(locale)} path="/login">
      <div className="wrap narrow section"><UnifiedLogin locale={locale} /></div>
    </Shell>
  );
}

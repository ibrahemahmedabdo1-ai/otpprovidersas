import { CONSOLE_URL } from "./seo";

/**
 * Company details shown in the footer. Fill these in with environment variables on Vercel
 * (NEXT_PUBLIC_COMPANY_*); anything left empty is simply not rendered, so the site never shows made-up details.
 */
export const COMPANY = {
  legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? "",
  address: (process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "").split("|").map((s) => s.trim()).filter(Boolean),
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "",
  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "",
};

/** Where the public API lives; only used in code samples. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.otpprovider.com").replace(/\/+$/, "");

/** Console (customer web app) entry points. */
export const CONSOLE = {
  login: `${CONSOLE_URL}/login`,
  register: `${CONSOLE_URL}/register`,
  forgot: `${CONSOLE_URL}/forgot-password`,
  home: CONSOLE_URL,
};

/** Contact link for sales questions: the company email when set, otherwise the sign-up page. */
export const contactHref = () => (COMPANY.email ? `mailto:${COMPANY.email}` : CONSOLE.register);

/**
 * Top-up packages. The amounts are the wallet credit a customer buys; they are not per-message prices
 * (those are set by an administrator in the console). Edit the numbers here. `null` means "custom".
 */
export const PLANS: { id: "starter" | "growth" | "enterprise"; amountUsd: number | null; popular?: boolean }[] = [
  { id: "starter", amountUsd: 4.99 },
  { id: "growth", amountUsd: 19.99, popular: true },
  { id: "enterprise", amountUsd: 49.99 },
];

export const formatUsd = (locale: string, amount: number) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

type CompanyInfo = { legalName: string; address: string[]; email: string; phone: string };
/** Company details saved by an admin in the admin console; falls back to the NEXT_PUBLIC_COMPANY_* variables. */
export async function getCompany(): Promise<CompanyInfo> {
  const bases = [process.env.NEXT_PUBLIC_API_URL, "https://otpprovider-launch-api.vercel.app"].filter(Boolean) as string[];
  for (const b of bases) {
    try {
      const res = await fetch(`${b.replace(/\/+$/, "")}/v1/public/company`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(2500) });
      if (!res.ok) continue;
      const j = (await res.json()) as { legalName?: string; address?: string; email?: string; phone?: string };
      const address = (j.address ?? "").split(/\n|\|/).map((x) => x.trim()).filter(Boolean);
      if (j.legalName || address.length || j.email || j.phone) return { legalName: j.legalName ?? "", address, email: j.email ?? "", phone: j.phone ?? "" };
      break;
    } catch { /* try next */ }
  }
  return COMPANY;
}

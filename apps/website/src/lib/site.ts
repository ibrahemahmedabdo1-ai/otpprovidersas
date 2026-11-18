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
  { id: "starter", amountUsd: 25 },
  { id: "growth", amountUsd: 100, popular: true },
  { id: "enterprise", amountUsd: null },
];

export const formatUsd = (locale: string, amount: number) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

import type { Metadata } from "next";
import { DEFAULT_LOCALE, HREFLANG, LOCALES, OG_LOCALE, type Locale } from "../i18n/config";

/** Canonical origin. Set NEXT_PUBLIC_SITE_URL in the deployment; no trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://otpprovider.com").replace(/\/+$/, "");
export const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.otpprovider.com";

/** Indexable pages (path after the locale). Legal templates are deliberately excluded from indexing. */
export const INDEXABLE_PATHS = ["", "/products", "/developers", "/pricing", "/security"] as const;
export const ALL_PATHS = [...INDEXABLE_PATHS, "/legal/terms", "/legal/privacy"] as const;

export const url = (locale: Locale, path: string) => `${SITE_URL}/${locale}${path}`;

export function alternates(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[HREFLANG[l]] = url(l, path);
  languages["x-default"] = url(DEFAULT_LOCALE, path);
  return { canonical: url(locale, path), languages };
}

export function pageMetadata(locale: Locale, path: string, title: string, description: string, opts: { index?: boolean } = {}): Metadata {
  const index = opts.index ?? true;
  return {
    metadataBase: new URL(SITE_URL),
    title, description,
    alternates: alternates(locale, path),
    robots: index ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } } : { index: false, follow: true },
    openGraph: {
      type: "website", siteName: "OTPProvider", title, description, url: url(locale, path),
      locale: OG_LOCALE[locale], alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: [{ url: `${SITE_URL}/og.png`, width: 1200, height: 630, alt: "OTPProvider" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og.png`] },
    verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION, other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : {} } : undefined,
  };
}

type Json = Record<string, unknown>;
export const organizationLd = (): Json => ({
  "@context": "https://schema.org", "@type": "Organization", name: "OTPProvider", url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
});
export const websiteLd = (locale: Locale): Json => ({
  "@context": "https://schema.org", "@type": "WebSite", name: "OTPProvider", url: url(locale, ""), inLanguage: HREFLANG[locale],
});
export const faqLd = (items: { q: string; a: string }[]): Json => ({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
});
export const breadcrumbLd = (locale: Locale, crumbs: { name: string; path: string }[]): Json => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: url(locale, c.path) })),
});
/** Safe to embed in a <script type="application/ld+json">: "<" is escaped so content can never close the tag. */
export const ldString = (data: Json | Json[]) => JSON.stringify(data).replace(/</g, "\\u003c");

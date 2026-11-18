import type { Metadata, Viewport } from "next";
import { Cairo, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LOCALES, RTL, isLocale, HREFLANG } from "../../i18n/config";
import { JsonLd } from "../../components/JsonLd";
import { organizationLd, websiteLd, SITE_URL } from "../../lib/seo";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const dynamicParams = false;
export function generateStaticParams() { return LOCALES.map((locale) => ({ locale })); }

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "OTPProvider",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: "#06141A",
  colorScheme: "dark",
};

export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={HREFLANG[locale]} dir={RTL.has(locale) ? "rtl" : "ltr"} className={`${inter.variable} ${cairo.variable}`}>
      <body>
        <JsonLd data={[organizationLd(), websiteLd(locale)]} />
        {children}
      </body>
    </html>
  );
}

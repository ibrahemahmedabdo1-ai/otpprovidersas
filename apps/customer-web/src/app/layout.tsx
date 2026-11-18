import type { Metadata, Viewport } from "next";
import { Cairo, Inter } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, dirOf, isLocale } from "../i18n";
import { Providers } from "../components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OTPProvider console", template: "%s | OTPProvider" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "dark" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(c) ? c : DEFAULT_LOCALE;
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${inter.variable} ${cairo.variable}`}>
      <body><Providers initialLocale={locale}>{children}</Providers></body>
    </html>
  );
}

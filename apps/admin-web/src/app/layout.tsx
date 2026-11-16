import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "../components/Providers";
import { APP } from "../config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const metadata: Metadata = {
  title: { default: APP.name, template: `%s | ${APP.name}` },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={inter.variable}><body><Providers>{children}</Providers></body></html>;
}

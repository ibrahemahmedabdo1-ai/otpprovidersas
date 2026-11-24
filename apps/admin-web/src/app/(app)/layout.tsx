"use client";
import type { ReactNode } from "react";
import { Shell } from "../../components/Shell";
import { useApp } from "../../components/Providers";

export default function Layout({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const nav: [string, string][] = [["/", "nav.overview"], ["/deposits", "nav.deposits"], ["/users", "nav.users"], ["/organizations", "nav.organizations"], ["/pricing", "nav.pricing"], ["/coupons", "nav.coupons"], ["/providers", "nav.providers"], ["/tickets", "nav.tickets"], ["/translation", "nav.translation"], ["/whatsapp", "nav.whatsapp"], ["/webhooks", "nav.webhooks"], ["/company", "nav.company"], ["/audit", "nav.audit"], ["/reconciliation", "nav.reconciliation"]];
  if (user?.role === "super_admin") nav.push(["/approvals", "nav.approvals"], ["/staff", "nav.staff"]);
  nav.push(["/planned", "nav.planned"]);
  return <Shell nav={nav}>{children}</Shell>;
}

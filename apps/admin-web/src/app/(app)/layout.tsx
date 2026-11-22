"use client";
import type { ReactNode } from "react";
import { Shell } from "../../components/Shell";
import { useApp } from "../../components/Providers";

export default function Layout({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const nav: [string, string][] = [["/", "Command Center"], ["/system-map", "System Map"], ["/deposits", "Deposits"], ["/users", "Users"], ["/organizations", "Organizations"], ["/pricing", "Pricing"], ["/providers", "Providers"], ["/tickets", "Tickets"], ["/webhooks", "Webhooks"], ["/company", "Company"], ["/audit", "Audit log"], ["/reconciliation", "Reconciliation"]];
  if (user?.role === "super_admin") nav.push(["/approvals", "Approvals"], ["/staff", "Staff"]);
  nav.push(["/planned", "Not built yet"]);
  return <Shell nav={nav}>{children}</Shell>;
}

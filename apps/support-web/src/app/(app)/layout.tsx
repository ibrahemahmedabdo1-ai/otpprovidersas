"use client";
import type { ReactNode } from "react";
import { Shell } from "../../components/Shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <Shell nav={[["/", "Dashboard"], ["/tickets", "Tickets"], ["/deposits", "Top-up handoff"]]}>{children}</Shell>;
}

"use client";
import type { ReactNode } from "react";
import { Shell } from "../../components/Shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <Shell nav={[["/", "Tickets"], ["/packages", "Packages"], ["/topups", "Top-ups"]]}>{children}</Shell>;
}

"use client";
import type { ReactNode } from "react";
import { APP } from "../config";

export function AuthFrame({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="center">
      <div className="authcard">
        <div className="authtop"><span className="brand"><img src="/icon.svg" alt="" width={28} height={28} /><span>{APP.name}</span></span></div>
        <div className="card"><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}{children}</div>
      </div>
    </div>
  );
}

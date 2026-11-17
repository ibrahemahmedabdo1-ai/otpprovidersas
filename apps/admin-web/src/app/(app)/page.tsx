"use client";
import Link from "next/link";
import { useApp } from "../../components/Providers";
import { Alert } from "../../components/ui";

export default function Overview() {
  const { user } = useApp();
  return (
    <>
      <div className="pagehead"><h1>Overview</h1><p>Money-moving actions are limited to Admin and Super Admin, and every one is written to the audit log.</p></div>
      <div className="grid">
        <Link className="card" href="/deposits"><h2>Deposits</h2><p className="muted">Review top-up requests. Approve only after independently confirming the funds arrived.</p></Link>
        {user?.role === "super_admin" && <Link className="card" href="/approvals"><h2>Approvals</h2><p className="muted">Decide approval requests raised by Admins. You cannot decide your own.</p></Link>}
      </div>
      <Alert kind="info">Editing users and organizations, pricing, providers and legal documents are not built in this version. See “Not built yet”. Nothing here shows placeholder data.</Alert>
    </>
  );
}

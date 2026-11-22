"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../components/ui";
import { api, errorText, fmtDate } from "../../lib/api";

type CustomerTicket = { ticketId:string; subject:string; status:string; priority:string; updatedAt:string; organization:string; email:string; paidBalanceUsd:string; giftBalanceUsd:string; reservedUsd:string };
type Dashboard = { assignedTickets:number; openTickets:number; waitingTickets:number; escalatedTickets:number; resolvedTickets:number; customers:CustomerTicket[] };

const usd=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export default function SupportDashboard() {
 const [data,setData]=useState<Dashboard|null>(null),[error,setError]=useState("");
 const load=useCallback(async()=>{const r=await api<Dashboard>("GET","/v1/dashboard/support");if(r.ok&&r.data){setData(r.data);setError("");}else setError(errorText(r));},[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
 return <>
  <div className="pagehead"><h1>Support Dashboard</h1><p>Your assigned workload, customer balances and latest activity. Balances are read-only.</p><button className="btn ghost small" onClick={()=>void load()}>Refresh</button></div>
  {error&&<Alert kind="error">{error}</Alert>}
  {!data?<Loading/>:<>
   <div className="grid">
    <div className="stat big"><div className="stat-label">Assigned tickets</div><div className="stat-value">{data.assignedTickets}</div><div className="stat-hint">Currently assigned to you</div></div>
    <div className="stat"><div className="stat-label">Open</div><div className="stat-value">{data.openTickets}</div></div>
    <div className="stat"><div className="stat-label">Waiting for customer</div><div className="stat-value">{data.waitingTickets}</div></div>
    <div className="stat"><div className="stat-label">Escalated</div><div className="stat-value">{data.escalatedTickets}</div></div>
    <div className="stat"><div className="stat-label">Resolved</div><div className="stat-value">{data.resolvedTickets}</div></div>
   </div>
   <div className="pagehead"><h2>Assigned customers & wallet balances</h2><p>Paid wallet and promotional gift balance are displayed separately. Gift credit is not cash and is not withdrawable.</p></div>
   {data.customers.length===0?<Empty title="No assigned customers yet" body="Tickets assigned to you will appear here."/>:
   <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Ticket</th><th>Status</th><th>Paid wallet</th><th>Gift balance</th><th>Reserved</th><th>Last activity</th></tr></thead><tbody>
    {data.customers.map(c=><tr key={c.ticketId}><td><strong>{c.email}</strong><div className="muted">{c.organization}</div></td><td>{c.subject}</td><td><span className="chip">{c.status}</span></td><td>${c.paidBalanceUsd}</td><td>${c.giftBalanceUsd}</td><td>${c.reservedUsd}</td><td>{fmtDate(c.updatedAt)}</td></tr>)}
   </tbody></table></div>}
   <div className="row"><a className="btn" href="/tickets">Open ticket inbox</a></div>
  </>}
 </>;
}
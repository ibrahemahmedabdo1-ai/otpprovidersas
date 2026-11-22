"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../components/ui";
import { api, errorText, fmtDate } from "../../lib/api";
type Dashboard={customers:number;activeCustomers:number;otp30d:{total:number;successful:number;failed:number;email:number;whatsapp:number};wallet:{paidUsd:string;giftUsd:string};tickets:{open:number;escalated:number};pendingDeposits:number;providers:{key:string;channel:string;enabled:boolean;maintenance:boolean;health:string;checkedAt:string|null}[];recentActivity:{action:string;subject_type:string;subject_id:string;created_at:string}[]};
const usd=(n:number|string)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export default function AdminDashboard(){
 const [data,setData]=useState<Dashboard|null>(null),[error,setError]=useState("");
 const load=useCallback(async()=>{const r=await api<Dashboard>("GET","/v1/dashboard/admin");if(r.ok&&r.data){setData(r.data);setError("");}else setError(errorText(r));},[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
 return <>
  <div className="pagehead"><h1>Command Center</h1><p>Live operational overview · OTP activity over the last 30 days.</p><button className="btn ghost small" onClick={()=>void load()}>Refresh data</button></div>
  {error&&<Alert kind="error">{error}</Alert>}
  {!data?<Loading/>:<>
   <div className="grid">
    <div className="stat big"><div className="stat-label">Total customers</div><div className="stat-value">{data.customers.toLocaleString()}</div><div className="stat-hint">{data.activeCustomers.toLocaleString()} active</div></div>
    <div className="stat"><div className="stat-label">Live OTP requests · 30d</div><div className="stat-value">{data.otp30d.total.toLocaleString()}</div><div className="stat-hint">Email {data.otp30d.email} · WhatsApp {data.otp30d.whatsapp}</div></div>
    <div className="stat"><div className="stat-label">Successful requests</div><div className="stat-value">{data.otp30d.successful.toLocaleString()}</div><div className="stat-hint">Failed {data.otp30d.failed.toLocaleString()}</div></div>
    <div className="stat"><div className="stat-label">Paid wallet liability</div><div className="stat-value">{usd(data.wallet.paidUsd)}</div><div className="stat-hint">Customer paid balances</div></div>
    <div className="stat"><div className="stat-label">Gift credit liability</div><div className="stat-value">{usd(data.wallet.giftUsd)}</div><div className="stat-hint">Promotional balances, separate from paid</div></div>
    <div className="stat"><div className="stat-label">Open tickets</div><div className="stat-value">{data.tickets.open}</div><div className="stat-hint">Escalated {data.tickets.escalated}</div></div>
    <div className="stat"><div className="stat-label">Pending deposits</div><div className="stat-value">{data.pendingDeposits}</div><div className="stat-hint">Awaiting review</div></div>
   </div>
   <div className="pagehead"><h2>Provider health</h2><p>Latest recorded health check. An enabled flag alone does not mean a route is healthy.</p></div>
   {data.providers.length===0?<Empty title="No providers configured"/>:<div className="tablewrap"><table><thead><tr><th>Provider</th><th>Channel</th><th>Enabled</th><th>Maintenance</th><th>Health</th><th>Last check</th></tr></thead><tbody>{data.providers.map(p=><tr key={p.key}><td>{p.key}</td><td>{p.channel}</td><td>{p.enabled?"Yes":"No"}</td><td>{p.maintenance?"Yes":"No"}</td><td><span className="chip">{p.health}</span></td><td>{fmtDate(p.checkedAt)}</td></tr>)}</tbody></table></div>}
   <div className="pagehead"><h2>Recent audit activity</h2></div>
   {data.recentActivity.length===0?<Empty title="No recent activity"/>:<div className="tablewrap"><table><thead><tr><th>Action</th><th>Subject</th><th>Time</th></tr></thead><tbody>{data.recentActivity.map((a,i)=><tr key={i}><td>{a.action}</td><td>{a.subject_type} · {a.subject_id}</td><td>{fmtDate(a.created_at)}</td></tr>)}</tbody></table></div>}
  </>}
 </>;
}
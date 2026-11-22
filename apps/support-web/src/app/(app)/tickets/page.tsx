"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {Alert,Empty,Loading} from "../../../components/ui";
import {api,errorText,fmtDate} from "../../../lib/api";
import {STATUSES,STATUS_LABEL,UNAVAILABLE,type Ticket} from "../../../lib/tickets";
export default function TicketInbox(){
 const [status,setStatus]=useState<string>("open"),[rows,setRows]=useState<Ticket[]|null>(null),[err,setErr]=useState("");
 const load=useCallback(async()=>{setRows(null);const r=await api<Ticket[]>("GET",`/v1/support/tickets?status=${encodeURIComponent(status)}`);if(r.ok&&r.data){setRows(r.data);setErr("");}else{setRows([]);setErr(r.status===404?UNAVAILABLE:errorText(r));}},[status]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
 return <><div className="pagehead"><h1>Support ticket inbox</h1><p>Unassigned tickets and tickets assigned to you. Tickets assigned to another Support agent are not shown.</p><button className="btn ghost small" onClick={()=>void load()}>Refresh</button></div>
 <div className="seg" role="group" aria-label="Ticket status">{STATUSES.map(s=><button key={s} type="button" aria-pressed={status===s} onClick={()=>setStatus(s)}>{STATUS_LABEL[s]??s}</button>)}</div>
 {err&&<Alert>{err}</Alert>}{rows===null?<Loading/>:rows.length===0?<Empty title="No tickets in this view" body="New unassigned customer conversations will appear here."/>:
 <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Subject</th><th>Status</th><th>Priority</th><th>Assigned to</th><th>Last activity</th></tr></thead><tbody>
 {rows.map(t=><tr key={t.id}><td>{t.requester}</td><td><Link href={`/tickets/${t.id}`}>{t.subject}</Link></td><td><span className="chip">{STATUS_LABEL[t.status]??t.status}</span></td><td>{t.priority}</td><td>{t.assignee??"Unassigned"}</td><td>{fmtDate(t.updatedAt)}</td></tr>)}
 </tbody></table></div>}</>;
}

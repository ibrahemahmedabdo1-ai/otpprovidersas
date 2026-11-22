"use client";
import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { Alert,Empty,Loading } from "../../../components/ui";
import { api,errorText,fmtDate } from "../../../lib/api";

type Deposit={id:string;amountUsd:string;status:string;note:string|null;evidenceNote:string|null;ticketId:string|null;organization:string;customerEmail:string;createdAt:string};
export default function SupportDeposits(){
 const [rows,setRows]=useState<Deposit[]|null>(null),[notes,setNotes]=useState<Record<string,string>>({}),[busy,setBusy]=useState<string|null>(null),[err,setErr]=useState(""),[ok,setOk]=useState("");
 const load=useCallback(async()=>{const r=await api<Deposit[]>("GET","/v1/support/deposits");if(r.ok&&r.data){setRows(r.data);setErr("");}else setErr(errorText(r));},[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
 async function submit(id:string){const evidenceNote=(notes[id]??"").trim();if(evidenceNote.length<5){setErr("Add the transfer reference and how the proof was checked (at least 5 characters).");return;}
  setErr("");setOk("");setBusy(id);const r=await api("POST",`/v1/support/deposits/${id}/submit`,{body:{evidenceNote}});setBusy(null);
  if(r.ok){setOk("Submitted to Admin for review. No wallet balance was changed.");setNotes(x=>({...x,[id]:""}));await load();}else setErr(errorText(r));
 }
 return <><div className="pagehead"><h1>Top-up handoff</h1><p>Review the customer's transfer details, record the evidence reference, then submit the request to Admin. Support cannot credit wallets.</p><button className="btn ghost small" onClick={()=>void load()}>Refresh</button></div>
 {err&&<Alert>{err}</Alert>}{ok&&<Alert kind="ok">{ok}</Alert>}
 {rows===null?<Loading/>:rows.length===0?<Empty title="No open top-up requests" body="New customer top-up requests will appear here."/>:
 <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Amount</th><th>Status</th><th>Request details</th><th>Conversation</th><th>Transfer evidence review</th></tr></thead><tbody>
 {rows.map(d=><tr key={d.id}><td><strong>{d.customerEmail}</strong><div className="muted">{d.organization}</div><div className="muted">{fmtDate(d.createdAt)}</div></td>
 <td dir="ltr">${d.amountUsd}</td><td><span className="chip warn">{d.status}</span></td><td>{d.note||"—"}{d.evidenceNote&&<p className="muted">Previous review: {d.evidenceNote}</p>}</td>
 <td>{d.ticketId?<Link href={`/tickets/${d.ticketId}`}>Open customer chat</Link>:"No linked chat"}</td>
 <td><textarea aria-label="Transfer evidence review note" rows={3} maxLength={500} value={notes[d.id]??""} onChange={e=>setNotes(x=>({...x,[d.id]:e.target.value}))} placeholder="Transfer reference, sender, amount and where it was checked (do not approve funds here)."/>
 <button className="btn small" disabled={busy===d.id||(notes[d.id]??"").trim().length<5} onClick={()=>void submit(d.id)}>{busy===d.id?"Submitting…":"Submit to Admin"}</button></td></tr>)}
 </tbody></table></div>}</>;
}

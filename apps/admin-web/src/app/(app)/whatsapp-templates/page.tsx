"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText } from "../../../lib/api";

type Template = { id:string; name:string; body:string; status:string; customer_email:string; project_name:string|null; created_at:string; rejection_reason:string|null };
export default function WhatsAppTemplatesPage(){
 const {user}=useApp(); const [rows,setRows]=useState<Template[]|null>(null); const [err,setErr]=useState(""); const [reason,setReason]=useState<Record<string,string>>({});
 const [name,setName]=useState(""); const [body,setBody]=useState("Your verification code is {code}. It expires in {expiry_minutes} minutes.");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await api<Template[]>("GET","/v1/admin/whatsapp-templates?status=pending");if(r.ok&&r.data)setRows(r.data);else{setRows([]);setErr(errorText(r));}},[]);
 useEffect(()=>{void load();},[load]);
 async function decide(id:string,decision:"approve"|"reject"){setErr("");const r=await api("POST",`/v1/admin/whatsapp-templates/${id}/decision`,{body:{decision,reason:reason[id]||""}});if(!r.ok)setErr(errorText(r));await load();}
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setErr("");const r=await api("POST","/v1/admin/whatsapp-templates",{body:{name,body}});setBusy(false);if(r.ok){setName("");await load();}else setErr(errorText(r));}
 if(user?.role!=="super_admin")return <div className="pagehead"><h1>WhatsApp message templates</h1><p>Super Admin access required.</p></div>;
 return <><div className="pagehead"><h1>WhatsApp message templates</h1><p>Review customer message changes. Only approved, immutable versions appear in the customer catalog.</p></div>{err&&<Alert>{err}</Alert>}
 <form className="card" onSubmit={create}><h2>Create an approved ready-made template</h2><label className="field"><span>Name</span><input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={80} required /></label><label className="field"><span>Message text</span><textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={500} rows={4} required /></label><p className="muted">Required: {"{code}"} · Optional: {"{service_name}"}, {"{expiry_minutes}"}</p><button className="btn" disabled={busy}>{busy?"Saving…":"Create approved template"}</button></form>
 <h2>Pending customer approvals</h2>{rows===null?<Loading/>:rows.length===0?<p className="muted">No pending requests.</p>:<div className="stack">{rows.map(x=><article className="card" key={x.id}><div className="row"><strong>{x.name}</strong><span className="chip warn">Pending</span></div><p className="muted">{x.customer_email} · {x.project_name||"Project"}</p><blockquote>{x.body}</blockquote><label className="field"><span>Reason (required only for rejection)</span><input value={reason[x.id]||""} onChange={e=>setReason(v=>({...v,[x.id]:e.target.value}))} maxLength={500}/></label><div className="row"><button className="btn" onClick={()=>void decide(x.id,"approve")}>Approve</button><button className="btn ghost" onClick={()=>void decide(x.id,"reject")}>Reject</button></div></article>)}</div>}</>;
}

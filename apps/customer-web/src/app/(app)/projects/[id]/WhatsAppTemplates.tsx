"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "../../../../components/ui";
import { api, errorText } from "../../../../lib/api";

type T={id:string;name:string;body:string;project_id:string|null};
type Data={selectedTemplateId:string|null;templates:T[]};
export default function WhatsAppTemplates({projectId,enabled}:{projectId:string;enabled:boolean}){
 const [data,setData]=useState<Data|null>(null);const [name,setName]=useState("");const [body,setBody]=useState("Your verification code is {code}. It expires in {expiry_minutes} minutes.");const [err,setErr]=useState("");const [note,setNote]=useState("");const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!enabled)return;const r=await api<Data>("GET",`/v1/console/projects/${projectId}/whatsapp-templates`);if(r.ok&&r.data)setData(r.data);else setErr(errorText(r));},[enabled,projectId]);
 useEffect(()=>{void load();},[load]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setErr("");setNote("");const r=await api("POST",`/v1/console/projects/${projectId}/whatsapp-templates`,{body:{name,body}});setBusy(false);if(r.ok){setName("");setNote("Submitted for Admin approval. It cannot be used until approved.");}else setErr(errorText(r));}
 async function select(id:string){setErr("");const r=await api("POST",`/v1/console/projects/${projectId}/whatsapp-templates/${id}/select`);if(r.ok){setNote("Approved template selected.");await load();}else setErr(errorText(r));}
 return <section className="card"><h2>WhatsApp message</h2>{!enabled?<p className="muted">WhatsApp is not enabled for this project.</p>:<>{err&&<Alert>{err}</Alert>}{note&&<Alert kind="info">{note}</Alert>}<p className="muted">Choose an approved ready-made message, or submit your own wording for review.</p>{data===null?<p className="muted">Loading templates…</p>:data.templates.length===0?<p className="muted">No approved templates are available yet. You can submit one below.</p>:<div className="stack">{data.templates.map(t=><article key={t.id} className="card"><div className="row"><strong>{t.name}</strong>{data.selectedTemplateId===t.id?<span className="chip ok">Selected</span>:<button className="btn small" onClick={()=>void select(t.id)}>Use this message</button>}</div><p>{t.body}</p></article>)}</div>}<form onSubmit={submit} className="stack" style={{marginTop:"1rem"}}><h3>Submit a custom message</h3><label className="field"><span>Template name</span><input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={80} required /></label><label className="field"><span>Message text</span><textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={500} rows={4} required /></label><p className="muted">Required variable: {"{code}"} · Optional: {"{service_name}"}, {"{expiry_minutes}"}</p><button className="btn" disabled={busy}>{busy?"Submitting…":"Submit for approval"}</button></form></>}</section>;
}

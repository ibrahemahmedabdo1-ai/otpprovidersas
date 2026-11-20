"use client";
import { useCallback,useEffect,useState } from "react";
import { Alert,Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api,errorText,fmtDate } from "../../../lib/api";

type Device={id:string;label:string;state:string;routing_eligible:boolean;priority:number;last_activity_at:string|null;last_error:string|null;created_at:string};
type QR={state:string;qr?:string|null};
export default function WhatsAppDevicesPage(){
 const {user}=useApp(); const [rows,setRows]=useState<Device[]|null>(null); const [err,setErr]=useState(""); const [label,setLabel]=useState(""); const [busy,setBusy]=useState(false); const [qrs,setQrs]=useState<Record<string,QR>>({});
 const load=useCallback(async()=>{const r=await api<Device[]>("GET","/v1/admin/whatsapp-devices");if(r.ok&&r.data)setRows(r.data);else{setRows([]);setErr(errorText(r));}},[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!rows?.length)return;let alive=true;const poll=async()=>{await load();for(const d of rows){const r=await api<QR>("GET",`/v1/admin/whatsapp-devices/${d.id}/qr`);if(alive&&r.ok&&r.data)setQrs(v=>({...v,[d.id]:r.data!}));}};void poll();const timer=setInterval(()=>void poll(),3000);return()=>{alive=false;clearInterval(timer)};},[rows,load]);
 async function add(e:React.FormEvent){e.preventDefault();setBusy(true);setErr("");const r=await api("POST","/v1/admin/whatsapp-devices",{label});setBusy(false);if(r.ok){setLabel("");await load()}else setErr(errorText(r))}
 async function reconnect(id:string){const r=await api("POST",`/v1/admin/whatsapp-devices/${id}/reconnect`);if(!r.ok)setErr(errorText(r));await load()}
 async function remove(id:string){if(!window.confirm("Delete this linked device and revoke its saved WhatsApp session?"))return;const r=await api("DELETE",`/v1/admin/whatsapp-devices/${id}`);if(!r.ok)setErr(errorText(r));else setQrs(v=>{const n={...v};delete n[id];return n});await load()}
 if(user?.role!=="super_admin")return <div className="pagehead"><h1>WhatsApp devices</h1><p>Super Admin access required.</p></div>;
 return <><div className="pagehead"><h1>WhatsApp linked devices</h1><p>Add multiple WhatsApp Web devices, pair each one by QR, reconnect or revoke a device. Customer sending remains disabled during setup.</p></div>{err&&<Alert>{err}</Alert>}
 <form className="card" onSubmit={add}><h2>Add a device</h2><label className="field"><span>Device name</span><input value={label} onChange={e=>setLabel(e.target.value)} minLength={2} maxLength={80} placeholder="e.g. WhatsApp Support 1" required/></label><button className="btn" disabled={busy}>{busy?"Creating…":"Add WhatsApp device"}</button></form>
 <h2>Connected devices</h2>{rows===null?<Loading/>:rows.length===0?<p className="muted">No devices have been added yet.</p>:<div className="stack">{rows.map(d=><article className="card" key={d.id}><div className="row"><div><h3>{d.label}</h3><p className="muted">Last activity: {fmtDate(d.last_activity_at)||"Not connected yet"}</p></div><span className={`chip ${d.state==="connected"?"ok":d.state==="pairing"?"warn":"bad"}`}>{d.state}</span></div>{d.state!=="connected"&&qrs[d.id]?.qr&&<div className="card"><p>Scan this QR from WhatsApp → Linked devices → Link a device.</p><img alt={`Pairing QR for ${d.label}`} src={qrs[d.id]?.qr ?? ""} style={{width:280,maxWidth:"100%",display:"block",margin:"12px auto"}}/><p className="muted">QR is temporary and private. Do not share it.</p></div>}{d.last_error&&<p className="muted">Last error: {d.last_error}</p>}<div className="row"><button className="btn small" onClick={()=>void reconnect(d.id)}>Reconnect / Refresh QR</button><button className="btn small ghost" onClick={()=>void remove(d.id)}>Delete device</button></div></article>)}</div>}</>;
}
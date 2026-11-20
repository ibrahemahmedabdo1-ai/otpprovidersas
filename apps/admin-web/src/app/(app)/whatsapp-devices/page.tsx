"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { useApp } from "../../../components/Providers";
import { api, errorText } from "../../../lib/api";

type Device = { id: string; label: string; state: string; routingEligible: boolean; priority: number; lastActivityAt: string | null; lastError: string | null; createdAt: string };
export default function WhatsappDevices() {
  const { user } = useApp();
  const canManage = user?.role === "super_admin";
  const [rows,setRows] = useState<Device[]|null>(null), [error,setError] = useState(""), [label,setLabel] = useState(""), [busy,setBusy] = useState("");
  const [editing,setEditing] = useState(""), [editLabel,setEditLabel] = useState(""), [qr,setQr] = useState<{id:string;label:string;src:string}|null>(null);
  const load=useCallback(async()=>{const r=await api<Device[]>("GET","/v1/admin/whatsapp-devices");if(r.ok&&r.data)setRows(r.data);else{setRows([]);setError(errorText(r));}},[]);
  useEffect(()=>{void load();},[load]);
  async function action(key:string,fn:()=>Promise<any>){setBusy(key);setError("");try{const r=await fn();if(!r.ok)setError(errorText(r));else await load();}finally{setBusy("");}}
  async function add(){await action("add",()=>api("POST","/v1/admin/whatsapp-devices",{label}));setLabel("");}
  async function rename(id:string){await action("rename:"+id,()=>api("PATCH","/v1/admin/whatsapp-devices/"+id,{label:editLabel}));setEditing("");}
  async function reconnect(id:string){await action("reconnect:"+id,()=>api("POST","/v1/admin/whatsapp-devices/"+id+"/reconnect"));}
  async function remove(d:Device){if(!window.confirm("Delete "+d.label+"? This logs out and removes only this device session. Other devices remain connected."))return;await action("delete:"+d.id,()=>api("DELETE","/v1/admin/whatsapp-devices/"+d.id));if(qr?.id===d.id)setQr(null);}
  async function showQr(d:Device){setError("");const r=await api<{qr?:string;state:string;error?:string}>("GET","/v1/admin/whatsapp-devices/"+d.id+"/qr");if(r.ok&&r.data?.qr)setQr({id:d.id,label:d.label,src:r.data.qr});else setError(r.data?.error==="qr_not_available"?"لا يوجد QR حالي لهذا الجهاز. اضغط إعادة الاتصال أولًا.":errorText(r));}
  const state=(s:string)=>s==="connected"?"متصل":s==="pairing"?"في انتظار المسح":s==="starting"?"يبدأ الاتصال":s==="logged_out"?"تم تسجيل الخروج":s==="error"?"خطأ":"غير متصل";
  return <>
    <div className="pagehead"><h1>أجهزة WhatsApp المرتبطة</h1><p>كل جهاز له جلسة وQR وحالة مستقلة. الحذف يسجل خروج الجهاز المحدد فقط. الإرسال للعملاء والتوجيه التلقائي يظلان متوقفين.</p></div>
    {error&&<Alert>{error}</Alert>}
    {canManage&&<section className="card" style={{marginBottom:20}}><h2>إضافة جهاز</h2><form onSubmit={e=>{e.preventDefault();void add();}} style={{display:"flex",gap:10,flexWrap:"wrap"}}><input aria-label="اسم الجهاز" placeholder="مثال: WhatsApp Support 02" value={label} onChange={e=>setLabel(e.target.value)} minLength={2} maxLength={80} required/><button className="btn" disabled={!!busy||label.trim().length<2}>{busy==="add"?"جارٍ الإضافة…":"إضافة جهاز جديد"}</button></form></section>}
    {rows===null?<Loading/>:rows.length===0?<Empty title="لا توجد أجهزة مرتبطة"/>:<div className="tablewrap"><table><thead><tr><th>الجهاز</th><th>الحالة</th><th>آخر نشاط</th><th>التوجيه</th><th>الإجراءات</th></tr></thead><tbody>{rows.map(d=><tr key={d.id}><td><strong>{d.label}</strong><div className="muted">{d.id}</div></td><td><span className={"chip "+(d.state==="connected"?"ok":d.state==="pairing"?"warn":"bad")}>{state(d.state)}</span>{d.lastError&&<div className="muted">{d.lastError}</div>}</td><td>{d.lastActivityAt?new Date(d.lastActivityAt).toLocaleString():"—"}</td><td>{d.routingEligible?"مؤهل":"متوقف"}</td><td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="btn small" onClick={()=>void showQr(d)}>عرض QR</button>{canManage&&<><button className="btn small" disabled={!!busy} onClick={()=>void reconnect(d.id)}>إعادة الاتصال</button><button className="btn small" onClick={()=>{setEditing(d.id);setEditLabel(d.label);}}>تعديل الاسم</button><button className="btn small danger" disabled={!!busy} onClick={()=>void remove(d)}>حذف</button></>}</div>{editing===d.id&&<form onSubmit={e=>{e.preventDefault();void rename(d.id);}} style={{display:"flex",gap:6,marginTop:8}}><input aria-label="الاسم الجديد" value={editLabel} onChange={e=>setEditLabel(e.target.value)} minLength={2} maxLength={80}/><button className="btn small" disabled={!!busy}>حفظ</button><button type="button" className="btn small ghost" onClick={()=>setEditing("")}>إلغاء</button></form>}</td></tr>)}</tbody></table></div>}
    {qr&&<section className="card" style={{marginTop:20,textAlign:"center"}}><h2>QR — {qr.label}</h2><img src={qr.src} alt={"WhatsApp pairing QR for "+qr.label} style={{width:320,maxWidth:"100%",imageRendering:"pixelated"}}/><p>افتح WhatsApp على الهاتف المطلوب ← الأجهزة المرتبطة ← ربط جهاز.</p><button className="btn ghost" onClick={()=>setQr(null)}>إغلاق</button></section>}
  </>;
}

"use client";
import {useCallback,useEffect,useState} from "react";
import {useApp} from "../../../components/Providers";
import {Alert,Empty,Loading} from "../../../components/ui";
import {api,errorText} from "../../../lib/api";
import {fmtDate} from "../../../lib/format";
type Notice={id:string;kind:string;title:string;body:string|null;readAt:string|null;createdAt:string};
export default function NotificationsPage(){
 const {t}=useApp();const [rows,setRows]=useState<Notice[]|null>(null),[err,setErr]=useState("");
 const load=useCallback(async()=>{const r=await api<Notice[]>("GET","/v1/console/notifications");if(r.ok&&r.data){setRows(r.data);setErr("");}else setErr(errorText(t,r));},[t]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
 async function markRead(id:string){const r=await api("POST",`/v1/console/notifications/${id}/read`,{});if(r.ok)await load();else setErr(errorText(t,r));}
 const unread=rows?.filter(x=>!x.readAt).length??0;
 return <><div className="pagehead"><h1>Notifications</h1><p>{unread} unread notifications</p><button className="btn ghost small" onClick={()=>void load()}>Refresh</button></div>
 {err&&<Alert>{err}</Alert>}{rows===null?<Loading/>:rows.length===0?<Empty title="No notifications yet"/>:
 <div className="grid">{rows.map(n=><article className="card" key={n.id} style={!n.readAt?{borderColor:"var(--accent)"}:undefined}>
 <div className="row" style={{justifyContent:"space-between"}}><strong>{n.title}</strong><span className="chip">{n.readAt?"Read":"Unread"}</span></div>
 <p style={{whiteSpace:"pre-wrap"}}>{n.body??""}</p><p className="muted">{fmtDate(n.createdAt)}</p>
 {!n.readAt&&<button className="btn ghost small" onClick={()=>void markRead(n.id)}>Mark as read</button>}
 </article>)}</div>}
 </>;
}

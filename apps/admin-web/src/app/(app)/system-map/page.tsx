"use client";
import {useCallback,useEffect,useState} from "react";
import {Alert,Empty,Loading} from "../../../components/ui";
import {api,errorText,fmtDate} from "../../../lib/api";
type Item={key:string;label:string;state:"healthy"|"warning"|"critical"|"unknown";detail:string;lastCheckedAt:string|null;impact:string;action:string};
type Snapshot={checkedAt:string;overall:string;counts:{healthy:number;warning:number;critical:number;unknown:number};items:Item[]};
const statusLabel:Record<string,string>={healthy:"Healthy",warning:"Warning",critical:"Critical",unknown:"Unknown"};
export default function SystemMap(){
 const [data,setData]=useState<Snapshot|null>(null),[err,setErr]=useState(""),[loading,setLoading]=useState(false);
 const load=useCallback(async()=>{setLoading(true);const r=await api<Snapshot>("GET","/v1/dashboard/system");setLoading(false);if(r.ok&&r.data){setData(r.data);setErr("");}else setErr(errorText(r));},[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
 return <><div className="pagehead"><h1>System Map & Health</h1><p>Live checks from the API and database. A warning means the component is not proven production-ready; it is not a decorative status.</p><button className="btn ghost small" disabled={loading} onClick={()=>void load()}>{loading?"Checking…":"Run checks"}</button></div>
 {err&&<Alert>{err}</Alert>}{!data?<Loading/>:<>
 <div className="grid">
 <div className="stat big"><div className="stat-label">Overall system</div><div className="stat-value">{statusLabel[data.overall]??data.overall}</div><div className="stat-hint">Checked {fmtDate(data.checkedAt)}</div></div>
 <div className="stat"><div className="stat-label">Healthy</div><div className="stat-value">{data.counts.healthy}</div></div>
 <div className="stat"><div className="stat-label">Warnings</div><div className="stat-value">{data.counts.warning}</div></div>
 <div className="stat"><div className="stat-label">Critical</div><div className="stat-value">{data.counts.critical}</div></div>
 <div className="stat"><div className="stat-label">Unknown</div><div className="stat-value">{data.counts.unknown}</div></div>
 </div>
 <div className="grid">{data.items.map(x=><article className="card" key={x.key}>
 <div className="row" style={{justifyContent:"space-between"}}><strong>{x.label}</strong><span className={`chip ${x.state==="healthy"?"ok":x.state==="critical"?"bad":"warn"}`}>{statusLabel[x.state]}</span></div>
 <p>{x.detail}</p><p className="muted"><strong>Impact:</strong> {x.impact}</p><p><strong>Action:</strong> {x.action}</p><p className="muted">Last check: {fmtDate(x.lastCheckedAt)}</p>
 </article>)}</div>
 <p className="hint">Checks cover API reachability, database connectivity, provider health freshness, WhatsApp device state, webhook queue, suspicious logins, OTP outcomes and configured email sender domains. They do not replace end-to-end provider tests or storage attachment scanning.</p>
 </>}
 </>;
}

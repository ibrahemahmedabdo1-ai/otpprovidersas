"use client";
import {useCallback,useEffect,useState} from "react";
import {useApp} from "../../../components/Providers";
import {Alert,Loading} from "../../../components/ui";
import {api,errorText} from "../../../lib/api";
import {fmtDate} from "../../../lib/format";
type Verification={status:string;useCase:string|null;website:string|null;note:string|null;createdAt:string|null;reviewedAt:string|null};
export default function VerificationPage(){
 const {t,locale}=useApp();const [data,setData]=useState<Verification|null>(null),[useCase,setUseCase]=useState(""),[website,setWebsite]=useState(""),[err,setErr]=useState(""),[ok,setOk]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await api<Verification>("GET","/v1/console/verification");if(r.ok&&r.data){setData(r.data);setUseCase(r.data.useCase??"");setWebsite(r.data.website??"");setErr("");}else setErr(errorText(t,r));},[t]);
 useEffect(()=>{void load();},[load]);
 async function submit(e:React.FormEvent){e.preventDefault();setErr("");setOk("");setBusy(true);const r=await api("POST","/v1/console/verification",{body:{useCase,website:website.trim()||undefined}});setBusy(false);if(r.ok){setOk(locale==="ar"?"تم إرسال بيانات النشاط إلى الإدارة للمراجعة.":"Your business details were submitted to Admin for review.");await load();}else setErr(errorText(t,r));}
 return <><div className="pagehead"><h1>Account verification</h1><p>Live Email OTP requires administrator approval of your organization, in addition to a funded wallet and an enabled project.</p></div>
 {err&&<Alert>{err}</Alert>}{ok&&<Alert kind="ok">{ok}</Alert>}{!data?<Loading/>:<>
 <div className="card"><div className="row" style={{justifyContent:"space-between"}}><strong>Verification status</strong><span className={`chip ${data.status==="approved"?"ok":data.status==="rejected"?"bad":"warn"}`}>{data.status.replaceAll("_"," ")}</span></div>
 {data.note&&<Alert kind={data.status==="rejected"?"error":"warn"}>{data.note}</Alert>}
 {data.reviewedAt&&<p className="muted">Reviewed: {fmtDate(data.reviewedAt,locale)}</p>}
 {data.status==="approved"?<Alert kind="ok">Your organization has been approved. Email OTP still requires sufficient wallet balance and an enabled project/API key.</Alert>:
 <form onSubmit={submit}>
 <div className="field"><label htmlFor="useCase">Business and intended OTP use (20–1000 characters)</label><textarea id="useCase" rows={5} maxLength={1000} minLength={20} required value={useCase} onChange={e=>setUseCase(e.target.value)} placeholder="Describe your business, what customers are verifying, and how you will use OTP messages."/></div>
 <div className="field"><label htmlFor="website">Business website (optional, HTTPS)</label><input id="website" type="url" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://example.com"/></div>
 <button className="btn" disabled={busy||useCase.trim().length<20}>{busy?"Submitting…":data.status==="pending"?"Update and resubmit":"Submit for administrator review"}</button>
 </form>}
 </div></>}
 </>;
}

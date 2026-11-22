import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth.service";
import { DbService } from "../db.service";

type State="healthy"|"warning"|"critical"|"unknown";
type Item={key:string;label:string;state:State;detail:string;lastCheckedAt:string|null;impact:string;action:string};
@Injectable()
export class SystemMapService {
 constructor(private readonly db:DbService){}
 private admin(ctx:AuthContext){if(ctx.role!=="super_admin"&&ctx.role!=="admin_staff")throw new ForbiddenException({error:"forbidden"});}
 async snapshot(ctx:AuthContext){
  this.admin(ctx);
  const checkedAt=new Date().toISOString();
  const items:Item[]=[];
  const push=(x:Item)=>items.push(x);
  const dbUp=await this.db.ping();
  push({key:"api",label:"API runtime",state:"healthy",detail:"Authenticated system-status endpoint responded.",lastCheckedAt:checkedAt,impact:"Core API process is reachable.",action:"Continue monitoring."});
  const frontendTargets=[
   {key:"website",label:"Public website",url:"https://www.otpprovider.com"},
   {key:"customer-app",label:"Customer dashboard",url:"https://console.otpprovider.com"},
   {key:"admin-app",label:"Admin dashboard",url:"https://admin.otpprovider.com"},
   {key:"support-app",label:"Support dashboard",url:"https://support.otpprovider.com"}
  ];
  const frontendChecks=await Promise.all(frontendTargets.map(async target=>{
   try{const response=await fetch(target.url,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(5000),headers:{"cache-control":"no-cache"}});
    return {...target,status:response.status,ok:response.ok};}
   catch{return {...target,status:0,ok:false};}
  }));
  for(const x of frontendChecks)push({key:x.key,label:x.label,state:x.ok?"healthy":x.status>=500?"critical":"warning",detail:x.ok?"Public HTTPS endpoint returned HTTP "+x.status+".":"Frontend endpoint did not return a successful response"+(x.status?" (HTTP "+x.status+")":"")+".",lastCheckedAt:checkedAt,impact:"Customer and staff access to this application.",action:x.ok?"Continue monitoring availability.":"Check Vercel deployment status, domain assignment and runtime errors."});
  push({key:"database",label:"Neon PostgreSQL",state:dbUp?"healthy":"critical",detail:dbUp?"Database connection check succeeded.":"Database ping failed.",lastCheckedAt:checkedAt,impact:dbUp?"Core data access is available.":"Authentication, wallet and OTP operations may fail.",action:dbUp?"Monitor latency and connection pool.":"Check Neon availability, DATABASE_URL and network access."});
  if(dbUp){
   const safe=async(sql:string)=>{try{return await this.db.pool.query(sql);}catch{return null;}};
   const [providers,devices,queues,security,otp,mail,onboarding]=await Promise.all([
    safe(`SELECT p.key,p.channel,p.enabled,p.maintenance,h.status,h.checked_at,h.detail FROM providers p LEFT JOIN LATERAL (SELECT status,checked_at,detail FROM provider_health ph WHERE ph.provider_id=p.id ORDER BY checked_at DESC LIMIT 1) h ON true ORDER BY p.channel,p.priority`),
    safe("SELECT state,count(*)::int AS n FROM whatsapp_devices GROUP BY state"),
    safe("SELECT count(*) FILTER (WHERE status='dead')::int AS dead,count(*) FILTER (WHERE status='pending' AND next_attempt_at<=now())::int AS overdue FROM webhook_deliveries"),
    safe("SELECT count(*)::int AS n FROM login_history WHERE suspicious=true AND created_at>=now()-interval '24 hours'"),
    safe("SELECT count(*)::int AS total,count(*) FILTER (WHERE status='failed')::int AS failed FROM otp_requests WHERE created_at>=now()-interval '1 hour' AND mode='live'"),
    safe("SELECT count(*)::int AS total,count(*) FILTER (WHERE domain_verified=true)::int AS verified FROM email_configs"),
    safe("SELECT (SELECT count(*)::int FROM users WHERE role='customer' AND status='pending') AS pending_email,(SELECT count(*)::int FROM organizations o LEFT JOIN LATERAL (SELECT status FROM customer_verifications WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 1) cv ON true WHERE cv.status IS DISTINCT FROM 'approved') AS pending_admin_verification")
   ]);
   if(providers){
    for(const p of providers.rows){
     const stale=!p.checked_at||Date.now()-new Date(p.checked_at).getTime()>5*60*1000;
     const state:State=!p.enabled||p.maintenance?"warning":p.status==="down"?"critical":p.status==="healthy"&&!stale?"healthy":"warning";
     push({key:"provider:"+p.key,label:String(p.key)+" ("+String(p.channel)+")",state,detail:!p.enabled?"Provider disabled.":p.maintenance?"Provider in maintenance.":stale?"Health check missing or older than 5 minutes.":"Latest provider health: "+String(p.status??"unknown")+(p.detail?"; "+String(p.detail):""),lastCheckedAt:p.checked_at?new Date(p.checked_at).toISOString():null,impact:"OTP delivery availability for "+String(p.channel)+".",action:state==="healthy"?"Continue monitoring provider receipts.":"Verify credentials, route readiness and run a fresh provider health check."});
    }
   }else push({key:"providers",label:"Provider registry",state:"unknown",detail:"Provider health query unavailable.",lastCheckedAt:checkedAt,impact:"Provider readiness cannot be confirmed.",action:"Check provider schema and API database permissions."});
   if(devices){
    const connected=devices.rows.filter(x=>x.state==="connected").reduce((n,x)=>n+Number(x.n),0);
    const total=devices.rows.reduce((n,x)=>n+Number(x.n),0);
    push({key:"whatsapp-devices",label:"WhatsApp linked devices",state:connected>0?"warning":total>0?"critical":"warning",detail:connected+" connected of "+total+" registered. Linked-device route is unofficial and must remain gated until receipt reconciliation is verified.",lastCheckedAt:checkedAt,impact:"WhatsApp OTP cannot be treated as production-ready from device connection alone.",action:"Verify each device session and delivery receipts; keep customer routing disabled until end-to-end billing is proven."});
   }else push({key:"whatsapp-devices",label:"WhatsApp devices",state:"unknown",detail:"Device status query unavailable.",lastCheckedAt:checkedAt,impact:"WhatsApp route readiness unknown.",action:"Check gateway and device registry."});
   if(queues){
    const dead=Number(queues.rows[0]?.dead??0),overdue=Number(queues.rows[0]?.overdue??0);
    push({key:"webhook-queue",label:"Webhook delivery queue",state:dead>0?"critical":overdue>0?"warning":"healthy",detail:dead+" dead deliveries; "+overdue+" overdue pending deliveries.",lastCheckedAt:checkedAt,impact:"Customer webhook notifications may be delayed or lost.",action:dead+overdue>0?"Inspect failed delivery attempts and retry safely.":"Continue monitoring queue age."});
   }else push({key:"webhook-queue",label:"Webhook queue",state:"unknown",detail:"Queue query unavailable.",lastCheckedAt:checkedAt,impact:"Webhook processing cannot be confirmed.",action:"Check queue tables and scheduler."});
   if(security){
    const n=Number(security.rows[0]?.n??0);
    push({key:"security",label:"Suspicious login signals",state:n>10?"critical":n>0?"warning":"healthy",detail:n+" suspicious login events in the last 24 hours.",lastCheckedAt:checkedAt,impact:"Potential account takeover or credential-stuffing activity.",action:n>0?"Review login history, revoke suspicious sessions and apply account protections.":"Continue monitoring authentication signals."});
   }
   if(otp){
    const total=Number(otp.rows[0]?.total??0),failed=Number(otp.rows[0]?.failed??0),rate=total?failed/total:0;
    push({key:"otp-delivery",label:"Live OTP outcomes (1h)",state:rate>=0.25&&total>=4?"critical":failed>0?"warning":"healthy",detail:failed+" failed of "+total+" live OTP requests ("+(rate*100).toFixed(1)+"%).",lastCheckedAt:checkedAt,impact:"Customer verification success may be affected.",action:failed>0?"Inspect provider failures, receipts and routing before enabling more traffic.":"Continue monitoring delivery and verification outcomes."});
   }
   push({key:"private-storage",label:"Private evidence storage and scanning",state:"warning",detail:"Neon Object Storage is available, but no private bucket or application upload/download pipeline is configured; malware scanning is also absent.",lastCheckedAt:checkedAt,impact:"Transfer proof files cannot yet be accepted and served through a verified secure attachment pipeline.",action:"Configure private storage, file-type and size validation, malware scanning, signed URLs and audit logging before enabling proof uploads."});
   if(onboarding){
    const pendingEmail=Number(onboarding.rows[0]?.pending_email??0),pendingReview=Number(onboarding.rows[0]?.pending_admin_verification??0);
    push({key:"customer-onboarding",label:"Customer activation queue",state:pendingEmail+pendingReview>0?"warning":"healthy",detail:pendingEmail+" customers have not completed email verification; "+pendingReview+" organizations are not approved for live sending.",lastCheckedAt:checkedAt,impact:"Customers may register successfully but remain unable to use live OTP until email verification and administrator review are complete.",action:"Review pending signups, confirm email delivery, and approve only legitimate customer organizations."});
   }
   const transactionalEmailReady=Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM&&process.env.RESEND_WEBHOOK_SECRET);
   push({key:"transactional-email",label:"Transactional verification email",state:transactionalEmailReady?"healthy":"critical",detail:transactionalEmailReady?"Resend sender credentials and webhook secret are present in this runtime.":"One or more Resend sender settings are missing from this runtime.",lastCheckedAt:checkedAt,impact:"Registration verification and password recovery messages may fail.",action:transactionalEmailReady?"Check recent delivered/bounced events and keep the sender domain verified.":"Configure RESEND_API_KEY, EMAIL_FROM and RESEND_WEBHOOK_SECRET in the production API environment."});
   if(mail){
    const total=Number(mail.rows[0]?.total??0),verified=Number(mail.rows[0]?.verified??0);
    push({key:"mail-domains",label:"Admin Mail Center domains",state:total>0&&verified===total?"healthy":"warning",detail:verified+" verified of "+total+" mailbox-domain records configured in the admin database.",lastCheckedAt:checkedAt,impact:"The full Admin Mail Center mailbox configuration is not yet established; this is separate from transactional verification email.",action:total===verified&&total>0?"Monitor mailbox configuration.":"Complete mailbox setup and inbound/outbound routing before treating Mail Center as operational."});
   }
  }
  const counts={healthy:items.filter(x=>x.state==="healthy").length,warning:items.filter(x=>x.state==="warning").length,critical:items.filter(x=>x.state==="critical").length,unknown:items.filter(x=>x.state==="unknown").length};
  return {checkedAt,overall:counts.critical?"critical":counts.warning||counts.unknown?"warning":"healthy",counts,items};
 }
}

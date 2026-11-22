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
  push({key:"database",label:"Neon PostgreSQL",state:dbUp?"healthy":"critical",detail:dbUp?"Database connection check succeeded.":"Database ping failed.",lastCheckedAt:checkedAt,impact:dbUp?"Core data access is available.":"Authentication, wallet and OTP operations may fail.",action:dbUp?"Monitor latency and connection pool.":"Check Neon availability, DATABASE_URL and network access."});
  if(dbUp){
   const safe=async(sql:string)=>{try{return await this.db.pool.query(sql);}catch{return null;}};
   const [providers,devices,queues,security,otp,mail]=await Promise.all([
    safe(`SELECT p.key,p.channel,p.enabled,p.maintenance,h.status,h.checked_at,h.detail FROM providers p LEFT JOIN LATERAL (SELECT status,checked_at,detail FROM provider_health ph WHERE ph.provider_id=p.id ORDER BY checked_at DESC LIMIT 1) h ON true ORDER BY p.channel,p.priority`),
    safe("SELECT state,count(*)::int AS n FROM whatsapp_devices GROUP BY state"),
    safe("SELECT count(*) FILTER (WHERE status='dead')::int AS dead,count(*) FILTER (WHERE status='pending' AND next_attempt_at<=now())::int AS overdue FROM webhook_deliveries"),
    safe("SELECT count(*)::int AS n FROM login_history WHERE suspicious=true AND created_at>=now()-interval '24 hours'"),
    safe("SELECT count(*)::int AS total,count(*) FILTER (WHERE status='failed')::int AS failed FROM otp_requests WHERE created_at>=now()-interval '1 hour' AND mode='live'"),
    safe("SELECT count(*)::int AS total,count(*) FILTER (WHERE domain_verified=true)::int AS verified FROM email_configs")
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
   if(mail){
    const total=Number(mail.rows[0]?.total??0),verified=Number(mail.rows[0]?.verified??0);
    push({key:"mail-domains",label:"Email sender domains",state:total>0&&verified===total?"healthy":"warning",detail:verified+" verified of "+total+" configured sender domains.",lastCheckedAt:checkedAt,impact:"Unverified sender domains can block transactional email.",action:total===verified?"Monitor bounces and complaints.":"Verify sender DNS and provider configuration before relying on outbound email."});
   }
  }
  const counts={healthy:items.filter(x=>x.state==="healthy").length,warning:items.filter(x=>x.state==="warning").length,critical:items.filter(x=>x.state==="critical").length,unknown:items.filter(x=>x.state==="unknown").length};
  return {checkedAt,overall:counts.critical?"critical":counts.warning||counts.unknown?"warning":"healthy",counts,items};
 }
}

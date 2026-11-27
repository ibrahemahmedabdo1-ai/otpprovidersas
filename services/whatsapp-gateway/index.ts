import postgres from "postgres";
import { compressAuthPayload, decompressAuthPayload } from "./auth-compression";
import { AuthMigrationRunner } from "./auth-migration";
import makeWASocket,{Browsers,DisconnectReason,fetchLatestBaileysVersion,initAuthCreds,proto,BufferJSON} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { classifyTestSendFailure, isNoOpenSession, isUuid, type TestSendStage } from "./test-send-rules";
import { baileysReceiptRecipient, isOutgoingBaileysMessageKey, mapBaileysMessageStatus, mapBaileysReceiptTimestamps, receiptCorrelationLockKey } from "./receipt-rules";
const E=Bun.env, TOKEN=E.GATEWAY_TOKEN||"", PAIR=E.PAIRING_VIEW_KEY||"", ENC=E.SESSION_ENCRYPTION_KEY||"";
if(!/^[a-f0-9]{64}$/i.test(ENC)) throw new Error("SESSION_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters");
if(!E.DATABASE_URL||TOKEN.length<24||PAIR.length<24) throw new Error("Gateway configuration missing");
const sql=postgres(E.DATABASE_URL,{max:8,idle_timeout:20,connect_timeout:15,ssl:"require"});
const owner=await sql.reserve();
const lease=await owner`SELECT pg_try_advisory_lock(hashtext('otpprovider:whatsapp-gateway:singleton:v2')) AS acquired`;
let ownsLock=!!lease[0]?.acquired, initialized=false, providerId="";
const encKey=await crypto.subtle.importKey("raw",new Uint8Array(Buffer.from(ENC,"hex")),{name:"AES-GCM"},false,["encrypt","decrypt"]);
async function encryptJsonText(text:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=compressAuthPayload(text);const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},encKey,data);return "enc:v2:"+Buffer.from(iv).toString("base64")+":"+Buffer.from(new Uint8Array(encrypted)).toString("base64");}
async function encryptJson(v:any){return encryptJsonText(JSON.stringify(v,BufferJSON.replacer));}
function normalizeEncryptedJson(v:any){if(typeof v!=="string")return "";let normalized=v;const q=String.fromCharCode(34);if(normalized.startsWith(q+"enc:v")&&normalized.endsWith(q)){try{normalized=JSON.parse(normalized);}catch{}}return normalized;}
async function decryptJson(v:any){if(typeof v==="string"){const normalized=normalizeEncryptedJson(v);if(normalized.startsWith("enc:v1:")||normalized.startsWith("enc:v2:")){const parts=normalized.split(":");if(parts.length!==4)throw new Error("encrypted_session_invalid");const iv=new Uint8Array(Buffer.from(parts[2],"base64"));const data=new Uint8Array(Buffer.from(parts[3],"base64"));const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},encKey,data);const decoded=normalized.startsWith("enc:v2:")?decompressAuthPayload(new Uint8Array(plain)):new TextDecoder().decode(plain);return JSON.parse(decoded,BufferJSON.reviver);}return decodeJson(normalized);}return decodeJson(v);}
function isCompressedEncryptedJson(v:any){return normalizeEncryptedJson(v).startsWith("enc:v2:");}
// Compare-and-swap on the stored text. The old code compared against JSON.stringify(row.v)::jsonb, which the driver encodes a second time, so it could never equal the stored value.
async function casReplaceKv(k:string,expected:any,next:string){
 const nextJson=JSON.stringify(next);
 const r=typeof expected==="string"
  ?await sql`UPDATE wa_gateway_kv SET v=${nextJson}::jsonb,updated_at=now() WHERE k=${k} AND v #>> '{}' = ${expected} RETURNING k`
  :await sql`UPDATE wa_gateway_kv SET v=${nextJson}::jsonb,updated_at=now() WHERE k=${k} AND v::text = ${JSON.stringify(expected)} RETURNING k`;
 return r.length>0;
}
const authMigration=new AuthMigrationRunner({
 async pickCandidate(excluded){
  const device=await sql`SELECT id FROM wa_gateway_devices ORDER BY created_at LIMIT 1`;
  if(!device.length)return null;
  const id=String(device[0].id);
  const rows=await sql`SELECT k,v FROM wa_gateway_kv WHERE k LIKE ${id+":%"} AND k <> ALL(${excluded}::text[]) AND (v #>> '{}' LIKE 'enc:v1:%' OR v #>> '{}' LIKE '"enc:v1:%') ORDER BY pg_column_size(v) ASC LIMIT 1`;
  return rows.length?{k:String(rows[0].k),v:rows[0].v}:null;
 },
 decrypt:decryptJson,
 encrypt:encryptJson,
 compareAndSwap:casReplaceKv,
 canonical:(v:any)=>JSON.stringify(v,BufferJSON.replacer),
},(event,data)=>(event.endsWith("FAILED")||event.endsWith("QUARANTINED")?console.error:console.log)(event,JSON.stringify(data)));
async function migrateOneLegacyAuthValue(){
 if(!initialized||!ownsLock){console.log("AUTH_COMPRESSION_SKIPPED_NOT_READY",JSON.stringify({initialized,ownsLock}));return;}
 await authMigration.runOnce();
}
const inflightDeliveries=new Set<string>();
const sockets=new Map<string,any>(), live=new Map<string,any>(), timers=new Map<string,any>(), starts=new Map<string,Promise<any>>();
const allowed=(E.WA_TEST_RECIPIENTS||"").split(",").map(x=>x.replace(/\D/g,"")).filter(Boolean);
await sql`CREATE TABLE IF NOT EXISTS wa_gateway_devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),label text NOT NULL,state text NOT NULL DEFAULT 'disconnected',creds jsonb,qr_data_url text,last_activity_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS wa_message_receipts(id bigserial PRIMARY KEY,device_id uuid NOT NULL,message_id text NOT NULL,status text NOT NULL CHECK (status IN ('accepted','pending','server_ack','delivered','read','played','error')),recipient_hash text,otp_delivery_id uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(device_id,message_id,status))`;
await sql`ALTER TABLE wa_message_receipts ADD COLUMN IF NOT EXISTS otp_delivery_id uuid`;
await sql`CREATE INDEX IF NOT EXISTS wa_message_receipts_msg_idx ON wa_message_receipts(message_id)`;
await sql`CREATE INDEX IF NOT EXISTS wa_message_receipts_delivery_status_idx ON wa_message_receipts(otp_delivery_id,status,created_at) WHERE otp_delivery_id IS NOT NULL`;
await sql`CREATE TABLE IF NOT EXISTS wa_gateway_kv(k text PRIMARY KEY,v jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`;
function decodeJson(v:any):any{
 if(v==null)return v;
 const parsed=typeof v==="string"?JSON.parse(v):v;
 const revive=(x:any):any=>{
  if(x&&typeof x==="object"&&x.type==="Buffer"){
   if(typeof x.data==="string")return Buffer.from(x.data,"base64");
   if(Array.isArray(x.data))return Buffer.from(x.data);
  }
  if(Array.isArray(x))return x.map(revive);
  if(x&&typeof x==="object"){const out:any={};for(const [k,val] of Object.entries(x))out[k]=revive(val);return out;}
  return x;
 };
 return revive(parsed);
}
function encodeJson(v:any):any{return JSON.parse(JSON.stringify(v,BufferJSON.replacer));}
let devs:any[]=[];
async function initGateway(){
let devs=await sql`SELECT id FROM wa_gateway_devices ORDER BY created_at`;
let provider=await sql`SELECT id FROM providers WHERE key='whatsapp_linked_device' LIMIT 1`;
if(!provider.length)provider=await sql`INSERT INTO providers(key,channel,kind,enabled,maintenance,priority,weight,config) VALUES('whatsapp_linked_device','whatsapp','PERSONAL_LINKED_DEVICE',false,false,100,0,'{"customer_sending_enabled":false,"delivery_receipts":"not_available"}'::jsonb) RETURNING id`;
providerId=String(provider[0].id);
// A job left in "sending" by a previous process may or may not have been transmitted: never resend, mark unknown.
await sql`UPDATE wa_admin_test_jobs SET status='unknown',error_code='gateway_restarted',updated_at=now() WHERE status='sending'`.catch(()=>console.warn("TEST_JOB_RECOVERY_SKIPPED"));
for(const d of devs){
 const old=await sql`SELECT label,creds FROM wa_gateway_devices WHERE id=${d.id}::uuid`;
 await sql`INSERT INTO whatsapp_devices(id,provider_id,label,state,routing_eligible) VALUES(${d.id}::uuid,${providerId}::uuid,${old[0]?.label||"WhatsApp Main"},'disconnected',false) ON CONFLICT(id) DO NOTHING`;
 if(old[0]?.creds){const raw=old[0].creds;const normalized=await decryptJson(raw);if(!isCompressedEncryptedJson(raw))await sql`UPDATE wa_gateway_devices SET creds=${JSON.stringify(await encryptJson(normalized))}::jsonb WHERE id=${d.id}::uuid`;}
 const legacyKeys=await sql`SELECT k FROM wa_gateway_kv WHERE k LIKE ${String(d.id)+":%"} AND (jsonb_typeof(v) <> 'string' OR (v #>> '{}' NOT LIKE 'enc:v1:%' AND v #>> '{}' NOT LIKE 'enc:v2:%' AND v #>> '{}' NOT LIKE '"enc:v1:%' AND v #>> '{}' NOT LIKE '"enc:v2:%')) ORDER BY k`;
 for(const item of legacyKeys){
  const legacy=await sql`SELECT v FROM wa_gateway_kv WHERE k=${item.k}`;
  if(!legacy.length)continue;
  const raw=legacy[0].v;
  const serialized=typeof raw==="string"?raw:JSON.stringify(raw,BufferJSON.replacer);
  const encrypted=await encryptJsonText(serialized);
  await sql`UPDATE wa_gateway_kv SET v=${JSON.stringify(encrypted)}::jsonb,updated_at=now() WHERE k=${item.k}`;
 }
}
if(!devs.length){
 const old=await sql`SELECT creds FROM wa_gateway_state WHERE id=1`.catch(()=>[]);
 const oldCreds=old[0]?.creds?decodeJson(old[0].creds):null;
 const d=await sql`INSERT INTO wa_gateway_devices(label,creds) VALUES('WhatsApp Main',${oldCreds?JSON.stringify(await encryptJson(oldCreds)):null}::jsonb) RETURNING id`;
 await sql`INSERT INTO wa_gateway_kv(k,v) SELECT ${String(d[0].id)}||':'||k,v FROM wa_gateway_kv ON CONFLICT(k) DO NOTHING`.catch(()=>{});
 devs= d;
}

 for(const d of devs)start(String(d.id)).catch((err:any)=>console.error("DEVICE_START_FAILED",JSON.stringify({name:err?.name,code:err?.code,message:String(err?.message||"unknown").slice(0,160)})));
}
function json(x:any,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function auth(r:Request){const h=r.headers.get("authorization")||"";if(!h.startsWith("Bearer "))return false;const a=new TextEncoder().encode(h.slice(7)),b=new TextEncoder().encode(TOKEN);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0}
async function authState(id:string){
 const rows=await sql`SELECT creds FROM wa_gateway_devices WHERE id=${id}::uuid`;
 let creds=rows[0]?.creds?await decryptJson(rows[0].creds):null;
 const valid=(v:any)=>Buffer.isBuffer(v)||v instanceof Uint8Array;
 if(!creds||!valid(creds.noiseKey?.private)||!valid(creds.noiseKey?.public)||!valid(creds.signedIdentityKey?.private)||!valid(creds.signedIdentityKey?.public)){
  console.log("AUTH_CREDS_REINITIALIZED",JSON.stringify({hadCreds:!!creds,noisePrivate:valid(creds?.noiseKey?.private),noisePublic:valid(creds?.noiseKey?.public),identityPrivate:valid(creds?.signedIdentityKey?.private),identityPublic:valid(creds?.signedIdentityKey?.public)}));
  creds=initAuthCreds();
  await sql`UPDATE wa_gateway_devices SET creds=${JSON.stringify(await encryptJson(creds))}::jsonb WHERE id=${id}::uuid`;
 }
 const keys={
  async get(type:string,ids:string[]){if(!ids.length)return{};const names=ids.map(k=>id+":"+type+":"+k);const rs=await sql`SELECT k,v FROM wa_gateway_kv WHERE k=ANY(${names}::text[])`;const out:any={};for(const r of rs){const key=String(r.k).slice((id+":"+type+":").length);let v=await decryptJson(r.v);if(!isCompressedEncryptedJson(r.v))await casReplaceKv(String(r.k),r.v,await encryptJson(v));if(type==="app-state-sync-key"&&v)v=proto.Message.AppStateSyncKeyData.create(v);out[key]=v;}return out},
  async set(data:any){await sql.begin(async tx=>{for(const [type,entries] of Object.entries(data) as any)for(const [k,v] of Object.entries(entries) as any){const key=id+":"+type+":"+k;if(v==null)await tx`DELETE FROM wa_gateway_kv WHERE k=${key}`;else await tx`INSERT INTO wa_gateway_kv(k,v,updated_at) VALUES(${key},${JSON.stringify(await encryptJson(v))}::jsonb,now()) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v,updated_at=now()`;}})}
 };
 let saveQueue=Promise.resolve();
 const save=async()=>{
  const snapshot=await encryptJson(creds);
  saveQueue=saveQueue.catch(()=>{}).then(()=>sql`UPDATE wa_gateway_devices SET creds=${JSON.stringify(snapshot)}::jsonb,last_activity_at=now() WHERE id=${id}::uuid`);
  return saveQueue;
 };
 return {state:{creds,keys},save};
}
const generations=new Map<string,symbol>();
async function start(id:string){
 if(starts.has(id))return starts.get(id);
 const task=(async()=>{
 const token=Symbol(id);
 generations.set(id,token);
 const pending=timers.get(id);if(pending){clearTimeout(pending);timers.delete(id);}
 const old=sockets.get(id);if(old){try{old.end(undefined)}catch{}}
 let row=await sql`SELECT id FROM wa_gateway_devices WHERE id=${id}::uuid`;
 if(!row.length){const platform=await sql`SELECT label FROM whatsapp_devices WHERE id=${id}::uuid`;if(platform.length){await sql`INSERT INTO wa_gateway_devices(id,label) VALUES(${id}::uuid,${platform[0].label}) ON CONFLICT(id) DO NOTHING`;row=await sql`SELECT id FROM wa_gateway_devices WHERE id=${id}::uuid`;}}
 if(!row.length||generations.get(id)!==token)throw Error("device_not_found_or_superseded");
 await sql`UPDATE wa_gateway_devices SET state='starting',qr_data_url=NULL,last_error=NULL WHERE id=${id}::uuid`;
 const a=await authState(id);
 const {version}=await fetchLatestBaileysVersion();
 if(generations.get(id)!==token)return {ok:true,state:"superseded"};
 const safeLogger:any={level:"silent",trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this}};
  const sock=makeWASocket({version,auth:a.state,browser:Browsers.ubuntu("OTPProvider"),logger:safeLogger,printQRInTerminal:false,connectTimeoutMs:30000,defaultQueryTimeoutMs:30000,markOnlineOnConnect:false,syncFullHistory:false,keepAliveIntervalMs:20000});
 sockets.set(id,sock);
 sock.ev.on("creds.update",(update:any)=>{
  if(generations.get(id)!==token)return;
  if(update&&typeof update==="object")Object.assign(a.state.creds,update);
  a.save().catch((err:any)=>{console.error("AUTH_PERSIST_FAILED");if(generations.get(id)===token)live.set(id,{state:"error",qr:null,error:"auth_persist_failed"});});
 });
 sock.ev.on("messages.update",(items:any[])=>{
  if(generations.get(id)!==token)return;
  for(const it of items||[]){
   if(!isOutgoingBaileysMessageKey(it?.key))continue;
   const status=mapBaileysMessageStatus(it?.update?.status);
   if(status)void recordReceipt(id,it.key.id,status,baileysReceiptRecipient(it.key)).catch(()=>console.error("RECEIPT_PERSIST_FAILED"));
  }
 });
 sock.ev.on("message-receipt.update",(items:any[])=>{
  if(generations.get(id)!==token)return;
  for(const it of items||[]){
   if(!isOutgoingBaileysMessageKey(it?.key))continue;
   for(const status of mapBaileysReceiptTimestamps(it?.receipt)){
    void recordReceipt(id,it.key.id,status,baileysReceiptRecipient(it.key)).catch(()=>console.error("RECEIPT_PERSIST_FAILED"));
   }
  }
 });
 sock.ev.on("connection.update",async(u:any)=>{
  if(generations.get(id)!==token||sockets.get(id)!==sock)return;
  try{
   if(u.qr){
    const q=await QRCode.toDataURL(u.qr,{width:320,margin:2});
    if(generations.get(id)!==token)return;
    live.set(id,{state:"pairing",qr:q});
    await sql`UPDATE wa_gateway_devices SET state='pairing',qr_data_url=${q},last_activity_at=now(),last_error=NULL WHERE id=${id}::uuid`;
    await sql`UPDATE whatsapp_devices SET state='pairing',routing_eligible=false,last_activity_at=now(),last_error=NULL,updated_at=now() WHERE id=${id}::uuid`;
   }
   if(u.connection==="open"){
    await a.save();
    if(generations.get(id)!==token)return;
    live.set(id,{state:"connected",qr:null});
    await sql`UPDATE wa_gateway_devices SET state='connected',qr_data_url=NULL,last_activity_at=now(),last_error=NULL WHERE id=${id}::uuid`;
    await sql`UPDATE whatsapp_devices SET state='connected',routing_eligible=false,last_activity_at=now(),last_error=NULL,updated_at=now() WHERE id=${id}::uuid`;
   }
   if(u.connection==="close"){
    // Save the credentials produced by QR pairing before reconnecting. Baileys
    // may close with restartRequired immediately after the phone accepts the QR.
    await a.save();
    if(generations.get(id)!==token||sockets.get(id)!==sock)return;
    const code=u.lastDisconnect?.error?.output?.statusCode;
    const st=code===DisconnectReason.loggedOut?"logged_out":"disconnected";
    live.set(id,{state:st,qr:null});
    await sql`UPDATE wa_gateway_devices SET state=${st},qr_data_url=NULL,last_activity_at=now(),last_error=${String(code||"connection_closed")} WHERE id=${id}::uuid`;
    await sql`UPDATE whatsapp_devices SET state=${st==="logged_out"?"error":"disconnected"},routing_eligible=false,last_activity_at=now(),last_error=${String(code||"connection_closed")},updated_at=now() WHERE id=${id}::uuid`;
    if(code!==DisconnectReason.loggedOut && code!==DisconnectReason.connectionReplaced){
     const t=setTimeout(()=>{
      if(generations.get(id)===token&&sockets.get(id)===sock)start(id).catch(()=>{});
     },code===DisconnectReason.restartRequired?1000:5000);
     timers.set(id,t);
    }
   }
  }catch(err:any){
   console.error("CONNECTION_STATE_UPDATE_FAILED");
   if(generations.get(id)===token&&sockets.get(id)===sock){
    const reason=String(err?.message||"connection_state_update_failed").slice(0,240);
    live.set(id,{state:"error",qr:null,error:reason});
    await sql`UPDATE wa_gateway_devices SET state='error',last_error=${reason} WHERE id=${id}::uuid`.catch(()=>{});
    await sql`UPDATE whatsapp_devices SET state='error',routing_eligible=false,last_error=${reason},updated_at=now() WHERE id=${id}::uuid`.catch(()=>{});
   }
  }
 });
 return {ok:true,state:"starting"};
 })();
 starts.set(id,task);
 try{return await task;}finally{if(starts.get(id)===task)starts.delete(id);}
}

async function finishTestJob(jobId:string,status:string,messageId:string|null,error:string|null){
 // Only a job still "sending" may be finished, so a late writer can never overwrite a newer state.
 await sql`UPDATE wa_admin_test_jobs SET status=${status},message_id=${messageId},error_code=${error},updated_at=now() WHERE id=${jobId}::uuid AND status='sending'`;
}
/** Runs in the background after the HTTP request has already been answered. Never logs numbers or message text. */
async function runAdminTestSend(jobId:string,id:string,s:any,to:string,msg:string){
 let stage:TestSendStage="lookup";
 try{
  const pnJid=to+"@s.whatsapp.net";
  let recipientJid=pnJid;
  const lookup=await s.onWhatsApp(to);
  if(!Array.isArray(lookup)||!lookup.some((item:any)=>item?.exists)){await finishTestJob(jobId,"failed",null,"recipient_not_registered_on_whatsapp");return;}
  const mapped=await s.signalRepository.lidMapping.getLIDForPN(pnJid).catch(()=>undefined);
  if(typeof mapped==="string"&&mapped.endsWith("@lid"))recipientJid=mapped;
  stage="send";
  let r:any;
  try{r=await s.sendMessage(recipientJid,{text:msg});}
  catch(err:any){
   if(!isNoOpenSession(err))throw err;
   // Nothing was transmitted: refresh only this recipient's Signal session once, then retry once.
   stage="session_refresh";
   const m=await s.signalRepository.lidMapping.getLIDForPN(pnJid).catch(()=>undefined);
   await s.signalRepository.deleteSession([...new Set([pnJid,recipientJid,...(typeof m==="string"?[m]:[])])]);
   console.warn("WHATSAPP_RECIPIENT_SIGNAL_SESSION_REFRESHED");
   stage="send_after_refresh";
   r=await s.sendMessage(typeof m==="string"?m:recipientJid,{text:msg});
  }
  const messageId=String(r?.key?.id||"");
  if(!messageId){await finishTestJob(jobId,"unknown",null,"provider_message_id_missing");return;}
  await recordReceipt(id,messageId,"accepted",to).catch(()=>console.error("RECEIPT_PERSIST_FAILED"));
  await finishTestJob(jobId,"accepted",messageId,null);
 }catch{
  const outcome=classifyTestSendFailure(stage);
  console.error("WHATSAPP_TEST_JOB_FAILED",JSON.stringify({stage,status:outcome.status}));
  await finishTestJob(jobId,outcome.status,null,outcome.error).catch(()=>console.error("WHATSAPP_TEST_JOB_STATE_WRITE_FAILED"));
 }
}
async function recordReceipt(deviceId:string,messageId:string,status:string,to?:string,deliveryId?:string){
 if(!messageId||!status)return;
 const h=to?new Bun.CryptoHasher("sha256").update(to).digest("hex").slice(0,16):null;
 // Serialize receipt persistence per (device, message) so accepted and delivery events cannot race.
 const lockKey=receiptCorrelationLockKey(deviceId,messageId);
 await sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
  const prior=deliveryId?[]:await tx`SELECT otp_delivery_id FROM wa_message_receipts WHERE device_id=${deviceId}::uuid AND message_id=${messageId} AND otp_delivery_id IS NOT NULL ORDER BY id LIMIT 1`;
  const linked=deliveryId||prior[0]?.otp_delivery_id||null;
  await tx`INSERT INTO wa_message_receipts(device_id,message_id,status,recipient_hash,otp_delivery_id) VALUES(${deviceId}::uuid,${messageId},${status},${h},${linked}::uuid) ON CONFLICT(device_id,message_id,status) DO UPDATE SET otp_delivery_id=COALESCE(wa_message_receipts.otp_delivery_id,EXCLUDED.otp_delivery_id)`;
  if(deliveryId)await tx`UPDATE wa_message_receipts SET otp_delivery_id=${deliveryId}::uuid WHERE device_id=${deviceId}::uuid AND message_id=${messageId} AND otp_delivery_id IS NULL`;
 });
}
const server=Bun.serve({hostname:"0.0.0.0",port:Number(E.PORT||8080),async fetch(req){
 const u=new URL(req.url),p=u.pathname,base="/pair/"+PAIR;
 if(req.method==="GET"&&(p==="/"||p==="/health")){let database="ok";try{await sql.unsafe("SELECT 1")}catch{database="error"}const ready=initialized&&ownsLock&&database==="ok";return json({ok:database==="ok",service:"otp-whatsapp-gateway",devices:sockets.size,ready,initialized,lock:ownsLock,database,apiTick:{status:lastOtpTickStatus,lastAt:lastOtpTickAt}},database==="ok"?200:503)}
 if(!ownsLock||!initialized)return json({error:"gateway_initializing"},503);
 if(req.method==="GET"&&p===base){const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>OTPProvider WhatsApp</title></head><body style="font:16px system-ui;max-width:520px;margin:30px auto;padding:20px;text-align:center"><h2>WhatsApp linked devices</h2><select id="d"></select><p id="s">Loadingâ¦</p><img id="q" style="width:320px;max-width:100%" hidden><p>WhatsApp â Linked devices â Link a device</p><script>async function tick(){let a=await fetch(location.pathname+"/devices").then(r=>r.json()),d=document.querySelector("#d"),v=d.value;d.innerHTML=a.map(x=>"<option value=\\""+x.id+"\\">"+x.label+"</option>").join("");if(v)d.value=v;if(!d.value)return;let q=await fetch(location.pathname+"/qr?deviceId="+d.value).then(r=>r.json());const reasons={"515":"WhatsApp restarted the pairing session; reconnect and scan the new QR","401":"WhatsApp rejected the session; remove the linked device from the phone and retry","440":"WhatsApp replaced this session; remove the old OTPProvider linked device from the phone, then reconnect and scan a fresh QR","408":"Pairing timed out; refresh and scan a fresh QR","428":"Connection closed before pairing completed","429":"WhatsApp rate-limited pairing; wait before retrying","auth_persist_failed":"Could not save WhatsApp login credentials to the database","connection_state_update_failed":"Could not save the connection state","logged_out":"WhatsApp logged this device out"};document.querySelector("#s").textContent=q.state+(q.error?" â "+(reasons[q.error]||("Reason: "+q.error)):"");let im=document.querySelector("#q");im.hidden=!q.qr;if(q.qr)im.src=q.qr}document.querySelector("#d").onchange=tick;tick();setInterval(tick,10000)</script></body></html>';return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}})}
 if(p.startsWith(base+"/")){
  if(req.method==="GET"&&p===base+"/devices")return json(await sql`SELECT id,label,state FROM wa_gateway_devices ORDER BY created_at`);
  if(req.method==="GET"&&p===base+"/qr"){const id=u.searchParams.get("deviceId")||"";const cached=live.get(id);if(cached)return json({state:cached.state,qr:cached.qr||null,error:cached.error||null,lastActivityAt:null});const r=await sql`SELECT state,qr_data_url,last_error,last_activity_at FROM wa_gateway_devices WHERE id=${id}::uuid`.catch(()=>[]);return r.length?json({state:r[0].state,qr:r[0].qr_data_url,error:r[0].last_error,lastActivityAt:r[0].last_activity_at}):json({error:"not_found"},404)}
  if(req.method==="GET"&&p===base+"/qr.png"){const id=u.searchParams.get("deviceId")||"";const r=await sql`SELECT state,qr_data_url FROM wa_gateway_devices WHERE id=${id}::uuid`.catch(()=>[]);if(!r.length)return json({error:"not_found"},404);const data=String(r[0].qr_data_url||"");if(r[0].state!=="pairing"||!data.startsWith("data:image/png;base64,"))return json({error:"qr_not_available",state:r[0].state},409);const bytes=Buffer.from(data.slice("data:image/png;base64,".length),"base64");return new Response(bytes,{headers:{"content-type":"image/png","cache-control":"no-store, no-cache, must-revalidate","x-content-type-options":"nosniff","content-length":String(bytes.length)}})}
 }
 if(!auth(req))return json({error:"unauthorized"},401);
 if(req.method==="GET"&&p==="/admin/receipts"){const mid=String(u.searchParams.get("messageId")||"");if(!/^[A-Za-z0-9]{8,64}$/.test(mid))return json({error:"invalid_message_id"},400);return json(await sql`SELECT status,created_at FROM wa_message_receipts WHERE message_id=${mid} ORDER BY id`)}
 if(req.method==="GET"&&p==="/admin/devices")return json(await sql`SELECT id,label,state,routing_eligible,priority,last_activity_at,last_error,created_at FROM whatsapp_devices WHERE provider_id=${providerId}::uuid ORDER BY created_at`);
 if(req.method==="POST"&&p==="/admin/devices"){const b=await req.json().catch(()=>({})),label=String(b.label||"").trim();if(label.length<2||label.length>80)return json({error:"invalid_label"},400);const d=await sql`INSERT INTO wa_gateway_devices(label) VALUES(${label}) RETURNING id,label,state,created_at`;await sql`INSERT INTO whatsapp_devices(id,provider_id,label,state,routing_eligible) VALUES(${d[0].id}::uuid,${providerId}::uuid,${label},'disconnected',false) ON CONFLICT(id) DO NOTHING`;await start(String(d[0].id));return json(d[0],201)}
 const m=p.match(/^\/admin\/devices\/([0-9a-f-]{36})(?:\/(qr|reconnect))?$/i);
 if(m){const id=m[1];if(req.method==="GET"&&m[2]==="qr"){const r=await sql`SELECT state,qr_data_url FROM wa_gateway_devices WHERE id=${id}::uuid`;return r.length?json({state:r[0].state,qr:r[0].qr_data_url}):json({error:"not_found"},404)}
 if(req.method==="POST"&&m[2]==="reconnect"){await start(id);return json({ok:true,state:"starting"},202)}
 if(req.method==="PATCH"&&!m[2]){const b=await req.json().catch(()=>({})),label=String(b.label||"").trim();if(label.length<2||label.length>80)return json({error:"invalid_label"},400);const changed=await sql`UPDATE wa_gateway_devices SET label=${label} WHERE id=${id}::uuid RETURNING id,label,state`;if(!changed.length)return json({error:"not_found"},404);await sql`UPDATE whatsapp_devices SET label=${label},updated_at=now() WHERE id=${id}::uuid`;return json(changed[0])}
 if(req.method==="DELETE"&&!m[2]){const s=sockets.get(id);if(s){try{await s.logout()}catch{}try{s.end(undefined)}catch{}}sockets.delete(id);live.delete(id);if(timers.has(id))clearTimeout(timers.get(id));await sql`DELETE FROM wa_gateway_kv WHERE k LIKE ${id+":%"}`;await sql`DELETE FROM wa_gateway_devices WHERE id=${id}::uuid`;await sql`DELETE FROM whatsapp_devices WHERE id=${id}::uuid`;return json({ok:true})}}
 if(req.method==="POST"&&p==="/admin/test-send"){
  if(E.WA_ADMIN_TEST_SEND_ENABLED!=="true")return json({error:"admin_test_sending_disabled"},423);
  const b=await req.json().catch(()=>({})),to=String(b.to||"").replace(/\D/g,""),id=String(b.deviceId||""),msg=String(b.message||"").trim(),jobId=String(b.jobId||""),s=sockets.get(id);
  if(!isUuid(jobId))return json({error:"invalid_job_id"},400);
  if(!allowed.includes(to)||to.length<8||to.length>15||!msg||msg.length>500)return json({error:"recipient_not_allowlisted_or_invalid"},400);
  if(!s||live.get(id)?.state!=="connected")return json({error:"device_not_connected"},503);
  // Exactly-once claim: only a queued job for this device can start sending, so a replay never sends twice.
  const claimed=await sql`UPDATE wa_admin_test_jobs SET status='sending',updated_at=now() WHERE id=${jobId}::uuid AND device_id=${id}::uuid AND status='queued' RETURNING id`;
  if(!claimed.length){
   const current=await sql`SELECT status FROM wa_admin_test_jobs WHERE id=${jobId}::uuid`;
   return current.length?json({jobId,status:current[0].status,duplicate:true},200):json({error:"job_not_found"},404);
  }
  void runAdminTestSend(jobId,id,s,to,msg);
  return json({jobId,status:"sending"},202);
 }
 if(req.method==="POST"&&p==="/v1/send"){
  if(E.WA_CUSTOMER_SEND_ENABLED!=="true")return json({error:"customer_sending_disabled"},423);
  const b=await req.json().catch(()=>({}));
  const to=String(b.to||"").replace(/\D/g,""),id=String(b.deviceId||""),deliveryId=String(b.deliveryId||""),requestId=String(b.requestId||""),msg=String(b.message||"").trim();
  if(!/^\d{8,15}$/.test(to)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryId)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)||!msg||msg.length>500)return json({error:"invalid_request"},400);
  const eligible=await sql`SELECT d.id FROM whatsapp_devices d JOIN otp_deliveries od ON od.id=${deliveryId}::uuid JOIN otp_requests r ON r.id=od.otp_request_id WHERE d.id=${id}::uuid AND d.provider_id=${providerId}::uuid AND od.provider_id=${providerId}::uuid AND d.state='connected' AND d.routing_eligible=true AND r.id=${requestId}::uuid AND r.channel='whatsapp' AND od.status IN ('queued','unknown') LIMIT 1`;
  if(!eligible.length)return json({error:"delivery_or_device_not_eligible"},409);
  const s=sockets.get(id);
  if(!s||live.get(id)?.state!=="connected")return json({error:"device_not_connected"},503);
  // One WhatsApp submission per delivery: refuse if one is in flight or a receipt already exists. 503 (not 4xx) so the API
  // keeps the delivery "unknown" and waits for receipts instead of releasing funds for a message that may have been sent.
  if(inflightDeliveries.has(deliveryId))return json({error:"delivery_already_submitted"},503);
  const prior=await sql`SELECT 1 FROM wa_message_receipts WHERE otp_delivery_id=${deliveryId}::uuid LIMIT 1`;
  if(prior.length)return json({error:"delivery_already_submitted"},503);
  inflightDeliveries.add(deliveryId);
  try{
  const pnJid=to+"@s.whatsapp.net";
  let recipientJid=pnJid;
  try{
   const lookup=await s.onWhatsApp(to);
   if(!Array.isArray(lookup)||!lookup.some((item:any)=>item?.exists))return json({error:"recipient_not_registered_on_whatsapp"},422);
   const mapped=await s.signalRepository.lidMapping.getLIDForPN(pnJid).catch(()=>undefined);
   if(typeof mapped==="string"&&mapped.endsWith("@lid"))recipientJid=mapped;
  }catch(err:any){console.error("WHATSAPP_CUSTOMER_RECIPIENT_LOOKUP_FAILED");return json({error:"recipient_lookup_failed"},502);}
  let sent:any;
  try{sent=await s.sendMessage(recipientJid,{text:msg});}
  catch(err:any){console.error("WHATSAPP_CUSTOMER_SEND_FAILED");return json({error:"whatsapp_send_failed"},502);}
  const messageId=String(sent?.key?.id||"");
  if(!messageId)return json({error:"provider_message_id_missing"},502);
  await recordReceipt(id,messageId,"accepted",to,deliveryId);
  return json({accepted:true,messageId,note:"Accepted by WhatsApp; awaiting explicit delivery receipt."},202);
  }finally{inflightDeliveries.delete(deliveryId);}
 }
 return json({error:"not_found"},404);
}});
console.log("OTPProvider WhatsApp gateway listening on",server.port);
const OTP_API_BASE_URL=(E.OTP_API_BASE_URL||"").replace(/\/+$/,"");
const OTP_CRON_SECRET=E.OTP_CRON_SECRET||"";
let otpTickInFlight=false,lastOtpTickStatus="not_run",lastOtpTickAt:number|null=null;
async function runOtpBackgroundTick(){
 if(!OTP_API_BASE_URL||OTP_CRON_SECRET.length<24){console.error("OTP_BACKGROUND_RUN_CONFIG_MISSING");return;}
 if(otpTickInFlight)return;
 otpTickInFlight=true;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),50000);
 try{
  const response=await fetch(OTP_API_BASE_URL+"/v1/internal/tick",{
   method:"POST",
   headers:{"content-type":"application/json","x-cron-secret":OTP_CRON_SECRET},
   body:"{}",
   signal:controller.signal
  });
  if(!response.ok){lastOtpTickStatus=`http_${response.status}`;console.error("OTP_BACKGROUND_RUN_FAILED",JSON.stringify({status:response.status}));}
  else{lastOtpTickStatus="ok";console.log("OTP_BACKGROUND_RUN_OK");}
 }catch{
  lastOtpTickStatus="request_error";
  console.error("OTP_BACKGROUND_RUN_FAILED",JSON.stringify({reason:"request_error"}));
 }finally{
  lastOtpTickAt=Date.now();
  clearTimeout(timeout);
  otpTickInFlight=false;
 }
}
setTimeout(()=>void runOtpBackgroundTick(),15000);
setInterval(()=>void runOtpBackgroundTick(),60000);
setTimeout(()=>void migrateOneLegacyAuthValue(),45000);
setInterval(()=>void migrateOneLegacyAuthValue(),300000);

let lockBusyLogged=false;
async function acquireAndInit(){
 if(!ownsLock){
  const result=await owner`SELECT pg_try_advisory_lock(hashtext('otpprovider:whatsapp-gateway:singleton:v2')) AS acquired`;
  if(!result[0]?.acquired){if(!lockBusyLogged){console.warn("GATEWAY_LOCK_BUSY");lockBusyLogged=true;}setTimeout(()=>acquireAndInit().catch((err:any)=>console.error("GATEWAY_LOCK_RETRY_FAILED",String(err?.message||"unknown").slice(0,160))),5000);return;}
  ownsLock=true;lockBusyLogged=false;console.log("GATEWAY_LOCK_ACQUIRED");
 }
 try{console.log("GATEWAY_INIT_START");await initGateway();initialized=true;console.log("GATEWAY_INIT_COMPLETE");void migrateOneLegacyAuthValue();}
 catch(err:any){console.error("GATEWAY_INIT_FAILED",JSON.stringify({name:err?.name,code:err?.code,message:String(err?.message||"unknown").slice(0,180)}));setTimeout(()=>acquireAndInit().catch(()=>{}),5000);}
}
acquireAndInit().catch((err:any)=>console.error("GATEWAY_INIT_FAILED"));
process.on("SIGTERM",async()=>{for(const sock of sockets.values())try{sock.end(undefined)}catch{};try{if(ownsLock)await owner`SELECT pg_advisory_unlock(hashtext('otpprovider:whatsapp-gateway:singleton:v2'))`;}catch{}try{owner.release()}catch{}await sql.end();process.exit(0);});
import http from "node:http";
import crypto from "node:crypto";
import { Pool } from "pg";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, { Browsers, DisconnectReason, initAuthCreds } from "@whiskeysockets/baileys";

const {
  DATABASE_URL, GATEWAY_TOKEN, PAIRING_VIEW_KEY, SESSION_ENCRYPTION_KEY,
  WA_CUSTOMER_SEND_ENABLED = "false", WA_ADMIN_TEST_SEND_ENABLED = "false",
  WA_TEST_RECIPIENTS = "", PORT = "8080"
} = process.env;
if (!DATABASE_URL || !GATEWAY_TOKEN || !PAIRING_VIEW_KEY || !SESSION_ENCRYPTION_KEY) {
  throw new Error("Missing required gateway environment configuration");
}
if (!/^[a-f0-9]{64}$/i.test(SESSION_ENCRYPTION_KEY)) throw new Error("SESSION_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters");

const pool = new Pool({ connectionString: DATABASE_URL, max: 4, ssl: { rejectUnauthorized: true } });
const encryptionKey = Buffer.from(SESSION_ENCRYPTION_KEY, "hex");
const DEVICE_LABEL = "OTPProvider WhatsApp Web";
let providerId, deviceId, socket = null, state = "starting", qrDataUrl = null, lastConnectedAt = null, lastError = null;
let saveQueue = Promise.resolve();
const rate = new Map();

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
function decrypt(value) {
  if (!value) return null;
  const [iv, tag, data] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"));
}
function json(res, status, body) {
  res.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store, no-cache, must-revalidate", "pragma":"no-cache", "x-content-type-options":"nosniff" });
  res.end(JSON.stringify(body));
}
function authorized(req) {
  const supplied = req.headers.authorization || "";
  const expected = Buffer.from("Bearer " + GATEWAY_TOKEN);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function allowRate(req, limit=30) {
  const ip = req.socket.remoteAddress || "unknown", now = Date.now();
  const entry = rate.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  entry.count++; rate.set(ip, entry);
  return entry.count <= limit;
}
async function ensureDatabase() {
  await pool.query("SELECT 1");
  const p = await pool.query(
    "INSERT INTO providers(key,channel,kind,enabled,maintenance,priority,weight,config) VALUES($1,'whatsapp','PERSONAL_LINKED_DEVICE',false,false,100,0,$2::jsonb) ON CONFLICT(key) DO UPDATE SET kind=EXCLUDED.kind, config=providers.config || EXCLUDED.config RETURNING id",
    ["whatsapp_linked_device", JSON.stringify({ gateway: "railway", customerSendingEnabled: false, experimental: true })]
  );
  providerId = p.rows[0].id;
  const existing = await pool.query("SELECT id,session_encrypted FROM whatsapp_devices WHERE provider_id=$1 ORDER BY created_at ASC LIMIT 1", [providerId]);
  if (existing.rowCount) {
    deviceId = existing.rows[0].id;
    await pool.query("UPDATE whatsapp_devices SET label=$1,routing_eligible=false WHERE id=$2", [DEVICE_LABEL, deviceId]);
    return existing.rows[0].session_encrypted ? decrypt(existing.rows[0].session_encrypted) : null;
  }
  const d = await pool.query(
    "INSERT INTO whatsapp_devices(provider_id,label,state,routing_eligible,session_encrypted) VALUES($1,$2,'disconnected',false,NULL) RETURNING id",
    [providerId, DEVICE_LABEL]
  );
  deviceId = d.rows[0].id;
  return null;
}
async function persistAuth(auth) {
  saveQueue = saveQueue.then(async () => {
    await pool.query("UPDATE whatsapp_devices SET session_encrypted=$1,last_activity_at=now(),last_error=NULL WHERE id=$2", [encrypt(auth), deviceId]);
  });
  return saveQueue;
}
function makeAuthState(saved) {
  const creds = saved?.creds || initAuthCreds();
  const keys = saved?.keys || {};
  const keyStore = {
    async get(type, ids) {
      const out = {};
      for (const id of ids) if (keys[type + ":" + id] !== undefined) out[id] = keys[type + ":" + id];
      return out;
    },
    async set(data) {
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries)) {
          const k = type + ":" + id;
          if (value == null) delete keys[k]; else keys[k] = value;
        }
      }
      await persistAuth({ creds, keys });
    }
  };
  return { state: { creds, keys: keyStore }, snapshot: () => ({ creds, keys }) };
}
async function updateDevice(patch) {
  const fields = Object.keys(patch), values = Object.values(patch);
  const sets = fields.map((f,i) => f + "=$" + (i+1)).join(",");
  await pool.query("UPDATE whatsapp_devices SET " + sets + ", last_activity_at=now() WHERE id=$" + (fields.length+1), [...values, deviceId]);
}
async function startSocket(saved) {
  if (socket) { try { socket.end(undefined); } catch {} socket = null; }
  const auth = makeAuthState(saved);
  socket = makeWASocket({
    auth: auth.state, browser: Browsers.ubuntu("OTPProvider"),
    printQRInTerminal: false, syncFullHistory: false, markOnlineOnConnect: false,
    connectTimeoutMs: 30_000, defaultQueryTimeoutMs: 30_000,
    logger: pino({ level:"silent" })
  });
  socket.ev.on("creds.update", async () => { try { await persistAuth(auth.snapshot()); } catch { lastError = "auth_persist_failed"; } });
  socket.ev.on("connection.update", async (u) => {
    if (u.qr) {
      try { qrDataUrl = await QRCode.toDataURL(u.qr, { width: 320, margin: 2 }); state = "pairing"; await updateDevice({ state:"pairing", routing_eligible:false, last_error:null }); }
      catch { lastError = "qr_generation_failed"; }
    }
    if (u.connection === "open") {
      state = "connected"; qrDataUrl = null; lastConnectedAt = new Date().toISOString(); lastError = null;
      await persistAuth(auth.snapshot()); await updateDevice({ state:"connected", routing_eligible:false, last_error:null });
    }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      state = code === DisconnectReason.loggedOut ? "logged_out" : "disconnected";
      qrDataUrl = null; lastError = "connection_closed";
      await updateDevice({ state: state === "logged_out" ? "error" : "disconnected", routing_eligible:false, last_error:lastError });
      if (code !== DisconnectReason.loggedOut) setTimeout(() => startSocket(auth.snapshot()).catch(() => { state="error"; }), 5_000).unref();
    }
  });
}
async function readBody(req) {
  const chunks=[]; let size=0;
  for await (const c of req) { size += c.length; if(size>8192) throw new Error("body_too_large"); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
const pairHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OTPProvider · Link WhatsApp</title><style>body{font:16px system-ui;background:#f5f7fb;color:#142033;max-width:520px;margin:32px auto;padding:18px}main{background:white;border:1px solid #dce3ee;border-radius:18px;padding:24px;text-align:center}img{width:min(320px,100%)}p{line-height:1.5;color:#526078}</style><main><h1>Link WhatsApp device</h1><p>On the phone that will send OTPs, open WhatsApp → Linked devices → Link a device, then scan this QR code.</p><strong id="status">Checking secure pairing session…</strong><p><img id="qr" alt="WhatsApp pairing QR" hidden></p><p id="note">Keep this page private. Do not share the QR code.</p></main><script>async function tick(){try{const r=await fetch(location.pathname+'/data',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();document.getElementById('status').textContent=d.state==='connected'?'Connected successfully':d.state==='pairing'?'Scan the QR code using WhatsApp':'Waiting for QR code…';const q=document.getElementById('qr');q.hidden=!d.qr;q.src=d.qr||'';if(d.state!=='connected')setTimeout(tick,2500)}catch{document.getElementById('status').textContent='Pairing session unavailable. Refresh the page.'}}tick()</script></html>`;
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method==="GET" && (url.pathname==="/health" || url.pathname==="/")) return json(res,200,{ok:true,service:"otp-whatsapp-gateway",state});
  if (req.method==="GET" && url.pathname === "/pair/" + PAIRING_VIEW_KEY) {
    if (!allowRate(req,15)) return json(res,429,{error:"rate_limited"});
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; img-src 'self' data:; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}); return res.end(pairHtml);
  }
  if (req.method==="GET" && url.pathname === "/pair/" + PAIRING_VIEW_KEY + "/data") {
    if (!allowRate(req,30)) return json(res,429,{error:"rate_limited"});
    return json(res,200,{state,qr:qrDataUrl});
  }
  if (!authorized(req)) return json(res,401,{error:"unauthorized"});
  if (!allowRate(req,60)) return json(res,429,{error:"rate_limited"});
  if (req.method==="GET" && url.pathname==="/admin/status") return json(res,200,{state,connected:state==="connected",lastConnectedAt,lastError,customerSendingEnabled:WA_CUSTOMER_SEND_ENABLED==="true",providerId,deviceId});
  if (req.method==="POST" && url.pathname==="/admin/reconnect") { startSocket(null).catch(()=>{state="error";}); return json(res,202,{ok:true,state:"reconnecting"}); }
  if (req.method==="POST" && url.pathname==="/admin/test-send") {
    if (WA_ADMIN_TEST_SEND_ENABLED!=="true") return json(res,423,{error:"admin_test_sending_disabled"});
    if (state!=="connected" || !socket) return json(res,503,{error:"whatsapp_not_connected"});
    let body; try { body=await readBody(req); } catch { return json(res,400,{error:"invalid_request"}); }
    const to=String(body.to||"").replace(/[^0-9]/g,""), message=String(body.message||"").trim();
    const allowed=WA_TEST_RECIPIENTS.split(",").map(x=>x.replace(/[^0-9]/g,"")).filter(Boolean);
    if (!/^\d{8,15}$/.test(to) || !allowed.includes(to) || !message || message.length>500) return json(res,400,{error:"recipient_not_allowlisted_or_invalid_message"});
    try { const result=await socket.sendMessage(to+"@s.whatsapp.net",{text:message}); return json(res,202,{accepted:true,messageId:result?.key?.id||null,note:"Submission is not confirmed delivery; no wallet charge is performed here."}); }
    catch { return json(res,502,{error:"send_failed"}); }
  }
  if (req.method==="POST" && url.pathname==="/v1/send") {
    if (WA_CUSTOMER_SEND_ENABLED!=="true") return json(res,423,{error:"customer_sending_disabled"});
    return json(res,503,{error:"live_delivery_receipts_not_implemented",message:"Customer sending remains unavailable until delivery receipt reconciliation is implemented and tested."});
  }
  return json(res,404,{error:"not_found"});
});
const saved = await ensureDatabase();
await startSocket(saved);
server.listen(Number(PORT),"0.0.0.0");
process.on("SIGTERM", async()=>{try{socket?.end(undefined);await pool.end()}finally{process.exit(0)}});

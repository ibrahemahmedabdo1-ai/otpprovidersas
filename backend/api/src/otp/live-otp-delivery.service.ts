import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { ApiKeyContext } from "./api-key.guard";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { cleanIp } from "../common/ip";
import { decryptString, encryptString, generateOtp, hashOtp, hmacHex } from "../common/crypto";
import { sha256 } from "../auth/tokens";
import { enqueueWebhookEvent } from "../webhooks/webhooks.service";
import { writeAudit } from "../common/audit";
import { parseIdempotencyKey } from "./recipient";
import { classifyResendEvent } from "./resend-webhook-rules";
import { isBillableWhatsAppReceipt } from "./whatsapp-receipt-rules";

type LiveSendInput = { channel: "email" | "whatsapp"; to: string; locale: string };
const json = (value: unknown) => JSON.stringify(value);
const safeString = (v: unknown) => typeof v === "string" ? v : "";

@Injectable()
export class LiveOtpDeliveryService {
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  private credentials() {
    const apiKey = process.env.RESEND_API_KEY ?? "";
    const from = process.env.EMAIL_FROM ?? "";
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    if (!apiKey || !from || !webhookSecret) throw new ServiceUnavailableException({ error: "email_provider_not_configured" });
    return { apiKey, from };
  }

  private async sendEmail(to: string, code: string, ttlSeconds: number, requestId: string) {
    const { apiKey, from } = this.credentials();
    const subject = "Your OTPProvider verification code";
    const text = `Your verification code is: ${code}\n\nIt expires in ${Math.ceil(ttlSeconds / 60)} minutes. If you did not request this code, ignore this email.`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033"><div style="max-width:520px;margin:32px auto;padding:28px;border:1px solid #e5e7eb;border-radius:16px"><h2>OTPProvider</h2><p>Your verification code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;background:#f3f4f6;text-align:center;border-radius:10px">${code}</div><p>It expires in ${Math.ceil(ttlSeconds / 60)} minutes.</p><p style="color:#64748b;font-size:12px">If you did not request this code, ignore this email.</p></div></body></html>`;
    type FetchRes = { ok: boolean; status: number; json(): Promise<unknown> };
    const response = (await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: json({ from, to: [to], subject, text, html, tags: [{ name: "service", value: "otp" }, { name: "request_id", value: requestId }] }),
      signal: AbortSignal.timeout(12000),
    })) as unknown as FetchRes;
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return { ok: false as const, status: response.status };
    const messageId = safeString(payload.id);
    return messageId ? { ok: true as const, messageId } : { ok: false as const, status: 502 };
  }

  async send(k: ApiKeyContext, input: LiveSendInput, idemHeader: string | undefined, correlationId: string, ip?: string) {
    if (input.channel === "whatsapp") return this.sendWhatsApp(k, input, idemHeader, correlationId, ip);
    if (!k.emailEnabled) throw new ForbiddenException({ error: "channel_disabled" });
    this.credentials();

    const idem = parseIdempotencyKey(idemHeader);
    if (!idem.ok) throw new UnprocessableEntityException({ error: "validation_failed", message: idem.error });
    const providerResult = await this.db.pool.query(
      "SELECT id, cost_micro_usd FROM providers WHERE channel='email' AND kind='RESEND' AND enabled=true AND maintenance=false ORDER BY priority, created_at LIMIT 1"
    );
    const provider = providerResult.rows[0];
    if (!provider) throw new ServiceUnavailableException({ error: "provider_unavailable" });
    const priceResult = await this.db.pool.query(
      "SELECT id, unit_price_micro_usd FROM prices WHERE channel='email' AND country='*' AND status='active' ORDER BY version DESC LIMIT 1"
    );
    const price = priceResult.rows[0];
    if (!price) throw new ServiceUnavailableException({ error: "price_not_configured" });

    const org = await this.db.pool.query(
      "SELECT o.status, cv.status AS verification_status FROM organizations o LEFT JOIN LATERAL (SELECT status FROM customer_verifications WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 1) cv ON true WHERE o.id=$1",
      [k.organizationId]
    );
    if (org.rows[0]?.status !== "active" || org.rows[0]?.verification_status !== "approved") {
      throw new ForbiddenException({ error: "customer_verification_required" });
    }

    const to = input.to.trim().toLowerCase();
    const recipientHash = hmacHex(this.cfg.otpPepper, `recipient:email:${to}`);
    const daily = await this.db.pool.query("SELECT count(*)::int AS n FROM otp_requests WHERE project_id=$1 AND mode='live' AND created_at >= date_trunc('day', now())", [k.projectId]);
    if (k.dailyLimit !== null && daily.rows[0].n >= k.dailyLimit) throw new HttpException({ error: "daily_limit_reached" }, HttpStatus.TOO_MANY_REQUESTS);
    const recent = await this.db.pool.query("SELECT count(*)::int AS n FROM otp_requests WHERE project_id=$1 AND recipient_hash=$2 AND created_at > now()-interval '10 minutes'", [k.projectId, recipientHash]);
    if (recent.rows[0].n >= 5) throw new HttpException({ error: "recipient_rate_limited", retryAfterSec: 600 }, HttpStatus.TOO_MANY_REQUESTS);

    const requestHash = sha256(`email|${to}`);
    const id = randomUUID(), deliveryId = randomUUID(), code = generateOtp(k.otpLength);
    const created = await this.db.tx(async (c) => {
      if (idem.value) {
        const claim = await c.query("INSERT INTO idempotency_keys(project_id,key,request_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key", [k.projectId, idem.value, requestHash]);
        if (!claim.rows[0]) {
          const prev = await c.query("SELECT request_hash,response FROM idempotency_keys WHERE project_id=$1 AND key=$2", [k.projectId, idem.value]);
          if (!prev.rows[0] || prev.rows[0].request_hash !== requestHash) return { kind: "conflict" as const };
          return { kind: "replay" as const, body: prev.rows[0].response };
        }
      }
      const wallet = await c.query("SELECT paid_micro_usd,promo_micro_usd,reserved_micro_usd FROM wallets WHERE id=$1 FOR UPDATE", [k.walletId]);
      const amount = BigInt(String(price.unit_price_micro_usd));
      const paid = BigInt(String(wallet.rows[0]?.paid_micro_usd ?? 0));
      const available = paid + BigInt(String(wallet.rows[0]?.promo_micro_usd ?? 0)) - BigInt(String(wallet.rows[0]?.reserved_micro_usd ?? 0));
      if (!wallet.rows[0] || paid < amount || available < amount) return { kind: "insufficient" as const };
      await c.query(
        `INSERT INTO otp_requests(id,project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,code_hash,status,max_attempts,last_sent_at,expires_at,correlation_id)
         VALUES ($1,$2,$3,'live','email',$4,$5,$6,'pending',$7,NULL,now()+make_interval(secs=>$8),$9)`,
        [id, k.projectId, k.walletId, recipientHash, encryptString(to, this.cfg.encryptionKey), hashOtp(this.cfg.otpPepper, id, code), k.maxAttempts, k.ttlSeconds, correlationId]
      );
      await c.query(
        "INSERT INTO otp_deliveries(id,otp_request_id,provider_id,attempt_no,status,cost_micro_usd,price_id,routing_explanation) VALUES ($1,$2,$3,1,'queued',$4,$5,$6::jsonb)",
        [deliveryId, id, provider.id, provider.cost_micro_usd, price.id, json({ strategy: "balanced", reason: "Verified Resend email route" })]
      );
      await c.query("SELECT reserve_for_delivery($1,$2,$3)", [k.walletId, deliveryId, price.unit_price_micro_usd]);
      const response = { id, channel: "email", status: "pending", mode: "live", deliveryStatus: "queued" };
      if (idem.value) await c.query("UPDATE idempotency_keys SET response=$3::jsonb WHERE project_id=$1 AND key=$2", [k.projectId, idem.value, json(response)]);
      await writeAudit(c, { actorId: null, action: "otp.send", subjectType: "otp_request", subjectId: id, ip: cleanIp(ip), meta: { channel: "email", mode: "live", projectId: k.projectId, correlationId } });
      return { kind: "created" as const, body: response };
    });
    if (created.kind === "conflict") throw new UnprocessableEntityException({ error: "idempotency_conflict" });
    if (created.kind === "insufficient") throw new HttpException({ error: "insufficient_balance" }, HttpStatus.PAYMENT_REQUIRED);
    if (created.kind === "replay") return { status: 200, body: created.body };

    try {
      const sent = await this.sendEmail(to, code, k.ttlSeconds, id);
      if (!sent.ok) {
        if (sent.status >= 500) {
          await this.db.pool.query("UPDATE otp_deliveries SET status='unknown',provider_response=$2::jsonb,updated_at=now() WHERE id=$1", [deliveryId, json({ httpStatus: sent.status })]);
          return { status: 202, body: { id, channel: "email", status: "pending", mode: "live", deliveryStatus: "unknown" } };
        }
        await this.failDelivery(deliveryId, k.walletId, price.unit_price_micro_usd, id, { httpStatus: sent.status });
        throw new ServiceUnavailableException({ error: "provider_rejected_message" });
      }
      await this.db.pool.query("UPDATE otp_deliveries SET status='submitted',provider_message_id=$2,provider_response=$3::jsonb,updated_at=now() WHERE id=$1", [deliveryId, sent.messageId, json({ accepted: true })]);
      return { status: 202, body: { id, channel: "email", status: "pending", mode: "live", deliveryStatus: "submitted" } };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      await this.db.pool.query("UPDATE otp_deliveries SET status='unknown',updated_at=now() WHERE id=$1 AND status='queued'", [deliveryId]).catch(() => undefined);
      return { status: 202, body: { id, channel: "email", status: "pending", mode: "live", deliveryStatus: "unknown" } };
    }
  }


  /** Live WhatsApp send. Customer traffic remains fail-closed until both API and gateway flags,
   * provider activation, an explicitly routing-eligible device, and receipt reconciliation are ready. */
  private async sendWhatsApp(k: ApiKeyContext, input: LiveSendInput, idemHeader: string | undefined, correlationId: string, ip?: string) {
    if (process.env.WA_CUSTOMER_SEND_ENABLED !== "true") throw new ForbiddenException({ error: "channel_not_live" });
    const gatewayToken = process.env.WA_GATEWAY_TOKEN ?? "";
    if (gatewayToken.length < 24) throw new ServiceUnavailableException({ error: "gateway_not_configured" });
    const idem = parseIdempotencyKey(idemHeader);
    if (!idem.ok) throw new UnprocessableEntityException({ error: "validation_failed", message: idem.error });

    const providerResult = await this.db.pool.query(
      "SELECT id,cost_micro_usd,config->>'gateway_url' AS gateway_url FROM providers WHERE key='whatsapp_linked_device' AND channel='whatsapp' AND enabled=true AND maintenance=false ORDER BY priority,created_at LIMIT 1"
    );
    const provider = providerResult.rows[0];
    if (!provider) throw new ServiceUnavailableException({ error: "provider_unavailable" });
    const gatewayUrl = safeString(provider.gateway_url);
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(gatewayUrl)) throw new ServiceUnavailableException({ error: "gateway_url_not_configured" });

    const to = input.to.trim();
    const country = countryForE164(to);
    const priceResult = await this.db.pool.query(
      "SELECT id,unit_price_micro_usd FROM prices WHERE channel='whatsapp' AND country IN ($1,'*') AND status='active' ORDER BY (country=$1) DESC,version DESC LIMIT 1",
      [country]
    );
    const price = priceResult.rows[0];
    if (!price) throw new ServiceUnavailableException({ error: "price_not_configured" });

    const org = await this.db.pool.query(
      "SELECT o.status,cv.status AS verification_status FROM organizations o LEFT JOIN LATERAL (SELECT status FROM customer_verifications WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 1) cv ON true WHERE o.id=$1",
      [k.organizationId]
    );
    if (org.rows[0]?.status !== "active" || org.rows[0]?.verification_status !== "approved") {
      throw new ForbiddenException({ error: "customer_verification_required" });
    }

    const recipientHash = hmacHex(this.cfg.otpPepper, `recipient:whatsapp:${to}`);
    const daily = await this.db.pool.query("SELECT count(*)::int AS n FROM otp_requests WHERE project_id=$1 AND mode='live' AND created_at >= date_trunc('day',now())", [k.projectId]);
    if (k.dailyLimit !== null && daily.rows[0].n >= k.dailyLimit) throw new HttpException({ error: "daily_limit_reached" }, HttpStatus.TOO_MANY_REQUESTS);
    const recent = await this.db.pool.query("SELECT count(*)::int AS n FROM otp_requests WHERE project_id=$1 AND recipient_hash=$2 AND created_at > now()-interval '10 minutes'", [k.projectId, recipientHash]);
    if (recent.rows[0].n >= 5) throw new HttpException({ error: "recipient_rate_limited", retryAfterSec: 600 }, HttpStatus.TOO_MANY_REQUESTS);

    const deviceResult = await this.db.pool.query(
      "SELECT id FROM whatsapp_devices WHERE provider_id=$1 AND state='connected' AND routing_eligible=true ORDER BY priority DESC,created_at LIMIT 1",
      [provider.id]
    );
    const device = deviceResult.rows[0];
    if (!device) throw new ServiceUnavailableException({ error: "whatsapp_route_unavailable" });

    const requestHash = sha256(`whatsapp|${to}`);
    const id = randomUUID(), deliveryId = randomUUID(), code = generateOtp(k.otpLength);
    const created = await this.db.tx(async (c) => {
      if (idem.value) {
        const claim = await c.query("INSERT INTO idempotency_keys(project_id,key,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key", [k.projectId, idem.value, requestHash]);
        if (!claim.rows[0]) {
          const prev = await c.query("SELECT request_hash,response FROM idempotency_keys WHERE project_id=$1 AND key=$2", [k.projectId, idem.value]);
          if (!prev.rows[0] || prev.rows[0].request_hash !== requestHash) return { kind: "conflict" as const };
          return { kind: "replay" as const, body: prev.rows[0].response };
        }
      }
      const wallet = await c.query("SELECT paid_micro_usd,promo_micro_usd,reserved_micro_usd FROM wallets WHERE id=$1 FOR UPDATE", [k.walletId]);
      const amount = BigInt(String(price.unit_price_micro_usd));
      const paid = BigInt(String(wallet.rows[0]?.paid_micro_usd ?? 0));
      const available = paid + BigInt(String(wallet.rows[0]?.promo_micro_usd ?? 0)) - BigInt(String(wallet.rows[0]?.reserved_micro_usd ?? 0));
      if (!wallet.rows[0] || paid < amount || available < amount) return { kind: "insufficient" as const };
      await c.query(
        `INSERT INTO otp_requests(id,project_id,wallet_id,mode,channel,recipient_hash,recipient_encrypted,country,code_hash,status,max_attempts,last_sent_at,expires_at,correlation_id)
         VALUES($1,$2,$3,'live','whatsapp',$4,$5,$6,$7,'pending',$8,NULL,now()+make_interval(secs=>$9),$10)`,
        [id,k.projectId,k.walletId,recipientHash,encryptString(to,this.cfg.encryptionKey),country,hashOtp(this.cfg.otpPepper,id,code),k.maxAttempts,k.ttlSeconds,correlationId]
      );
      await c.query(
        "INSERT INTO otp_deliveries(id,otp_request_id,provider_id,attempt_no,status,cost_micro_usd,price_id,routing_explanation) VALUES($1,$2,$3,1,'queued',$4,$5,$6::jsonb)",
        [deliveryId,id,provider.id,provider.cost_micro_usd,price.id,json({strategy:"balanced",reason:"Connected and routing-eligible WhatsApp linked device"})]
      );
      await c.query("SELECT reserve_for_delivery($1,$2,$3)", [k.walletId,deliveryId,price.unit_price_micro_usd]);
      const response = { id,channel:"whatsapp",status:"pending",mode:"live",deliveryStatus:"queued" };
      if (idem.value) await c.query("UPDATE idempotency_keys SET response=$3::jsonb WHERE project_id=$1 AND key=$2", [k.projectId,idem.value,json(response)]);
      await writeAudit(c,{actorId:null,action:"otp.send",subjectType:"otp_request",subjectId:id,ip:cleanIp(ip),meta:{channel:"whatsapp",mode:"live",projectId:k.projectId,correlationId}});
      return {kind:"created" as const,body:response};
    });
    if (created.kind === "conflict") throw new UnprocessableEntityException({ error:"idempotency_conflict" });
    if (created.kind === "insufficient") throw new HttpException({ error:"insufficient_balance" },HttpStatus.PAYMENT_REQUIRED);
    if (created.kind === "replay") return { status:200,body:created.body };

    const message = `OTPProvider verification code: ${code}. It expires in ${Math.ceil(k.ttlSeconds/60)} minutes. Do not share this code.`;
    try {
      const response = await fetch(gatewayUrl + "/v1/send", {
        method:"POST",
        headers:{authorization:"Bearer "+gatewayToken,"content-type":"application/json"},
        body:json({to,deviceId:String(device.id),deliveryId,requestId:id,message}),
        signal:AbortSignal.timeout(15000)
      });
      const payload = await response.json().catch(()=>({})) as Record<string,unknown>;
      const messageId = safeString(payload.messageId);
      if (response.status === 202 && payload.accepted === true && messageId) {
        await this.db.pool.query(
          "UPDATE otp_deliveries SET status='submitted',provider_message_id=$2,provider_response=$3::jsonb,updated_at=now() WHERE id=$1",
          [deliveryId,messageId,json({accepted:true,gateway:"linked_device"})]
        );
        return {status:202,body:{id,channel:"whatsapp",status:"pending",mode:"live",deliveryStatus:"submitted"}};
      }
      if (response.status >= 500) {
        await this.db.pool.query(
          "UPDATE otp_deliveries SET status='unknown',provider_message_id=NULLIF($2,''),provider_response=$3::jsonb,updated_at=now() WHERE id=$1",
          [deliveryId,messageId,json({gatewayStatus:response.status,error:safeString(payload.error)})]
        );
        return {status:202,body:{id,channel:"whatsapp",status:"pending",mode:"live",deliveryStatus:"unknown"}};
      }
      await this.failDelivery(deliveryId,k.walletId,price.unit_price_micro_usd,id,{gatewayStatus:response.status,error:safeString(payload.error)});
      throw new ServiceUnavailableException({error:"whatsapp_provider_rejected"});
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      await this.db.pool.query(
        "UPDATE otp_deliveries SET status='unknown',updated_at=now() WHERE id=$1 AND status='queued'",
        [deliveryId]
      ).catch(()=>undefined);
      return {status:202,body:{id,channel:"whatsapp",status:"pending",mode:"live",deliveryStatus:"unknown"}};
    }
  }

  /** Reconcile only persisted, explicitly delivered WhatsApp receipts. Row locks plus the wallet
   * ledger function make this safe when the background tick is retried or runs concurrently. */
  async reconcileWhatsAppReceipts(): Promise<number> {
    const receipts = await this.db.pool.query(
      "SELECT DISTINCT ON (otp_delivery_id) otp_delivery_id,id,message_id,device_id,status,created_at FROM wa_message_receipts WHERE otp_delivery_id IS NOT NULL AND status='delivered' ORDER BY otp_delivery_id,created_at ASC LIMIT 100"
    );
    let reconciled = 0;
    for (const receipt of receipts.rows) {
      if (!isBillableWhatsAppReceipt(String(receipt.status))) continue;
      const changed = await this.db.tx(async (c) => {
        const found = await c.query(
          `SELECT d.id,d.status,d.billed,r.id AS request_id,r.wallet_id,r.project_id,p.unit_price_micro_usd
           FROM otp_deliveries d JOIN otp_requests r ON r.id=d.otp_request_id
           LEFT JOIN prices p ON p.id=d.price_id WHERE d.id=$1 FOR UPDATE OF d,r`,
          [receipt.otp_delivery_id]
        );
        const row = found.rows[0];
        if (!row || row.status === "failed" || (row.status === "delivered" && row.billed === true)) return false;
        if (row.unit_price_micro_usd === null || row.unit_price_micro_usd === undefined) return false;
        await c.query(
          "UPDATE otp_deliveries SET status='delivered',evidence=COALESCE(evidence,'{}'::jsonb)||$2::jsonb,updated_at=now() WHERE id=$1",
          [row.id,json({whatsappDeliveryReceipt:{receiptId:receipt.id,messageId:receipt.message_id,deviceId:receipt.device_id,receivedAt:receipt.created_at,source:"wa_message_receipts"}})]
        );
        await c.query("SELECT charge_confirmed_delivery($1,$2,$3)",[row.wallet_id,row.id,row.unit_price_micro_usd]);
        await c.query("UPDATE otp_requests SET status='sent',last_sent_at=now() WHERE id=$1",[row.request_id]);
        await enqueueWebhookEvent(c,String(row.project_id),"otp.delivered",{otpRequestId:row.request_id,channel:"whatsapp",mode:"live"});
        return true;
      });
      if (changed) reconciled++;
    }
    // Release unresolved WhatsApp reservations after a provider error has had a short
    // out-of-order receipt grace window, or after the OTP request itself has expired.
    // Explicit delivered receipts are reconciled first and always take precedence.
    const failures = await this.db.pool.query(
      `SELECT d.id AS delivery_id,r.id AS request_id,r.wallet_id,r.expires_at,p.unit_price_micro_usd,
              e.id AS receipt_id,e.status AS receipt_status,e.created_at AS receipt_at
       FROM otp_deliveries d
       JOIN otp_requests r ON r.id=d.otp_request_id
       LEFT JOIN prices p ON p.id=d.price_id
       LEFT JOIN LATERAL (
         SELECT id,status,created_at FROM wa_message_receipts
         WHERE otp_delivery_id=d.id AND status='error'
         ORDER BY created_at DESC LIMIT 1
       ) e ON true
       WHERE r.channel='whatsapp' AND d.status IN ('queued','submitted','unknown')
         AND ((e.id IS NOT NULL AND e.created_at <= now()-interval '2 minutes')
              OR r.expires_at <= now()-interval '2 minutes')
         AND NOT EXISTS (
           SELECT 1 FROM wa_message_receipts delivered
           WHERE delivered.otp_delivery_id=d.id AND delivered.status='delivered'
         )
       ORDER BY d.created_at ASC LIMIT 100`
    );
    for (const failure of failures.rows) {
      const released = await this.db.tx(async (c) => {
        const found = await c.query(
          `SELECT d.id,d.status,r.id AS request_id,r.wallet_id,r.project_id,r.expires_at,p.unit_price_micro_usd
           FROM otp_deliveries d JOIN otp_requests r ON r.id=d.otp_request_id
           LEFT JOIN prices p ON p.id=d.price_id WHERE d.id=$1 FOR UPDATE OF d,r`,
          [failure.delivery_id]
        );
        const row = found.rows[0];
        if (!row || ["failed","delivered"].includes(String(row.status))) return false;
        if (row.unit_price_micro_usd === null || row.unit_price_micro_usd === undefined) return false;
        const expired = new Date(row.expires_at).getTime() <= Date.now();
        await c.query(
          "UPDATE otp_deliveries SET status='failed',evidence=COALESCE(evidence,'{}'::jsonb)||$2::jsonb,updated_at=now() WHERE id=$1",
          [row.id,json({whatsappFailure:{receiptId:failure.receipt_id??null,receiptStatus:failure.receipt_status??null,receiptAt:failure.receipt_at??null,reason:expired?"request_expired":"provider_error",source:"wa_message_receipts_or_expiry"}})]
        );
        await c.query("SELECT release_failed_delivery($1,$2,$3)",[row.wallet_id,row.id,row.unit_price_micro_usd]);
        await c.query("UPDATE otp_requests SET status=$2,last_sent_at=NULL WHERE id=$1",[row.request_id,expired?"expired":"failed"]);
        await enqueueWebhookEvent(c,String(row.project_id),"otp.failed",{otpRequestId:row.request_id,channel:"whatsapp",mode:"live"});
        return true;
      });
      if (released) reconciled++;
    }
    return reconciled;
  }

  private async failDelivery(deliveryId: string, walletId: string, amount: string | number, requestId: string, details: Record<string, unknown>) {
    await this.db.tx(async (c) => {
      await c.query("UPDATE otp_deliveries SET status='failed',provider_response=$2::jsonb,updated_at=now() WHERE id=$1", [deliveryId, json(details)]);
      await c.query("SELECT release_failed_delivery($1,$2,$3)", [walletId, deliveryId, amount]);
      await c.query("UPDATE otp_requests SET status='failed' WHERE id=$1", [requestId]);
    });
  }

  async handleResendWebhook(rawBody: Buffer, headers: Record<string, string | undefined>) {
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    const id = headers["svix-id"], timestamp = headers["svix-timestamp"], signature = headers["svix-signature"];
    if (!secret || !id || !timestamp || !signature || !rawBody) throw new HttpException({ error: "invalid_webhook" }, HttpStatus.UNAUTHORIZED);
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) throw new HttpException({ error: "stale_webhook" }, HttpStatus.UNAUTHORIZED);
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(id + "." + timestamp + ".").update(rawBody).digest();
    const valid = signature.split(" ").some((part) => {
      const [version, value] = part.split(",", 2);
      if (version !== "v1" || !value) return false;
      const actual = Buffer.from(value, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
    if (!valid) throw new HttpException({ error: "invalid_signature" }, HttpStatus.UNAUTHORIZED);
    let event: any;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { throw new HttpException({ error: "invalid_payload" }, HttpStatus.BAD_REQUEST); }
    const type = safeString(event?.type), messageId = safeString(event?.data?.email_id);
    if (!messageId) return { ok: true, ignored: true };
    const outcome = classifyResendEvent(type);
    if (outcome === "ignored") return { ok: true, ignored: true };
    await this.db.tx(async (c) => {
      const found = await c.query(
        `SELECT d.id,d.status,d.billed,r.id AS request_id,r.wallet_id,p.unit_price_micro_usd
         FROM otp_deliveries d JOIN otp_requests r ON r.id=d.otp_request_id LEFT JOIN prices p ON p.id=d.price_id
         WHERE d.provider_message_id=$1 FOR UPDATE OF d,r`, [messageId]);
      const row = found.rows[0];
      if (!row || row.status === "delivered" || row.status === "failed") return;

      // A complaint is an abuse/reputation signal, not proof of delivery.
      // Keep the delivery unresolved and the reserved funds untouched until
      // the explicit email.delivered event arrives.
      if (outcome === "complaint") {
        await c.query(
          "UPDATE otp_deliveries SET evidence=COALESCE(evidence,'{}'::jsonb) || $2::jsonb,updated_at=now() WHERE id=$1",
          [row.id, json({ complaint: { eventId: safeString(event.id), type, createdAt: event.created_at } })]
        );
        return;
      }

      if (outcome === "delivered") {
        await c.query(
          "UPDATE otp_deliveries SET status='delivered',evidence=COALESCE(evidence,'{}'::jsonb) || $2::jsonb,updated_at=now() WHERE id=$1",
          [row.id, json({ delivery: { eventId: safeString(event.id), type, createdAt: event.created_at } })]
        );
        await c.query("SELECT charge_confirmed_delivery($1,$2,$3)", [row.wallet_id, row.id, row.unit_price_micro_usd]);
        await c.query("UPDATE otp_requests SET status='sent',last_sent_at=now() WHERE id=$1", [row.request_id]);
        const project = await c.query("SELECT project_id FROM otp_requests WHERE id=$1", [row.request_id]);
        await enqueueWebhookEvent(c, project.rows[0].project_id, "otp.delivered", { otpRequestId: row.request_id, channel: "email", mode: "live" });
      } else {
        await c.query(
          "UPDATE otp_deliveries SET status='failed',evidence=COALESCE(evidence,'{}'::jsonb) || $2::jsonb,updated_at=now() WHERE id=$1",
          [row.id, json({ failure: { eventId: safeString(event.id), type } })]
        );
        await c.query("SELECT release_failed_delivery($1,$2,$3)", [row.wallet_id, row.id, row.unit_price_micro_usd]);
        await c.query("UPDATE otp_requests SET status='failed' WHERE id=$1", [row.request_id]);
      }
    });
    return { ok: true };
  }

  async resend(k: ApiKeyContext, id: string, ip?: string) {
    this.credentials();
    const result = await this.db.pool.query(
      `SELECT r.*,d.status AS last_delivery_status,d.attempt_no,p.id AS provider_id,p.cost_micro_usd,pr.id AS price_id,pr.unit_price_micro_usd
       FROM otp_requests r
       LEFT JOIN LATERAL (SELECT * FROM otp_deliveries WHERE otp_request_id=r.id ORDER BY attempt_no DESC LIMIT 1) d ON true
       LEFT JOIN providers p ON p.channel='email' AND p.kind='RESEND' AND p.enabled=true AND p.maintenance=false
       LEFT JOIN prices pr ON pr.channel='email' AND pr.country='*' AND pr.status='active'
       WHERE r.id=$1 AND r.project_id=$2 AND r.mode='live'
       ORDER BY p.priority,pr.version DESC LIMIT 1`, [id, k.projectId]);
    const r = result.rows[0];
    if (!r) throw new HttpException({ error: "not_found" }, HttpStatus.NOT_FOUND);
    if (r.channel !== "email") throw new ForbiddenException({ error: "channel_not_live" });
    if (r.status !== "sent" && r.status !== "pending") throw new HttpException({ error: "not_pending" }, HttpStatus.CONFLICT);
    if (r.last_delivery_status === "submitted" || r.last_delivery_status === "unknown" || r.last_delivery_status === "queued") throw new HttpException({ error: "delivery_pending" }, HttpStatus.CONFLICT);
    if (!r.provider_id || !r.price_id) throw new ServiceUnavailableException({ error: "provider_unavailable" });
    if (new Date(r.expires_at) <= new Date()) throw new HttpException({ error: "expired" }, HttpStatus.GONE);
    if (r.last_sent_at && Date.now() - new Date(r.last_sent_at).getTime() < k.resendCooldownSeconds * 1000) throw new HttpException({ error: "resend_cooldown" }, HttpStatus.TOO_MANY_REQUESTS);
    if (r.resend_count >= 3) throw new HttpException({ error: "max_resends" }, HttpStatus.TOO_MANY_REQUESTS);

    const code = generateOtp(k.otpLength), deliveryId = randomUUID();
    await this.db.tx(async (c) => {
      const wallet = await c.query("SELECT paid_micro_usd,promo_micro_usd,reserved_micro_usd FROM wallets WHERE id=$1 FOR UPDATE", [k.walletId]);
      const amount = BigInt(String(r.unit_price_micro_usd));
      const paid = BigInt(String(wallet.rows[0]?.paid_micro_usd ?? 0));
      const available = paid + BigInt(String(wallet.rows[0]?.promo_micro_usd ?? 0)) - BigInt(String(wallet.rows[0]?.reserved_micro_usd ?? 0));
      if (!wallet.rows[0] || paid < amount || available < amount) throw new HttpException({ error: "insufficient_balance" }, HttpStatus.PAYMENT_REQUIRED);
      await c.query("UPDATE otp_requests SET code_hash=$2,status='pending',attempts=0,resend_count=resend_count+1 WHERE id=$1", [id, hashOtp(this.cfg.otpPepper, id, code)]);
      await c.query("INSERT INTO otp_deliveries(id,otp_request_id,provider_id,attempt_no,status,cost_micro_usd,price_id) VALUES ($1,$2,$3,$4,'queued',$5,$6)", [deliveryId, id, r.provider_id, Number(r.attempt_no ?? 0) + 1, r.cost_micro_usd, r.price_id]);
      await c.query("SELECT reserve_for_delivery($1,$2,$3)", [k.walletId, deliveryId, r.unit_price_micro_usd]);
      await writeAudit(c, { actorId: null, action: "otp.resend", subjectType: "otp_request", subjectId: id, ip: cleanIp(ip), meta: { mode: "live", channel: "email" } });
    });

    try {
      const to = decryptString(r.recipient_encrypted, this.cfg.encryptionKey);
      const sent = await this.sendEmail(to, code, k.ttlSeconds, id);
      if (!sent.ok) {
        if (sent.status >= 500) {
          await this.db.pool.query("UPDATE otp_deliveries SET status='unknown',provider_response=$2::jsonb,updated_at=now() WHERE id=$1", [deliveryId, json({ httpStatus: sent.status })]);
          return { id, status: "pending", deliveryStatus: "unknown" };
        }
        await this.failDelivery(deliveryId, k.walletId, r.unit_price_micro_usd, id, { httpStatus: sent.status });
        throw new ServiceUnavailableException({ error: "provider_rejected_message" });
      }
      await this.db.pool.query("UPDATE otp_deliveries SET status='submitted',provider_message_id=$2,provider_response=$3::jsonb,updated_at=now() WHERE id=$1", [deliveryId, sent.messageId, json({ accepted: true })]);
      return { id, status: "pending", deliveryStatus: "submitted" };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      await this.db.pool.query("UPDATE otp_deliveries SET status='unknown',updated_at=now() WHERE id=$1 AND status='queued'", [deliveryId]).catch(() => undefined);
      return { id, status: "pending", deliveryStatus: "unknown" };
    }
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { microToUsd } from "../wallet/money";

@Injectable()
export class TopupWorkflowService {
  constructor(private readonly db: DbService) {}
  private customerOrg(ctx: AuthContext) {
    if (ctx.role !== "customer" || !ctx.organizationId) throw new ForbiddenException({error:"forbidden"});
    return ctx.organizationId;
  }
  async create(ctx: AuthContext, body: unknown, ip?: string) {
    const orgId=this.customerOrg(ctx), b=(body??{}) as Record<string,unknown>;
    const raw=typeof b.amountUsd==="number"?String(b.amountUsd):String(b.amountUsd??"");
    if(!/^\d{1,6}(\.\d{1,2})?$/.test(raw.trim())) throw new BadRequestException({error:"validation_failed",fields:{amountUsd:"Enter an amount between 0.01 and 10000 USD"}});
    const [whole="0",fraction=""]=raw.trim().split(".");
    const amount=BigInt(whole)*1000000n+BigInt(fraction.padEnd(2,"0"))*10000n;
    if(amount<=0n||amount>10000n*1000000n) throw new BadRequestException({error:"validation_failed",fields:{amountUsd:"Enter an amount between 0.01 and 10000 USD"}});
    const note=typeof b.note==="string"?b.note.trim().slice(0,500):"";
    return this.db.tx(async c=>{
      const wr=await c.query("SELECT id FROM wallets WHERE organization_id=$1::uuid FOR UPDATE",[orgId]);
      if(!wr.rows[0]) throw new ConflictException({error:"wallet_not_found"});
      const d=await c.query("SELECT request_deposit($1::uuid,$2::bigint,$3::text) AS id",[wr.rows[0].id,amount.toString(),note]);
      const depositId=d.rows[0].id as string;
      const ticket=await c.query("INSERT INTO tickets(organization_id,created_by,subject,priority) VALUES($1::uuid,$2::uuid,$3::text,'high') RETURNING id",
        [orgId,ctx.userId,"Wallet top-up "+depositId.slice(0,8).toUpperCase()]);
      const ticketId=ticket.rows[0].id as string;
      const conv=await c.query("INSERT INTO conversations(ticket_id,organization_id) VALUES($1::uuid,$2::uuid) RETURNING id",[ticketId,orgId]);
      const conversationId=conv.rows[0].id as string;
      const amountText=microToUsd(amount);
      await c.query("INSERT INTO messages(conversation_id,author_id,reply_identity,internal,body) VALUES($1::uuid,$2::uuid,'self',false,$3::text)",
        [conversationId,ctx.userId,"I would like to top up $"+amountText+" USD."+(note?"\nDetails: "+note:"")]);
      await c.query("INSERT INTO messages(conversation_id,author_id,reply_identity,internal,body) VALUES($1::uuid,NULL,'system',false,$2::text)",
        [conversationId,"أهلاً بك في OTPProvider 👋 تم استلام طلب الشحن. فريق الدعم سيساعدك في خطوات التحويل ومراجعة الإثبات. لا يُضاف الرصيد إلا بعد اعتماد الإدارة.\n\nWelcome to OTPProvider. Your top-up request is received. Support will guide you through the transfer and evidence review. Funds are credited only after administrator approval.\n\nRequest ID: "+depositId]);
      await c.query("UPDATE deposits SET ticket_id=$2::uuid WHERE id=$1::uuid",[depositId,ticketId]);
      await writeAudit(c,{actorId:ctx.userId,action:"deposit.request",subjectType:"deposit",subjectId:depositId,ip:cleanIp(ip),meta:{ticketId,amountMicroUsd:amount.toString()}});
      return {id:depositId,ticketId,status:"requested",amountUsd:amountText};
    });
  }
  async accountStatus(ctx: AuthContext) {
    const orgId=this.customerOrg(ctx);
    const r=await this.db.pool.query(`SELECT o.status,cv.status AS verification_status
      FROM organizations o LEFT JOIN LATERAL (SELECT status FROM customer_verifications WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 1) cv ON true
      WHERE o.id=$1::uuid`,[orgId]);
    if(!r.rows[0]) throw new ConflictException({error:"organization_not_found"});
    const organizationActive=r.rows[0].status==="active";
    const verified=r.rows[0].verification_status==="approved";
    return {organizationStatus:r.rows[0].status as string,verificationStatus:(r.rows[0].verification_status as string|null)??"not_submitted",
      emailLiveEligible:organizationActive&&verified,whatsappLiveEligible:false,
      message:!organizationActive?"Your organization is not active. Contact Support.":!verified?"Your email is verified, but live OTP sending is waiting for administrator account review. Contact Support if you need help.":"Your account is approved for eligible live email OTP. WhatsApp live delivery remains unavailable until delivery receipts are verified."};
  }
  async supportList(ctx: AuthContext) {
    if(!["support_staff","admin_staff","super_admin"].includes(ctx.role)) throw new ForbiddenException({error:"forbidden"});
    const r=await this.db.pool.query(`SELECT d.id,d.amount_micro_usd,d.status,d.method_note,d.support_evidence_note,d.created_at,d.ticket_id,o.name AS organization,u.email AS customer_email
      FROM deposits d JOIN wallets w ON w.id=d.wallet_id JOIN organizations o ON o.id=w.organization_id JOIN users u ON u.id=o.owner_user_id
      WHERE d.status IN ('requested','under_review') ORDER BY d.created_at ASC LIMIT 100`);
    return r.rows.map(x=>({id:x.id as string,amountUsd:microToUsd(BigInt(x.amount_micro_usd)),status:x.status as string,note:x.method_note as string|null,
      evidenceNote:x.support_evidence_note as string|null,ticketId:x.ticket_id as string|null,organization:x.organization as string,customerEmail:x.customer_email as string,createdAt:x.created_at}));
  }
  async submit(ctx: AuthContext,id: string,body: unknown,ip?: string) {
    if(ctx.role!=="support_staff") throw new ForbiddenException({error:"forbidden"});
    const evidenceNote=(body as {evidenceNote?:unknown}|null)?.evidenceNote;
    if(typeof evidenceNote!=="string"||evidenceNote.trim().length<5||evidenceNote.length>500) throw new BadRequestException({error:"validation_failed",fields:{evidenceNote:"5-500 characters required"}});
    return this.db.tx(async c=>{
      const r=await c.query(`UPDATE deposits SET status='under_review',support_submitted_by=$2::uuid,support_submitted_at=now(),support_evidence_note=$3::text
        WHERE id=$1::uuid AND status IN ('requested','under_review') RETURNING ticket_id`,[id,ctx.userId,evidenceNote.trim()]);
      if(!r.rows[0]) throw new ConflictException({error:"deposit_not_open_or_not_found"});
      const ticketId=r.rows[0].ticket_id as string|null;
      if(ticketId) await c.query("UPDATE tickets SET status='escalated',updated_at=now() WHERE id=$1::uuid",[ticketId]);
      await c.query(`INSERT INTO notifications(user_id,kind,title,body)
        SELECT id,'deposit_review_requested','Top-up awaiting approval',$1::text FROM users WHERE role IN ('admin_staff','super_admin') AND status='active'`,
        ["Support submitted deposit "+id+" for administrator review."]);
      await writeAudit(c,{actorId:ctx.userId,action:"support.deposit_submitted",subjectType:"deposit",subjectId:id,ip:cleanIp(ip),meta:{ticketId}});
      return {status:"under_review",ticketId};
    });
  }
}

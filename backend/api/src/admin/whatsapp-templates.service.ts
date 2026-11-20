import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";

const allowed = new Set(["code", "service_name", "expiry_minutes"]);
function parseTemplate(body: unknown) {
  const b = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const message = typeof b.body === "string" ? b.body.trim() : "";
  if (name.length < 2 || name.length > 80) throw new BadRequestException({ error: "validation_failed", fields: { name: "2-80 characters required" } });
  if (message.length < 1 || message.length > 500) throw new BadRequestException({ error: "validation_failed", fields: { body: "1-500 characters required" } });
  const tokens = [...message.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]);
  if (!tokens.includes("code") || tokens.some(t => !allowed.has(t)) || /[{}]/.test(message.replace(/\{(?:code|service_name|expiry_minutes)\}/g, ""))) {
    throw new BadRequestException({ error: "invalid_template_variables", message: "Use {code}; optional variables are {service_name} and {expiry_minutes}." });
  }
  return { name, body: message };
}

@Injectable()
export class WhatsAppTemplatesService {
  constructor(private readonly db: DbService) {}
  private customer(ctx: AuthContext) {
    if (ctx.role !== "customer" || !ctx.organizationId) throw new ForbiddenException({ error: "forbidden" });
    return ctx.organizationId;
  }
  private staff(ctx: AuthContext) {
    if (ctx.role !== "super_admin" && ctx.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" });
  }
  private superAdmin(ctx: AuthContext) {
    if (ctx.role !== "super_admin") throw new ForbiddenException({ error: "forbidden" });
  }
  private async ownProject(orgId: string, id: string) {
    if (!isUuid(id)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query("SELECT id FROM projects WHERE id=$1 AND organization_id=$2 AND whatsapp_enabled=true", [id, orgId]);
    if (!r.rowCount) throw new NotFoundException({ error: "not_found" });
  }

  async catalog(ctx: AuthContext, projectId: string) {
    const org = this.customer(ctx); await this.ownProject(org, projectId);
    const r = await this.db.pool.query(
      "SELECT id,name,body,project_id,created_at FROM whatsapp_message_templates WHERE status='approved' AND (project_id IS NULL OR project_id IN (SELECT id FROM projects WHERE organization_id=$1)) ORDER BY project_id NULLS FIRST,created_at DESC",
      [org]
    );
    const selected = await this.db.pool.query("SELECT whatsapp_template_id FROM projects WHERE id=$1", [projectId]);
    return { selectedTemplateId: selected.rows[0]?.whatsapp_template_id ?? null, templates: r.rows };
  }

  async submit(ctx: AuthContext, projectId: string, input: unknown, ip: string | null) {
    const org = this.customer(ctx); await this.ownProject(org, projectId);
    const t = parseTemplate(input);
    const b = input && typeof input === "object" ? input as Record<string, unknown> : {};
    let supersedes: string | null = null;
    if (b.supersedesId !== undefined) {
      if (!isUuid(b.supersedesId)) throw new BadRequestException({ error: "invalid_supersedes_id" });
      const old = await this.db.pool.query(
        "SELECT id FROM whatsapp_message_templates WHERE id=$1 AND status='approved' AND (project_id IS NULL OR project_id=$2)",
        [b.supersedesId, projectId]
      );
      if (!old.rowCount) throw new NotFoundException({ error: "template_not_found" });
      supersedes = b.supersedesId;
    }
    const r = await this.db.pool.query(
      "INSERT INTO whatsapp_message_templates(project_id,supersedes_id,name,body,status,created_by) VALUES($1,$2,$3,$4,'pending',$5) RETURNING id,created_at",
      [projectId,supersedes,t.name,t.body,ctx.userId]
    );
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_template.submitted",subjectType:"whatsapp_message_template",subjectId:r.rows[0].id,ip,meta:{projectId,supersedesId:supersedes}});
    return { id:r.rows[0].id,status:"pending",createdAt:r.rows[0].created_at };
  }

  async select(ctx: AuthContext, projectId: string, templateId: string, ip: string | null) {
    const org=this.customer(ctx); await this.ownProject(org,projectId);
    if(!isUuid(templateId)) throw new NotFoundException({error:"not_found"});
    const r=await this.db.pool.query(
      "SELECT id FROM whatsapp_message_templates WHERE id=$1 AND status='approved' AND (project_id IS NULL OR project_id=$2)",
      [templateId,projectId]
    );
    if(!r.rowCount) throw new NotFoundException({error:"approved_template_not_found"});
    await this.db.pool.query("UPDATE projects SET whatsapp_template_id=$2,updated_at=now() WHERE id=$1",[projectId,templateId]);
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_template.selected",subjectType:"project",subjectId:projectId,ip,meta:{templateId}});
    return {ok:true,selectedTemplateId:templateId};
  }

  async adminList(ctx: AuthContext, status: string) {
    this.staff(ctx);
    if(!["pending","approved","rejected","all"].includes(status)) throw new BadRequestException({error:"invalid_status"});
    const r=await this.db.pool.query(
      `SELECT t.id,t.project_id,t.supersedes_id,t.name,t.body,t.status,t.created_at,t.approved_at,t.rejection_reason,u.email AS customer_email,p.name AS project_name
       FROM whatsapp_message_templates t JOIN users u ON u.id=t.created_by LEFT JOIN projects p ON p.id=t.project_id
       WHERE ($1='all' OR t.status=$1) ORDER BY CASE WHEN t.status='pending' THEN 0 ELSE 1 END,t.created_at DESC LIMIT 300`,[status]);
    return r.rows;
  }

  async createApproved(ctx: AuthContext, input: unknown, ip: string | null) {
    this.superAdmin(ctx); const t=parseTemplate(input);
    const r=await this.db.pool.query(
      "INSERT INTO whatsapp_message_templates(project_id,name,body,status,created_by,approved_by,approved_at) VALUES(NULL,$1,$2,'approved',$3,$3,now()) RETURNING id",
      [t.name,t.body,ctx.userId]);
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_template.created_approved",subjectType:"whatsapp_message_template",subjectId:r.rows[0].id,ip,meta:{name:t.name}});
    return {id:r.rows[0].id,status:"approved"};
  }

  async decide(ctx: AuthContext,id: string, input: unknown,ip: string|null) {
    this.superAdmin(ctx);
    if(!isUuid(id)) throw new NotFoundException({error:"not_found"});
    const b=input&&typeof input==="object"?input as Record<string,unknown>:{};
    if(b.decision!=="approve"&&b.decision!=="reject") throw new BadRequestException({error:"decision_must_be_approve_or_reject"});
    const reason=typeof b.reason==="string"?b.reason.trim():"";
    if(b.decision==="reject"&&(reason.length<3||reason.length>500)) throw new BadRequestException({error:"rejection_reason_required"});
    const status=b.decision==="approve"?"approved":"rejected";
    const r=await this.db.pool.query(
      "UPDATE whatsapp_message_templates SET status=$2,approved_by=CASE WHEN $2='approved' THEN $3 ELSE NULL END,approved_at=CASE WHEN $2='approved' THEN now() ELSE NULL END,rejection_reason=$4,updated_at=now() WHERE id=$1 AND status='pending' RETURNING id,project_id",
      [id,status,ctx.userId,status==="rejected"?reason:null]);
    if(!r.rowCount) throw new ConflictException({error:"template_not_pending"});
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_template."+status,subjectType:"whatsapp_message_template",subjectId:id,ip,meta:{projectId:r.rows[0].project_id,reason:status==="rejected"?reason:undefined}});
    return {ok:true,status};
  }
}

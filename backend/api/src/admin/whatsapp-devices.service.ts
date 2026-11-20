import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";

@Injectable()
export class WhatsAppDevicesService {
  constructor(private readonly db: DbService) {}
  private admin(ctx: AuthContext) { if (ctx.role !== "super_admin") throw new ForbiddenException({error:"forbidden"}); }
  private gateway() {
    const base=(process.env.WHATSAPP_GATEWAY_URL||"").replace(/\/+$/,"");
    const token=process.env.WHATSAPP_GATEWAY_TOKEN||"";
    if(!base||token.length<24) throw new ServiceUnavailableException({error:"whatsapp_gateway_not_configured"});
    return {base,token};
  }
  private async call(path:string,method="GET",body?:unknown) {
    const {base,token}=this.gateway();
    try {
      const r=await fetch(base+path,{method,headers:{authorization:"Bearer "+token,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",signal:AbortSignal.timeout(8000)});
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new BadGatewayException({error:"whatsapp_gateway_error",status:r.status,detail:(data as any).error||"gateway_request_failed"});
      return data;
    } catch(e) { if(e instanceof BadGatewayException) throw e; throw new ServiceUnavailableException({error:"whatsapp_gateway_unreachable"}); }
  }
  async list(ctx:AuthContext) {
    this.admin(ctx);
    const p=await this.db.pool.query("SELECT id FROM providers WHERE key=$1 LIMIT 1",["whatsapp_linked_device"]);
    if(!p.rowCount) return [];
    const r=await this.db.pool.query("SELECT id,label,state,routing_eligible,priority,last_activity_at,last_error,created_at FROM whatsapp_devices WHERE provider_id=$1 ORDER BY created_at",[p.rows[0].id]);
    return r.rows.map(x=>({...x,session_encrypted:undefined}));
  }
  async create(ctx:AuthContext,input:unknown,ip?:string) {
    this.admin(ctx);
    const b=input&&typeof input==="object"?input as Record<string,unknown>:{};
    const label=typeof b.label==="string"?b.label.trim():"";
    if(label.length<2||label.length>80) throw new BadRequestException({error:"validation_failed",fields:{label:"2-80 characters required"}});
    const p=await this.db.pool.query("SELECT id FROM providers WHERE key='whatsapp_linked_device' LIMIT 1");
    if(!p.rowCount) throw new ServiceUnavailableException({error:"whatsapp_provider_not_initialized"});
    const r=await this.db.pool.query("INSERT INTO whatsapp_devices(provider_id,label,state,routing_eligible) VALUES($1,$2,'disconnected',false) RETURNING id,label,state,created_at",[p.rows[0].id,label]);
    try { await this.call("/admin/devices/"+r.rows[0].id+"/reconnect","POST"); }
    catch(e) { await this.db.pool.query("DELETE FROM whatsapp_devices WHERE id=$1",[r.rows[0].id]); throw e; }
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_device.created",subjectType:"whatsapp_device",subjectId:r.rows[0].id,ip:ip??null,meta:{label}});
    return r.rows[0];
  }
  async qr(ctx:AuthContext,id:string) {
    this.admin(ctx); if(!isUuid(id)) throw new NotFoundException({error:"not_found"});
    const exists=await this.db.pool.query("SELECT id FROM whatsapp_devices WHERE id=$1",[id]);
    if(!exists.rowCount) throw new NotFoundException({error:"not_found"});
    return this.call("/admin/devices/"+id+"/qr");
  }
  async reconnect(ctx:AuthContext,id:string,ip?:string) {
    this.admin(ctx); if(!isUuid(id)) throw new NotFoundException({error:"not_found"});
    const exists=await this.db.pool.query("SELECT id FROM whatsapp_devices WHERE id=$1",[id]);
    if(!exists.rowCount) throw new NotFoundException({error:"not_found"});
    const result=await this.call("/admin/devices/"+id+"/reconnect","POST");
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_device.reconnect",subjectType:"whatsapp_device",subjectId:id,ip:ip??null});
    return result;
  }
  async remove(ctx:AuthContext,id:string,ip?:string) {
    this.admin(ctx); if(!isUuid(id)) throw new NotFoundException({error:"not_found"});
    const exists=await this.db.pool.query("SELECT id,label FROM whatsapp_devices WHERE id=$1",[id]);
    if(!exists.rowCount) throw new NotFoundException({error:"not_found"});
    await this.call("/admin/devices/"+id,"DELETE");
    await this.db.pool.query("DELETE FROM whatsapp_devices WHERE id=$1",[id]);
    await writeAudit(this.db.pool,{actorId:ctx.userId,action:"whatsapp_device.deleted",subjectType:"whatsapp_device",subjectId:id,ip:ip??null,meta:{label:exists.rows[0].label}});
    return {ok:true};
  }
}
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
@Injectable()
export class NotificationsService {
 constructor(private readonly db:DbService){}
 private user(ctx:AuthContext){if(!ctx.userId)throw new ForbiddenException({error:"forbidden"});return ctx.userId;}
 async list(ctx:AuthContext){
  const userId=this.user(ctx);
  const r=await this.db.pool.query("SELECT id,kind,title,body,read_at,created_at FROM notifications WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 50",[userId]);
  return r.rows.map(x=>({id:x.id as string,kind:x.kind as string,title:x.title as string,body:x.body as string|null,readAt:x.read_at,createdAt:x.created_at}));
 }
 async markRead(ctx:AuthContext,id:string){
  const userId=this.user(ctx);
  if(!isUuid(id))throw new NotFoundException({error:"not_found"});
  const r=await this.db.pool.query("UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1::uuid AND user_id=$2::uuid RETURNING id",[id,userId]);
  if(!r.rows[0])throw new NotFoundException({error:"not_found"});
  return {ok:true};
 }
}

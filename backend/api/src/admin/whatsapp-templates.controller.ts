import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { WhatsAppTemplatesService } from "./whatsapp-templates.service";

@Controller()
@UseGuards(AuthGuard)
export class WhatsAppTemplatesController {
  constructor(private readonly s: WhatsAppTemplatesService) {}
  @Get("v1/console/projects/:id/whatsapp-templates") catalog(@Param("id") id:string,@Req() r:AuthedRequest){return this.s.catalog(r.auth!,id);}
  @Post("v1/console/projects/:id/whatsapp-templates") @HttpCode(201) submit(@Param("id") id:string,@Body() b:unknown,@Req() r:AuthedRequest){return this.s.submit(r.auth!,id,b,r.ip??null);}
  @Post("v1/console/projects/:id/whatsapp-templates/:templateId/select") select(@Param("id") id:string,@Param("templateId") tid:string,@Req() r:AuthedRequest){return this.s.select(r.auth!,id,tid,r.ip??null);}
  @Get("v1/admin/whatsapp-templates") adminList(@Query("status") status:string|undefined,@Req() r:AuthedRequest){return this.s.adminList(r.auth!,status??"pending");}
  @Post("v1/admin/whatsapp-templates") @HttpCode(201) create(@Body() b:unknown,@Req() r:AuthedRequest){return this.s.createApproved(r.auth!,b,r.ip??null);}
  @Post("v1/admin/whatsapp-templates/:id/decision") decide(@Param("id") id:string,@Body() b:unknown,@Req() r:AuthedRequest){return this.s.decide(r.auth!,id,b,r.ip??null);}
}

import { Controller,Get,HttpCode,Param,Post,Req,UseGuards } from "@nestjs/common";
import { AuthGuard,type AuthedRequest } from "../auth/auth.guard";
import { NotificationsService } from "./notifications.service";
@Controller("v1/console/notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
 constructor(private readonly service:NotificationsService){}
 @Get() list(@Req() req:AuthedRequest){return this.service.list(req.auth!);}
 @Post(":id/read") @HttpCode(200) markRead(@Param("id") id:string,@Req() req:AuthedRequest){return this.service.markRead(req.auth!,id);}
}

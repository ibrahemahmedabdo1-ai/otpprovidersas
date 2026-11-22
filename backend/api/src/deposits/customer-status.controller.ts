import { Body,Controller,Get,HttpCode,Post,Req,UseGuards } from "@nestjs/common";
import { AuthGuard,type AuthedRequest } from "../auth/auth.guard";
import { TopupWorkflowService } from "./topup-workflow.service";
@Controller("v1/console")
@UseGuards(AuthGuard)
export class CustomerStatusController {
 constructor(private readonly service:TopupWorkflowService){}
 @Get("status") status(@Req() req:AuthedRequest){return this.service.accountStatus(req.auth!);}
 @Get("verification") verification(@Req() req:AuthedRequest){return this.service.getVerification(req.auth!);}
 @Post("verification") @HttpCode(202) submit(@Body() body:unknown,@Req() req:AuthedRequest){return this.service.submitVerification(req.auth!,body,req.ip);}
}

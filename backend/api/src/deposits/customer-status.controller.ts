import { Controller,Get,Req,UseGuards } from "@nestjs/common";
import { AuthGuard,type AuthedRequest } from "../auth/auth.guard";
import { TopupWorkflowService } from "./topup-workflow.service";
@Controller("v1/console")
@UseGuards(AuthGuard)
export class CustomerStatusController {
 constructor(private readonly service:TopupWorkflowService){}
 @Get("status") status(@Req() req:AuthedRequest){return this.service.accountStatus(req.auth!);}
}

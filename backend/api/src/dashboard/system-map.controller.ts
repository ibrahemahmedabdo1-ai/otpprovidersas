import { Controller,Get,Req,UseGuards } from "@nestjs/common";
import { AuthGuard,type AuthedRequest } from "../auth/auth.guard";
import { SystemMapService } from "./system-map.service";
@Controller("v1/dashboard/system")
@UseGuards(AuthGuard)
export class SystemMapController {
 constructor(private readonly service:SystemMapService){}
 @Get() snapshot(@Req() req:AuthedRequest){return this.service.snapshot(req.auth!);}
}

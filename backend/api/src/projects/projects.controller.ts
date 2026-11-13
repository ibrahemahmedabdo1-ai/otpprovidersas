import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { ProjectsService } from "./projects.service";

/** Customer dashboard API (cookie or bearer session). Developer OTP calls use API keys instead. */
@Controller("v1/console/projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get() list(@Req() req: AuthedRequest) { return this.projects.list(req.auth!); }
  @Post() create(@Body() body: unknown, @Req() req: AuthedRequest) { return this.projects.create(req.auth!, body, req.ip); }

  @Get(":id/keys") listKeys(@Param("id") id: string, @Req() req: AuthedRequest) { return this.projects.listKeys(req.auth!, id); }
  @Post(":id/keys") createKey(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.projects.createKey(req.auth!, id, body, req.ip); }
  @Delete(":id/keys/:keyId") @HttpCode(204)
  async revokeKey(@Param("id") id: string, @Param("keyId") keyId: string, @Req() req: AuthedRequest) { await this.projects.revokeKey(req.auth!, id, keyId, req.ip); }
}

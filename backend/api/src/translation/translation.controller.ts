import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthedRequest } from "../auth/auth.guard";
import { TicketsService } from "../tickets/tickets.service";
import { TranslationService } from "./translation.service";
import { PreferencesService } from "./preferences.service";

@Controller("v1/support/translation")
@UseGuards(AuthGuard)
export class SupportTranslationController {
  constructor(private readonly tr: TranslationService, private readonly tickets: TicketsService) {}
  @Get() status(@Req() req: AuthedRequest) { return this.tr.status(req.auth!); }
  @Patch() prefs(@Body() body: unknown, @Req() req: AuthedRequest) { return this.tr.setPrefs(req.auth!, body, req.ip); }
  @Post("tickets/:id/settings") @HttpCode(200) ticket(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.tr.setTicket(req.auth!, id, body, req.ip); }
  @Post("tickets/:id/translate") @HttpCode(200) inbound(@Param("id") id: string, @Req() req: AuthedRequest) { return this.tr.translateInbound(req.auth!, id); }
  /** Saves the staff reply first, then translates it for the customer. A translation problem never blocks the reply. */
  @Post("tickets/:id/reply") @HttpCode(200) async reply(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const saved = await this.tickets.staffPost(req.auth!, id, false, body, req.ip);
    const text = String((body as { body?: unknown } | null)?.body ?? "").trim();
    const t = await this.tr.translateOutbound(req.auth!, id, saved.id, text).catch(() => ({ translated: false, skipped: "error" as string }));
    return { ok: true, translated: t.translated, translationSkipped: t.skipped ?? null };
  }
}

@Controller("v1/admin/translation")
@UseGuards(AuthGuard)
export class AdminTranslationController {
  constructor(private readonly tr: TranslationService) {}
  @Get() overview(@Req() req: AuthedRequest) { return this.tr.adminOverview(req.auth!); }
  @Patch() update(@Body() body: unknown, @Req() req: AuthedRequest) { return this.tr.adminUpdate(req.auth!, body, req.ip); }
  @Patch("agents/:id") agent(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthedRequest) { return this.tr.adminAgent(req.auth!, id, body, req.ip); }
  @Post("test") @HttpCode(200) test(@Req() req: AuthedRequest) { return this.tr.adminTest(req.auth!); }
}

/** The signed-in user's saved interface language. Persisted in users.locale so it follows them across devices and sessions. */
@Controller("v1/preferences")
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(private readonly prefs: PreferencesService) {}
  @Get() get(@Req() req: AuthedRequest) { return this.prefs.get(req.auth!); }
  @Put("locale") @HttpCode(200) set(@Body() body: unknown, @Req() req: AuthedRequest) { return this.prefs.setLocale(req.auth!, body, req.ip); }
}

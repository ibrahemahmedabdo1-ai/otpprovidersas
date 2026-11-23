import { BadRequestException, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { isLang, LANGS } from "./core";

@Injectable()
export class PreferencesService {
  constructor(private readonly db: DbService) {}
  async get(ctx: AuthContext) {
    const r = await this.db.pool.query("SELECT locale FROM users WHERE id = $1::uuid", [ctx.userId]);
    return { locale: isLang(r.rows[0]?.locale) ? (r.rows[0].locale as string) : "en" };
  }
  async setLocale(ctx: AuthContext, body: unknown, ip: string | undefined) {
    const l = (body as { locale?: unknown } | null)?.locale;
    if (!isLang(l)) throw new BadRequestException({ error: "validation_failed", fields: { locale: LANGS.join(", ") } });
    await this.db.tx(async (c) => {
      await c.query("UPDATE users SET locale = $2::text WHERE id = $1::uuid", [ctx.userId, l]);
      await writeAudit(c, { actorId: ctx.userId, action: "preferences.locale", subjectType: "user", subjectId: ctx.userId, ip: cleanIp(ip), meta: { locale: l } });
    });
    return { locale: l };
  }
}

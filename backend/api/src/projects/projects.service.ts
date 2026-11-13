import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import type { AuthContext } from "../auth/auth.service";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { newApiKey } from "../common/crypto";
import { isUuid } from "../auth/validators";
import { parseProjectName } from "./project-rules";

const MAX_PROJECTS = 20;
const MAX_ACTIVE_KEYS = 10;

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  private org(ctx: AuthContext): string {
    if (ctx.role !== "customer" || !ctx.organizationId) throw new ForbiddenException({ error: "forbidden" });
    return ctx.organizationId;
  }
  /** Every lookup is scoped by the caller's organization: another tenant's project id behaves like a missing one (no IDOR). */
  private async ownProject(orgId: string, projectId: string): Promise<void> {
    if (!isUuid(projectId)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query("SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2", [projectId, orgId]);
    if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
  }

  async list(ctx: AuthContext) {
    const r = await this.db.pool.query(
      `SELECT p.id, p.name, p.email_enabled, p.whatsapp_enabled, p.otp_length, p.otp_ttl_seconds, p.max_attempts, p.resend_cooldown_seconds, p.daily_limit, p.created_at,
              (SELECT count(*)::int FROM api_keys k WHERE k.project_id = p.id AND k.revoked_at IS NULL) AS active_keys
       FROM projects p WHERE p.organization_id = $1 ORDER BY p.created_at DESC`, [this.org(ctx)]);
    return r.rows.map((p) => ({
      id: p.id as string, name: p.name as string, createdAt: p.created_at, activeKeys: p.active_keys as number,
      channels: { email: p.email_enabled as boolean, whatsapp: p.whatsapp_enabled as boolean },
      otp: { length: p.otp_length as number, ttlSeconds: p.otp_ttl_seconds as number, maxAttempts: p.max_attempts as number, resendCooldownSeconds: p.resend_cooldown_seconds as number },
      dailyLimit: p.daily_limit as number | null,
    }));
  }

  async create(ctx: AuthContext, body: unknown, ip: string | undefined) {
    const orgId = this.org(ctx);
    const name = parseProjectName((body as { name?: unknown } | null)?.name);
    if (!name.ok) throw new BadRequestException({ error: "validation_failed", message: name.error });
    const count = await this.db.pool.query("SELECT count(*)::int AS n FROM projects WHERE organization_id = $1", [orgId]);
    if (count.rows[0].n >= MAX_PROJECTS) throw new ForbiddenException({ error: "project_limit_reached" });
    try {
      return await this.db.tx(async (c) => {
        const r = await c.query("INSERT INTO projects(organization_id, name) VALUES ($1,$2) RETURNING id, name, created_at", [orgId, name.value]);
        await writeAudit(c, { actorId: ctx.userId, action: "project.create", subjectType: "project", subjectId: r.rows[0].id, ip: cleanIp(ip) });
        return { id: r.rows[0].id as string, name: r.rows[0].name as string, createdAt: r.rows[0].created_at };
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new ConflictException({ error: "name_taken" });
      throw e;
    }
  }

  async createKey(ctx: AuthContext, projectId: string, body: unknown, ip: string | undefined) {
    const orgId = this.org(ctx);
    await this.ownProject(orgId, projectId);
    const mode = (body as { mode?: unknown } | null)?.mode;
    if (mode !== "test" && mode !== "live") throw new BadRequestException({ error: "validation_failed", message: "mode must be 'test' or 'live'" });
    // Live keys are issued only after customer verification and provider activation exist (later phase).
    if (mode === "live") throw new ForbiddenException({ error: "live_mode_not_enabled", message: "Live keys are not available yet. Create a test key." });
    const active = await this.db.pool.query("SELECT count(*)::int AS n FROM api_keys WHERE project_id = $1 AND revoked_at IS NULL", [projectId]);
    if (active.rows[0].n >= MAX_ACTIVE_KEYS) throw new ForbiddenException({ error: "key_limit_reached" });

    const k = newApiKey(mode, this.cfg.apiKeyPepper);
    return this.db.tx(async (c) => {
      const r = await c.query("INSERT INTO api_keys(project_id, mode, prefix, key_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at", [projectId, mode, k.prefix, k.hash, ctx.userId]);
      await writeAudit(c, { actorId: ctx.userId, action: "api_key.create", subjectType: "api_key", subjectId: r.rows[0].id, ip: cleanIp(ip), meta: { projectId, mode, prefix: k.prefix } });
      return { id: r.rows[0].id as string, mode, prefix: k.prefix, createdAt: r.rows[0].created_at, key: k.key, warning: "Copy this key now. It is shown only once and cannot be retrieved later." };
    });
  }

  async listKeys(ctx: AuthContext, projectId: string) {
    await this.ownProject(this.org(ctx), projectId);
    const r = await this.db.pool.query("SELECT id, mode, prefix, last_used_at, revoked_at, created_at FROM api_keys WHERE project_id = $1 ORDER BY created_at DESC", [projectId]);
    return r.rows.map((k) => ({ id: k.id as string, mode: k.mode as string, prefix: k.prefix as string, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at, createdAt: k.created_at }));
  }

  async revokeKey(ctx: AuthContext, projectId: string, keyId: string, ip: string | undefined) {
    const orgId = this.org(ctx);
    if (!isUuid(projectId) || !isUuid(keyId)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query(
      `UPDATE api_keys k SET revoked_at = now() FROM projects p
       WHERE k.id = $1 AND k.project_id = $2 AND p.id = k.project_id AND p.organization_id = $3 AND k.revoked_at IS NULL RETURNING k.id`, [keyId, projectId, orgId]);
    if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
    await writeAudit(this.db.pool, { actorId: ctx.userId, action: "api_key.revoke", subjectType: "api_key", subjectId: keyId, ip: cleanIp(ip), meta: { projectId } });
  }
}

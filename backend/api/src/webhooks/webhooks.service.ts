import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";
import { cleanIp } from "../common/ip";
import { decryptString, encryptString } from "../common/crypto";
import { CONFIG } from "../tokens";
import type { AppConfig } from "../config";
import { isSafeWebhookUrl, resolvesToPublicOnly } from "./ssrf";
import { nextDelaySeconds, signWebhook } from "./signing";

export const WEBHOOK_EVENTS = ["otp.delivered", "otp.failed", "otp.verified"] as const;
const MAX_PER_PROJECT = 5;

/** Queues one delivery per active, subscribed webhook of the project. Never includes recipients or codes. Call inside the caller's transaction. */
export async function enqueueWebhookEvent(c: Pick<PoolClient, "query">, projectId: string, type: string, data: Record<string, unknown>): Promise<void> {
  await c.query(
    `INSERT INTO webhook_deliveries(webhook_id, event_type, payload)
     SELECT w.id, $2::text, jsonb_build_object('type', $2::text, 'createdAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'data', $3::jsonb)
     FROM webhooks w WHERE w.project_id = $1::uuid AND w.active AND $2::text = ANY(w.events)`, [projectId, type, JSON.stringify(data)]);
}

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Webhooks");
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly db: DbService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test" || process.env.SCHEDULER_DISABLED === "1") return;
    this.timer = setInterval(() => { void this.deliverDue(); }, 15_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private org(ctx: AuthContext): string {
    if (ctx.role !== "customer" || !ctx.organizationId) throw new ForbiddenException({ error: "forbidden" });
    return ctx.organizationId;
  }
  private async own(ctx: AuthContext, projectId: string): Promise<void> {
    if (!isUuid(projectId)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query("SELECT 1 FROM projects WHERE id = $1::uuid AND organization_id = $2::uuid", [projectId, this.org(ctx)]);
    if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
  }
  private async ownHook(ctx: AuthContext, projectId: string, hookId: string): Promise<void> {
    await this.own(ctx, projectId);
    if (!isUuid(hookId)) throw new NotFoundException({ error: "not_found" });
    const r = await this.db.pool.query("SELECT 1 FROM webhooks WHERE id = $1::uuid AND project_id = $2::uuid", [hookId, projectId]);
    if (!r.rows[0]) throw new NotFoundException({ error: "not_found" });
  }

  async list(ctx: AuthContext, projectId: string) {
    await this.own(ctx, projectId);
    const r = await this.db.pool.query("SELECT id, url, events, active, created_at FROM webhooks WHERE project_id = $1::uuid ORDER BY created_at DESC", [projectId]);
    return r.rows.map((w) => ({ id: w.id as string, url: w.url as string, events: w.events as string[], active: w.active as boolean, createdAt: w.created_at }));
  }

  async create(ctx: AuthContext, projectId: string, body: unknown, ip: string | undefined) {
    await this.own(ctx, projectId);
    const b = (body ?? {}) as Record<string, unknown>;
    const url = typeof b.url === "string" ? b.url.trim() : "";
    if (!isSafeWebhookUrl(url)) throw new BadRequestException({ error: "validation_failed", fields: { url: "A public https URL is required." } });
    let events: string[] = [...WEBHOOK_EVENTS];
    if (b.events !== undefined) {
      if (!Array.isArray(b.events) || b.events.length === 0 || !b.events.every((e) => typeof e === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(e)))
        throw new BadRequestException({ error: "validation_failed", fields: { events: WEBHOOK_EVENTS.join(", ") } });
      events = [...new Set(b.events as string[])];
    }
    const secret = "whsec_" + randomBytes(24).toString("base64url");
    return this.db.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [`webhooks:${projectId}`]);
      const n = await c.query("SELECT count(*)::int AS n FROM webhooks WHERE project_id = $1::uuid", [projectId]);
      if ((n.rows[0]?.n as number) >= MAX_PER_PROJECT) throw new ConflictException({ error: "webhook_limit_reached" });
      const r = await c.query("INSERT INTO webhooks(project_id, url, secret_encrypted, events) VALUES ($1::uuid,$2::text,$3::text,$4::text[]) RETURNING id", [projectId, url, encryptString(secret, this.cfg.encryptionKey), events]);
      await writeAudit(c, { actorId: ctx.userId, action: "webhook.created", subjectType: "webhook", subjectId: r.rows[0].id as string, ip: cleanIp(ip) });
      return { id: r.rows[0].id as string, url: url, events, secret };   // the secret is shown once
    });
  }

  async remove(ctx: AuthContext, projectId: string, hookId: string, ip: string | undefined) {
    await this.ownHook(ctx, projectId, hookId);
    await this.db.tx(async (c) => {
      await c.query("DELETE FROM webhooks WHERE id = $1::uuid", [hookId]);
      await writeAudit(c, { actorId: ctx.userId, action: "webhook.deleted", subjectType: "webhook", subjectId: hookId, ip: cleanIp(ip) });
    });
  }

  async sendTest(ctx: AuthContext, projectId: string, hookId: string) {
    await this.ownHook(ctx, projectId, hookId);
    const r = await this.db.pool.query(
      `INSERT INTO webhook_deliveries(webhook_id, event_type, payload) VALUES ($1::uuid, 'webhook.test', jsonb_build_object('type','webhook.test','data', jsonb_build_object('note','This is a test event.'))) RETURNING id`, [hookId]);
    return { deliveryId: r.rows[0].id as string, status: "pending" };
  }

  async deliveries(ctx: AuthContext, projectId: string, hookId: string) {
    await this.ownHook(ctx, projectId, hookId);
    const r = await this.db.pool.query("SELECT id, event_type, status, attempts, last_status_code, last_error, created_at FROM webhook_deliveries WHERE webhook_id = $1::uuid ORDER BY created_at DESC LIMIT 50", [hookId]);
    return r.rows.map((d) => ({ id: d.id as string, type: d.event_type as string, status: d.status as string, attempts: d.attempts as number, lastStatusCode: (d.last_status_code as number | null) ?? null, lastError: (d.last_error as string | null) ?? null, createdAt: d.created_at }));
  }

  /** Claims due deliveries with SKIP LOCKED so several instances never send the same one twice at once. */
  async deliverDue(): Promise<void> {
    try {
      const due = await this.db.tx(async (c) => {
        const r = await c.query(
          `SELECT d.id, d.payload, d.attempts, w.url, w.secret_encrypted FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
           WHERE d.status = 'pending' AND d.next_attempt_at <= now() ORDER BY d.next_attempt_at LIMIT 10 FOR UPDATE OF d SKIP LOCKED`);
        // push the schedule forward so a crash mid-send is retried later, not immediately by another instance
        if (r.rows.length) await c.query("UPDATE webhook_deliveries SET next_attempt_at = now() + interval '2 minutes' WHERE id = ANY($1::uuid[])", [r.rows.map((x) => x.id)]);
        return r.rows;
      });
      for (const d of due) await this.attempt(d.id as string, d.url as string, d.secret_encrypted as string, d.payload as unknown, d.attempts as number);
    } catch (e) {
      this.log.error(`deliverDue failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  private async attempt(id: string, url: string, secretEnc: string, payload: unknown, attempts: number): Promise<void> {
    let status: number | null = null;
    let error: string | null = null;
    try {
      const u = new URL(url);
      if (!isSafeWebhookUrl(url) || !(await resolvesToPublicOnly(u.hostname))) throw new Error("target_not_public");
      const body = JSON.stringify({ id, ...(payload as object) });
      const res = await fetch(url, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(8_000),
        headers: { "content-type": "application/json", "user-agent": "OTPProvider-Webhooks/1", "x-otpprovider-signature": signWebhook(decryptString(secretEnc, this.cfg.encryptionKey), body), "x-otpprovider-delivery": id },
        body,
      });
      status = res.status;
      if (res.status < 200 || res.status >= 300) error = `http_${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 120) : "error";
    }
    const made = attempts + 1;
    if (!error) {
      await this.db.pool.query("UPDATE webhook_deliveries SET status = 'delivered', attempts = $2::int, last_status_code = $3::int, last_error = NULL WHERE id = $1::uuid", [id, made, status]);
      return;
    }
    const delay = nextDelaySeconds(made);
    if (delay === null) await this.db.pool.query("UPDATE webhook_deliveries SET status = 'dead', attempts = $2::int, last_status_code = $3::int, last_error = $4::text WHERE id = $1::uuid", [id, made, status, error]);
    else await this.db.pool.query("UPDATE webhook_deliveries SET attempts = $2::int, last_status_code = $3::int, last_error = $4::text, next_attempt_at = now() + make_interval(secs => $5::int) WHERE id = $1::uuid", [id, made, status, error, delay]);
  }
}

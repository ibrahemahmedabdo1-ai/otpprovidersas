import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";
import { DbService } from "../db.service";

type Device = { id: string; label: string; state: string; routing_eligible: boolean; priority: number; last_activity_at: string | null; last_error: string | null; created_at: string };
@Injectable()
export class WhatsappDevicesService {
  constructor(private readonly db: DbService) {}
  private read(c: AuthContext) { if (!["super_admin", "admin_staff"].includes(c.role)) throw new ForbiddenException({ error: "forbidden" }); }
  private mutate(c: AuthContext) { if (c.role !== "super_admin") throw new ForbiddenException({ error: "forbidden" }); }
  private id(v: string) { if (!isUuid(v)) throw new NotFoundException({ error: "not_found" }); return v; }
  private async gateway(path: string, method = "GET", body?: unknown) {
    const base = (process.env.WHATSAPP_GATEWAY_URL ?? "").replace(/\/+$/, "");
    const token = process.env.WHATSAPP_GATEWAY_ADMIN_TOKEN ?? "";
    if (!base || token.length < 32) throw new ServiceUnavailableException({ error: "whatsapp_gateway_not_configured" });
    let response: Response;
    try {
      response = await fetch(base + path, { method, headers: { authorization: "Bearer " + token, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000), cache: "no-store" });
    } catch { throw new ServiceUnavailableException({ error: "whatsapp_gateway_unreachable" }); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) throw new NotFoundException({ error: "whatsapp_device_not_found" });
      if (response.status === 400) throw new BadRequestException({ error: (data as any).error ?? "gateway_rejected_request" });
      if (response.status === 423 || response.status === 503) throw new ServiceUnavailableException({ error: (data as any).error ?? "whatsapp_gateway_unavailable" });
      throw new BadGatewayException({ error: "whatsapp_gateway_request_failed", status: response.status });
    }
    return data;
  }
  async list(c: AuthContext) {
    this.read(c);
    const r = await this.db.pool.query("SELECT id,label,state,routing_eligible,priority,last_activity_at,last_error,created_at FROM whatsapp_devices ORDER BY created_at ASC");
    return r.rows.map((d: Device) => ({ id: d.id, label: d.label, state: d.state, routingEligible: d.routing_eligible, priority: d.priority, lastActivityAt: d.last_activity_at, lastError: d.last_error, createdAt: d.created_at }));
  }
  async create(c: AuthContext, body: unknown, ip: string | null) {
    this.mutate(c);
    const label = typeof (body as any)?.label === "string" ? (body as any).label.trim() : "";
    if (label.length < 2 || label.length > 80) throw new BadRequestException({ error: "validation_failed", fields: { label: "2-80 characters required" } });
    const d = await this.gateway("/admin/devices", "POST", { label }) as any;
    await writeAudit(this.db.pool, { actorId: c.userId, action: "whatsapp_device.created", subjectType: "whatsapp_device", subjectId: String(d.id), ip, meta: { label } });
    return { id: d.id, label: d.label, state: d.state ?? "starting" };
  }
  async rename(c: AuthContext, idRaw: string, body: unknown, ip: string | null) {
    this.mutate(c); const id = this.id(idRaw);
    const label = typeof (body as any)?.label === "string" ? (body as any).label.trim() : "";
    if (label.length < 2 || label.length > 80) throw new BadRequestException({ error: "validation_failed", fields: { label: "2-80 characters required" } });
    await this.gateway("/admin/devices/" + id, "PATCH", { label });
    await writeAudit(this.db.pool, { actorId: c.userId, action: "whatsapp_device.renamed", subjectType: "whatsapp_device", subjectId: id, ip, meta: { label } });
    return { ok: true, id, label };
  }
  async qr(c: AuthContext, idRaw: string) {
    this.read(c); const id = this.id(idRaw);
    const data = await this.gateway("/admin/devices/" + id + "/qr") as any;
    return { state: data.state, qr: data.qr ?? null, error: data.error ?? null };
  }
  async reconnect(c: AuthContext, idRaw: string, ip: string | null) {
    this.mutate(c); const id = this.id(idRaw);
    const result = await this.gateway("/admin/devices/" + id + "/reconnect", "POST");
    await writeAudit(this.db.pool, { actorId: c.userId, action: "whatsapp_device.reconnect_requested", subjectType: "whatsapp_device", subjectId: id, ip });
    return result;
  }
  async remove(c: AuthContext, idRaw: string, ip: string | null) {
    this.mutate(c); const id = this.id(idRaw);
    const found = await this.db.pool.query("SELECT id FROM whatsapp_devices WHERE id=$1::uuid", [id]);
    if (!found.rowCount) throw new NotFoundException({ error: "not_found" });
    await this.gateway("/admin/devices/" + id, "DELETE");
    await writeAudit(this.db.pool, { actorId: c.userId, action: "whatsapp_device.deleted", subjectType: "whatsapp_device", subjectId: id, ip });
    return { ok: true };
  }
}

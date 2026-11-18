import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid } from "../auth/validators";
import { writeAudit } from "../common/audit";

const bad = (fields: Record<string, string>): never => { throw new BadRequestException({ error: "validation_failed", fields }); };
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === "object" ? (b as Record<string, unknown>) : {});
const int = (v: unknown, f: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad({ [f]: `integer ${min}-${max} required` });
  return v as number;
};

/** Pricing, packages, providers and account status. Every change is audited; activation and money-affecting steps need a Super Admin. */
@Injectable()
export class CatalogService {
  constructor(private readonly db: DbService) {}
  private staff(c: AuthContext) { if (c.role !== "super_admin" && c.role !== "admin_staff") throw new ForbiddenException({ error: "forbidden" }); }
  private sup(c: AuthContext) { if (c.role !== "super_admin") throw new ForbiddenException({ error: "forbidden" }); }
  private id(v: string) { if (!isUuid(v)) throw new NotFoundException({ error: "not_found" }); return v; }

  async packages(c: AuthContext) {
    this.staff(c);
    const r = await this.db.pool.query("SELECT id, name, price_micro_usd, credit_micro_usd, active, commercially_approved, created_at FROM packages ORDER BY created_at DESC");
    return r.rows.map((p) => ({ id: p.id, name: p.name, priceMicroUsd: String(p.price_micro_usd), creditMicroUsd: String(p.credit_micro_usd), active: p.active, approved: p.commercially_approved, createdAt: p.created_at }));
  }
  async createPackage(c: AuthContext, body: unknown, ip: string | null) {
    this.staff(c);
    const b = obj(body);
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (name.length < 2 || name.length > 80) bad({ name: "2-80 characters required" });
    const price = int(b.priceUsd, "priceUsd", 1, 100000), credit = int(b.creditUsd, "creditUsd", 1, 100000);
    const r = await this.db.pool.query("INSERT INTO packages(name, price_micro_usd, credit_micro_usd) VALUES ($1,$2,$3) RETURNING id", [name, price * 1_000_000, credit * 1_000_000]);
    await writeAudit(this.db.pool, { actorId: c.userId, action: "package.created", subjectType: "package", subjectId: r.rows[0].id, ip, meta: { name, price, credit } });
    return { id: r.rows[0].id as string };
  }
  async setPackage(c: AuthContext, idRaw: string, body: unknown, ip: string | null) {
    this.sup(c); const id = this.id(idRaw); const b = obj(body);
    if (typeof b.active !== "boolean") bad({ active: "boolean required" });
    const active = b.active as boolean;
    const r = await this.db.pool.query("UPDATE packages SET active=$2, commercially_approved = commercially_approved OR $2 WHERE id=$1 RETURNING id", [id, active]);
    if (!r.rowCount) throw new NotFoundException({ error: "not_found" });
    await writeAudit(this.db.pool, { actorId: c.userId, action: active ? "package.activated" : "package.deactivated", subjectType: "package", subjectId: id, ip });
    return { ok: true };
  }

  async prices(c: AuthContext) {
    this.staff(c);
    const r = await this.db.pool.query("SELECT id, channel, country, unit_price_micro_usd, version, status, effective_from, created_at FROM prices ORDER BY channel, country, version DESC LIMIT 200");
    return r.rows.map((p) => ({ id: p.id, channel: p.channel, country: p.country, unitPriceMicroUsd: String(p.unit_price_micro_usd), version: p.version, status: p.status, effectiveFrom: p.effective_from, createdAt: p.created_at }));
  }
  async createPrice(c: AuthContext, body: unknown, ip: string | null) {
    this.staff(c); const b = obj(body);
    const channel = b.channel; if (channel !== "email" && channel !== "whatsapp") bad({ channel: "email or whatsapp" });
    const country = typeof b.country === "string" ? b.country.trim().toUpperCase() : "*";
    if (country !== "*" && !/^[A-Z]{2}$/.test(country)) bad({ country: "* or two letters" });
    const micro = int(b.unitPriceMicroUsd, "unitPriceMicroUsd", 0, 10_000_000);
    const r = await this.db.pool.query(
      "INSERT INTO prices(channel,country,unit_price_micro_usd,version) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(version),0)+1 FROM prices WHERE channel=$1 AND country=$2)) RETURNING id, version", [channel, country, micro]);
    await writeAudit(this.db.pool, { actorId: c.userId, action: "price.proposed", subjectType: "price", subjectId: r.rows[0].id, ip, meta: { channel, country, micro } });
    return { id: r.rows[0].id as string, version: r.rows[0].version as number };
  }
  async approvePrice(c: AuthContext, idRaw: string, ip: string | null) {
    this.sup(c); const id = this.id(idRaw);
    const cl = await this.db.pool.connect();
    try {
      await cl.query("BEGIN");
      const p = await cl.query("SELECT channel, country, status FROM prices WHERE id=$1 FOR UPDATE", [id]);
      if (!p.rowCount) throw new NotFoundException({ error: "not_found" });
      if (p.rows[0].status !== "pending_approval") throw new ConflictException({ error: "price_not_pending" });
      await cl.query("UPDATE prices SET status='retired' WHERE channel=$1 AND country=$2 AND status='active'", [p.rows[0].channel, p.rows[0].country]);
      await cl.query("UPDATE prices SET status='active', approved_by=$2, effective_from=now() WHERE id=$1", [id, c.userId]);
      await writeAudit(cl, { actorId: c.userId, action: "price.approved", subjectType: "price", subjectId: id, ip });
      await cl.query("COMMIT");
    } catch (e) { await cl.query("ROLLBACK").catch(() => undefined); throw e; } finally { cl.release(); }
    return { ok: true };
  }

  async providers(c: AuthContext) {
    this.staff(c);
    const r = await this.db.pool.query("SELECT id, key, channel, kind, enabled, maintenance, priority, weight, cost_micro_usd FROM providers ORDER BY channel, priority");
    return r.rows.map((p) => ({ id: p.id, key: p.key, channel: p.channel, kind: p.kind, enabled: p.enabled, maintenance: p.maintenance, priority: p.priority, weight: p.weight, costMicroUsd: String(p.cost_micro_usd) }));
  }
  async setProvider(c: AuthContext, idRaw: string, body: unknown, ip: string | null) {
    this.sup(c); const id = this.id(idRaw); const b = obj(body);
    const sets: string[] = []; const vals: unknown[] = [id];
    for (const k of ["enabled", "maintenance"] as const) if (k in b) { if (typeof b[k] !== "boolean") bad({ [k]: "boolean" }); vals.push(b[k]); sets.push(`${k}=$${vals.length}`); }
    if ("priority" in b) { vals.push(int(b.priority, "priority", 0, 10000)); sets.push(`priority=$${vals.length}`); }
    if ("weight" in b) { vals.push(int(b.weight, "weight", 0, 10000)); sets.push(`weight=$${vals.length}`); }
    if (!sets.length) bad({ body: "nothing to change" });
    const r = await this.db.pool.query(`UPDATE providers SET ${sets.join(",")}, updated_at=now() WHERE id=$1 RETURNING key`, vals);
    if (!r.rowCount) throw new NotFoundException({ error: "not_found" });
    await writeAudit(this.db.pool, { actorId: c.userId, action: "provider.updated", subjectType: "provider", subjectId: id, ip, meta: { key: r.rows[0].key, ...b } });
    return { ok: true };
  }

  async setUserStatus(c: AuthContext, idRaw: string, body: unknown, ip: string | null) {
    this.sup(c); const id = this.id(idRaw); const b = obj(body);
    if (b.status !== "active" && b.status !== "suspended") bad({ status: "active or suspended" });
    if (id === c.userId) throw new ForbiddenException({ error: "cannot_change_own_status" });
    const r = await this.db.pool.query("UPDATE users SET status=$2 WHERE id=$1 AND role <> 'super_admin' AND status IN ('active','suspended') RETURNING id", [id, b.status]);
    if (!r.rowCount) throw new NotFoundException({ error: "not_found" });
    if (b.status === "suspended") await this.db.pool.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [id]).catch(() => undefined);
    await writeAudit(this.db.pool, { actorId: c.userId, action: `user.${b.status}`, subjectType: "user", subjectId: id, ip });
    return { ok: true };
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AuthContext } from "../auth/auth.service";
import { isUuid, parseDisplayName, parseEmail, parsePassword } from "../auth/validators";
import { hashPassword } from "../auth/password";
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

  /** Public pricing catalog. Only approved prices, enabled delivery routes and approved packages are exposed. */
  async publicPricing() {
    const r = await this.db.pool.query(
      `SELECT p.channel, p.country, p.unit_price_micro_usd
       FROM prices p
       WHERE p.status='active' AND (p.effective_from IS NULL OR p.effective_from <= now())
         AND EXISTS (
           SELECT 1 FROM providers v
           WHERE v.channel=p.channel AND v.enabled=true AND v.maintenance=false
             AND (p.channel='email' OR (
               COALESCE((v.config->>'customer_sending_enabled')::boolean, false)=true
               AND COALESCE(v.config->>'delivery_receipts','') <> 'not_available'
             ))
         )
       ORDER BY p.channel, p.country`
    );
    const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.RESEND_WEBHOOK_SECRET);
    const rates = r.rows
      .filter((p) => p.channel !== "email" || (emailReady && p.country === "*"))
      .filter((p) => p.channel !== "whatsapp" || p.country !== "*")
      .map((p) => ({ channel: p.channel as string, country: p.country as string, unitPriceMicroUsd: String(p.unit_price_micro_usd) }));
    const packages = await this.db.pool.query(
      "SELECT id, name, price_micro_usd, credit_micro_usd FROM packages WHERE active=true AND commercially_approved=true ORDER BY price_micro_usd"
    );
    const email = rates.find((p) => p.channel === "email");
    const whatsapp = rates.filter((p) => p.channel === "whatsapp");
    return {
      currency: "USD",
      channels: {
        email: { available: Boolean(email), unitPriceMicroUsd: email?.unitPriceMicroUsd ?? null },
        whatsapp: { available: whatsapp.length > 0, rates: whatsapp },
      },
      packages: packages.rows.map((p) => ({
        id: p.id as string,
        name: p.name as string,
        priceMicroUsd: String(p.price_micro_usd),
        creditMicroUsd: String(p.credit_micro_usd),
      })),
    };
  }

  /** Public footer details; only what an admin saved, nothing invented. */
  async publicCompany() {
    const r = await this.db.pool.query("SELECT value FROM system_settings WHERE key='company'");
    const v = obj(r.rows[0]?.value);
    const str = (k: string, max: number) => (typeof v[k] === "string" ? (v[k] as string).slice(0, max) : "");
    return { legalName: str("legalName", 120), address: str("address", 400), email: str("email", 120), phone: str("phone", 40) };
  }
  async setCompany(c: AuthContext, body: unknown, ip: string | null) {
    this.sup(c); const b = obj(body);
    const t = (k: string, max: number): string => {
      const v = typeof b[k] === "string" ? (b[k] as string).trim() : "";
      if (v.length > max || /[<>]/.test(v)) bad({ [k]: `up to ${max} characters, no < or >` });
      return v;
    };
    const value = { legalName: t("legalName", 120), address: t("address", 400), email: t("email", 120), phone: t("phone", 40) };
    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) bad({ email: "not a valid email" });
    await this.db.pool.query("INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES ('company',$1::jsonb,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()", [JSON.stringify(value), c.userId]);
    await writeAudit(this.db.pool, { actorId: c.userId, action: "company.updated", subjectType: "setting", subjectId: "company", ip });
    return { ok: true };
  }
  async company(c: AuthContext) { this.staff(c); return this.publicCompany(); }

  async tickets(c: AuthContext) {
    this.staff(c);
    const r = await this.db.pool.query(`SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at, o.name AS organization, u.email AS assignee
      FROM tickets t JOIN organizations o ON o.id=t.organization_id LEFT JOIN users u ON u.id=t.assignee_id ORDER BY t.updated_at DESC LIMIT 100`);
    return r.rows.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, organization: t.organization, assignee: t.assignee ?? null, updatedAt: t.updated_at }));
  }
  async deliveries(c: AuthContext) {
    this.staff(c);
    const r = await this.db.pool.query(`SELECT d.id, d.event_type, d.status, d.attempts, d.last_status_code, d.last_error, d.created_at, w.url
      FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id ORDER BY d.created_at DESC LIMIT 100`);
    return r.rows.map((d) => {
      let host = ""; try { host = new URL(d.url as string).host; } catch { /* ignore */ }
      return { id: d.id, event: d.event_type, status: d.status, attempts: d.attempts, code: d.last_status_code, error: d.last_error ? String(d.last_error).slice(0, 160) : null, host, createdAt: d.created_at };
    });
  }

  async orgs(c: AuthContext) {
    this.staff(c);
    const r = await this.db.pool.query("SELECT o.id, o.name, o.country, o.status, o.risk_level, o.created_at, u.email AS owner, (SELECT status FROM customer_verifications cv WHERE cv.organization_id=o.id ORDER BY cv.created_at DESC LIMIT 1) AS verification FROM organizations o JOIN users u ON u.id=o.owner_user_id ORDER BY o.created_at DESC LIMIT 100");
    return r.rows.map((o) => ({ id: o.id, name: o.name, country: o.country ?? "", status: o.status, riskLevel: o.risk_level, owner: o.owner, verification: o.verification ?? "none", createdAt: o.created_at }));
  }
  async updateOrg(c: AuthContext, idRaw: string, body: unknown, ip: string | null) {
    this.sup(c); const id = this.id(idRaw); const b = obj(body);
    const sets: string[] = []; const vals: unknown[] = [id];
    if ("name" in b) { const n = typeof b.name === "string" ? b.name.trim() : ""; if (n.length < 2 || n.length > 120) bad({ name: "2-120 characters" }); vals.push(n); sets.push(`name=$${vals.length}`); }
    if ("country" in b) { const k = typeof b.country === "string" ? b.country.trim().toUpperCase() : ""; if (k && !/^[A-Z]{2}$/.test(k)) bad({ country: "two letters" }); vals.push(k || null); sets.push(`country=$${vals.length}`); }
    if ("status" in b) { if (b.status !== "active" && b.status !== "suspended") bad({ status: "active or suspended" }); vals.push(b.status); sets.push(`status=$${vals.length}`); }
    if ("riskLevel" in b) { if (!["low", "normal", "elevated", "high"].includes(String(b.riskLevel))) bad({ riskLevel: "low, normal, elevated or high" }); vals.push(b.riskLevel); sets.push(`risk_level=$${vals.length}`); }
    if (!sets.length) bad({ body: "nothing to change" });
    const r = await this.db.pool.query(`UPDATE organizations SET ${sets.join(",")}, updated_at=now() WHERE id=$1 AND status IN ('active','suspended') RETURNING id`, vals);
    if (!r.rowCount) throw new NotFoundException({ error: "not_found" });
    await writeAudit(this.db.pool, { actorId: c.userId, action: "organization.updated", subjectType: "organization", subjectId: id, ip, meta: b });
    return { ok: true };
  }
  async setVerification(c: AuthContext, idRaw: string, body: unknown, ip: string | null) {
    this.sup(c); const id = this.id(idRaw); const b = obj(body);
    if (b.status !== "approved" && b.status !== "rejected") bad({ status: "approved or rejected" });
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : null;
    const org = await this.db.pool.query("SELECT id FROM organizations WHERE id=$1", [id]);
    if (!org.rowCount) throw new NotFoundException({ error: "not_found" });
    await this.db.pool.query("INSERT INTO customer_verifications(organization_id,status,reviewed_by,reviewed_at,note) VALUES ($1,$2,$3,now(),$4)", [id, b.status, c.userId, note || null]);
    await writeAudit(this.db.pool, { actorId: c.userId, action: `organization.verification_${b.status}`, subjectType: "organization", subjectId: id, ip });
    return { ok: true };
  }
  async createStaff(c: AuthContext, body: unknown, ip: string | null) {
    this.sup(c); const b = obj(body);
    if (b.role !== "admin_staff" && b.role !== "support_staff") bad({ role: "admin_staff or support_staff" });
    const email = parseEmail(b.email); if (!email.ok) bad({ email: email.error });
    const name = parseDisplayName(typeof b.name === "string" ? b.name : ""); if (!name.ok) bad({ name: name.error });
    const pw = parsePassword(typeof b.password === "string" ? b.password : "", email.ok ? email.value : ""); if (!pw.ok) bad({ password: pw.error });
    const hash = await hashPassword(pw.ok ? pw.value : "");
    const r = await this.db.pool.query(
      `INSERT INTO users(email, password_hash, display_name, role, status, email_verified_at, mfa_required)
       VALUES ($1::citext, $2::text, $3::text, $4::text, 'active', now(), true) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email.ok ? email.value : "", hash, name.ok ? name.value : "", b.role]);
    if (!r.rows[0]) throw new ConflictException({ error: "email_taken" });
    await writeAudit(this.db.pool, { actorId: c.userId, action: "admin.staff_created", subjectType: "user", subjectId: r.rows[0].id, ip, meta: { role: b.role } });
    return { id: r.rows[0].id as string, email: email.ok ? email.value : "", role: b.role as string };
  }
}

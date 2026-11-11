export type Role = "super_admin" | "admin_staff" | "support_staff" | "customer";
export interface Actor { id: string; role: Role; organizationId?: string; granted?: string[]; scope?: { countries?: string[] } }

/** Permission catalogue. `sensitive` actions need Super Admin approval when requested by staff. */
export const PERMISSIONS = {
  "ticket.read": false, "ticket.reply": false, "ticket.note": false, "ticket.assign": false, "ticket.escalate": false,
  "customer.read": false, "customer.suspend": true, "wallet.read": false,
  "wallet.deposit.approve": true, "wallet.adjust": true, "wallet.promo.grant": true,
  "pricing.manage": true, "provider.manage": true, "provider.override": true, "whatsapp.device.manage": true,
  "staff.manage": true, "audit.read": false, "backup.run": true, "country.enable": true, "export.conversations": true,
} as const;
export type Permission = keyof typeof PERMISSIONS;

/** Hard denials: never delegable, even if a grant row exists. Support can never touch money or secrets. */
const NEVER_FOR_SUPPORT: Permission[] = ["wallet.deposit.approve", "wallet.adjust", "wallet.promo.grant", "pricing.manage",
  "provider.manage", "provider.override", "whatsapp.device.manage", "staff.manage", "backup.run", "country.enable"];

const DEFAULTS: Record<Role, Permission[]> = {
  super_admin: Object.keys(PERMISSIONS) as Permission[],
  admin_staff: ["ticket.read", "ticket.reply", "ticket.note", "ticket.assign", "ticket.escalate", "customer.read", "wallet.read", "audit.read"],
  support_staff: ["ticket.read", "ticket.reply", "ticket.note", "ticket.assign", "ticket.escalate", "customer.read", "wallet.read"],
  customer: [],
};

export type Decision = { allow: true } | { allow: false; reason: string; needsApproval?: boolean };

export function can(actor: Actor, perm: Permission, ctx: { country?: string; organizationId?: string; approvedBy?: string } = {}): Decision {
  if (actor.role === "super_admin") return { allow: true };
  if (actor.role === "customer") return { allow: false, reason: "customers have no staff permissions" };
  if (actor.role === "support_staff" && NEVER_FOR_SUPPORT.includes(perm)) return { allow: false, reason: "never permitted for support staff" };
  const has = DEFAULTS[actor.role].includes(perm) || (actor.granted ?? []).includes(perm);
  if (!has) return { allow: false, reason: "permission not granted" };
  const sc = actor.scope?.countries;
  if (sc && ctx.country && !sc.includes(ctx.country)) return { allow: false, reason: "outside country scope" };
  if (PERMISSIONS[perm] && !ctx.approvedBy) return { allow: false, reason: "requires Super Admin approval", needsApproval: true };
  return { allow: true };
}

/** Tenant isolation (IDOR guard): customers may touch only resources of their own organization. */
export function canAccessTenant(actor: Actor, resourceOrgId: string): boolean {
  if (actor.role === "customer") return !!actor.organizationId && actor.organizationId === resourceOrgId;
  return actor.role !== undefined; // staff access to customer data is gated separately by can(..., 'customer.read')
}
/** Customers never see internal notes. */
export const canSeeInternalNotes = (a: Actor) => a.role !== "customer";

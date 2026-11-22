/** Mirror of the API's role -> panel rules (the API enforces them; this only decides what to offer). */
export type Panel = "console" | "admin" | "support";
const PANELS: Record<string, readonly Panel[]> = {
  customer: ["console"], admin_staff: ["admin"], support_staff: ["support"], super_admin: ["console", "admin", "support"],
};
export const panelsFor = (role: string): readonly Panel[] => PANELS[role] ?? [];

/** Which panels a role may open through single sign-in. Customers never reach staff panels; Super Admin reaches all three. */
export type Panel = "console" | "admin" | "support";
const PANELS: Record<string, readonly Panel[]> = {
  customer: ["console"], admin_staff: ["admin"], support_staff: ["support"], super_admin: ["console", "admin", "support"],
};
export const panelsFor = (role: string): readonly Panel[] => PANELS[role] ?? [];
export const canOpenPanel = (role: string, target: unknown): target is Panel => typeof target === "string" && (panelsFor(role) as readonly string[]).includes(target);

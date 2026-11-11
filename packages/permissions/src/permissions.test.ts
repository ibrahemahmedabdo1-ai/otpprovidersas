import test from "node:test"; import assert from "node:assert/strict";
import { can, canAccessTenant, canSeeInternalNotes, type Actor } from "./index.ts";
const support: Actor = { id: "s", role: "support_staff" };
const staff: Actor = { id: "a", role: "admin_staff", granted: ["wallet.deposit.approve"] };
const root: Actor = { id: "r", role: "super_admin" };
const cust: Actor = { id: "c", role: "customer", organizationId: "org1" };

test("support cannot approve deposits or adjust balances, even with a forged grant", () => {
  assert.equal(can(support, "wallet.deposit.approve").allow, false);
  assert.equal(can({ ...support, granted: ["wallet.deposit.approve", "wallet.adjust"] }, "wallet.adjust").allow, false);
  assert.equal(can({ ...support, granted: ["wallet.deposit.approve"] }, "wallet.deposit.approve", { approvedBy: "r" }).allow, false);
});
test("support can read wallet and handle tickets", () => {
  for (const p of ["wallet.read", "ticket.reply", "ticket.note", "ticket.escalate"] as const) assert.equal(can(support, p).allow, true, p);
});
test("sensitive staff action needs Super Admin approval", () => {
  const d = can(staff, "wallet.deposit.approve"); assert.equal(d.allow, false); assert.equal((d as any).needsApproval, true);
  assert.equal(can(staff, "wallet.deposit.approve", { approvedBy: "r" }).allow, true);
});
test("super admin has final authority", () => assert.equal(can(root, "wallet.deposit.approve").allow, true));
test("customers have no staff permissions", () => assert.equal(can(cust, "ticket.read").allow, false));
test("ABAC country scope enforced", () => {
  const scoped: Actor = { id: "x", role: "admin_staff", scope: { countries: ["ID"] } };
  assert.equal(can(scoped, "customer.read", { country: "ID" }).allow, true);
  assert.equal(can(scoped, "customer.read", { country: "AE" }).allow, false);
});
test("tenant isolation: customer cannot access other org; internal notes hidden", () => {
  assert.equal(canAccessTenant(cust, "org1"), true); assert.equal(canAccessTenant(cust, "org2"), false);
  assert.equal(canSeeInternalNotes(cust), false); assert.equal(canSeeInternalNotes(support), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { panelsFor } from "../src/lib/panels.ts";

test("customers only get the console; staff only their own panel; super admin all three", () => {
  assert.deepEqual(panelsFor("customer"), ["console"]);
  assert.deepEqual(panelsFor("admin_staff"), ["admin"]);
  assert.deepEqual(panelsFor("support_staff"), ["support"]);
  assert.deepEqual(panelsFor("super_admin"), ["console", "admin", "support"]);
  assert.deepEqual(panelsFor("nobody"), []);
});

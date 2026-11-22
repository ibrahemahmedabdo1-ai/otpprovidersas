import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenPanel, panelsFor } from "./panels";

test("each role opens only its own panel; super admin opens all", () => {
  assert.deepEqual(panelsFor("customer"), ["console"]);
  assert.deepEqual(panelsFor("admin_staff"), ["admin"]);
  assert.deepEqual(panelsFor("support_staff"), ["support"]);
  assert.deepEqual(panelsFor("super_admin"), ["console", "admin", "support"]);
});

test("customers can never open staff panels, and unknown input is refused", () => {
  assert.equal(canOpenPanel("customer", "admin"), false);
  assert.equal(canOpenPanel("customer", "support"), false);
  assert.equal(canOpenPanel("support_staff", "admin"), false);
  assert.equal(canOpenPanel("admin_staff", "support"), false);
  assert.equal(canOpenPanel("ghost", "console"), false);
  assert.equal(canOpenPanel("super_admin", undefined), false);
  assert.equal(canOpenPanel("super_admin", "billing"), false);
});

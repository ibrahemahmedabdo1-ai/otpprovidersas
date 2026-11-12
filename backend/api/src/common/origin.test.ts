import test from "node:test";
import assert from "node:assert/strict";
import { SAFE_METHODS, isOriginAllowed } from "./origin";

test("CSRF origin check", () => {
  const allowed = ["https://app.otpprovider.com"];
  assert.equal(isOriginAllowed(undefined, allowed, true), true);                       // curl / native app
  assert.equal(isOriginAllowed("https://app.otpprovider.com", allowed, true), true);
  assert.equal(isOriginAllowed("https://evil.example", allowed, true), false);
  assert.equal(isOriginAllowed("null", allowed, true), false);                         // sandboxed iframes / file://
  assert.equal(isOriginAllowed("http://localhost:3000", allowed, true), false);        // localhost only in dev
  assert.equal(isOriginAllowed("http://localhost:3000", allowed, false), true);
  assert.equal(isOriginAllowed("http://localhost.evil.com", [], false), false);
});
test("safe methods are not origin-checked", () => {
  assert.ok(SAFE_METHODS.has("GET") && !SAFE_METHODS.has("POST") && !SAFE_METHODS.has("DELETE"));
});

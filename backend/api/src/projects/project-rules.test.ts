import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectName } from "./project-rules";

test("project names are trimmed and bounded", () => {
  assert.deepEqual(parseProjectName("  My App  "), { ok: true, value: "My App" });
  for (const v of ["", "   ", "x".repeat(61), "<b>x</b>", "a\u0000b", 5, undefined]) assert.equal(parseProjectName(v).ok, false);
});

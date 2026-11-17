import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Every route declared in a controller must be documented in docs/api/openapi.yaml, and vice versa.
const srcDir = resolve(process.cwd(), "src");
const specPath = resolve(process.cwd(), "../../docs/api/openapi.yaml");

function controllerRoutes(): string[] {
  const out: string[] = [];
  const files = (readdirSync(srcDir, { recursive: true }) as string[]).filter((f) => f.endsWith(".controller.ts"));
  for (const f of files) {
    const s = readFileSync(join(srcDir, f), "utf8");
    for (const cm of s.matchAll(/@Controller\("([^"]*)"\)([\s\S]*?)(?=@Controller|$)/g)) {
      for (const m of (cm[2] ?? "").matchAll(/@(Get|Post|Delete|Put|Patch)\((?:"([^"]*)")?\)/g)) {
        const p = "/" + cm[1] + (m[2] ? "/" + m[2] : "");
        out.push(`${(m[1] ?? "").toUpperCase()} ${p.replace(/:(\w+)/g, "{$1}")}`);
      }
    }
  }
  return out.sort();
}
function specRoutes(): string[] {
  const out: string[] = [];
  let path = "";
  for (const line of readFileSync(specPath, "utf8").split("\n")) {
    const p = /^ {2}(\/\S*):\s*$/.exec(line);
    if (p) { path = p[1] ?? ""; continue; }
    const m = /^ {4}(get|post|delete|put|patch):\s*$/.exec(line);
    if (m && path) out.push(`${(m[1] ?? "").toUpperCase()} ${path}`);
  }
  return out.sort();
}

test("openapi.yaml documents exactly the routes the controllers declare", () => {
  const code = controllerRoutes();
  assert.ok(code.length > 30, "controller scan found routes");
  assert.deepEqual(specRoutes(), code);
});

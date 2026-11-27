// Fails when the gateway imports a local file that its Dockerfile does not COPY (the image would crash at startup).
import { readFileSync, existsSync } from "node:fs";
const dir = new URL("../services/whatsapp-gateway/", import.meta.url);
const docker = readFileSync(new URL("Dockerfile", dir), "utf8");
const copied = new Set(docker.split("\n").filter((l) => l.startsWith("COPY ") && !l.includes("package.json")).flatMap((l) => l.split(/\s+/).slice(1, -1)));
const seen = new Set(), queue = ["index.ts"], missing = [];
while (queue.length) {
  const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
  if (!copied.has(f)) missing.push(f);
  if (!existsSync(new URL(f, dir))) { missing.push(f + " (file not found)"); continue; }
  for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/from\s+"\.\/([\w-]+)"/g)) queue.push(m[1] + ".ts");
}
if (missing.length) { console.error("Dockerfile does not COPY: " + missing.join(", ")); process.exit(1); }
console.log(`Gateway Dockerfile copies all ${seen.size} local modules: ${[...seen].join(", ")}`);

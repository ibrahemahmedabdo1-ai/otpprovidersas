// Generates Android launcher icons and web favicons from the brand SVGs.
// Requires the `sharp` package (pnpm add -D sharp -w). Run: node scripts/generate-icons.mjs
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "packages/design-system/brand");

const targets = [
  { svg: "logo-customer.svg", mobile: "apps/customer-mobile", web: ["apps/customer-web", "apps/website"] },
  { svg: "logo-support.svg", mobile: "apps/support-mobile", web: ["apps/support-web"] },
  { svg: "logo-admin.svg", mobile: "apps/admin-mobile", web: ["apps/admin-web"] },
];
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const t of targets) {
  const svg = readFileSync(join(brand, t.svg));
  const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

  for (const [name, size] of Object.entries(densities)) {
    const dir = join(root, t.mobile, "android/app/src/main/res", `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });
    const buf = await png(size);
    await sharp(buf).toFile(join(dir, "ic_launcher.png"));
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    await sharp(buf).composite([{ input: mask, blend: "dest-in" }]).png().toFile(join(dir, "ic_launcher_round.png"));
  }
  const storeDir = join(root, t.mobile, "assets/icon");
  mkdirSync(storeDir, { recursive: true });
  await sharp(await png(512)).toFile(join(storeDir, "app_icon_512.png"));

  for (const w of t.web) {
    const pub = join(root, w, "public");
    mkdirSync(pub, { recursive: true });
    await sharp(await png(32)).toFile(join(pub, "favicon-32.png"));
    await sharp(await png(180)).toFile(join(pub, "apple-touch-icon.png"));
    await sharp(await png(512)).toFile(join(pub, "icon-512.png"));
    copyFileSync(join(brand, t.svg), join(pub, "icon.svg"));
  }
  console.log("generated:", t.svg);
}

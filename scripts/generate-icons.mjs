#!/usr/bin/env node
/**
 * Generate platform icon artefacts from build/icon.svg:
 *   build/icon.png   1024×1024 — Linux + electron-builder fallback
 *   build/icon.ico   multi-size — Windows installer + window
 *   build/icon.icns  multi-size — macOS DMG + dock
 *
 * Run with `npm run build:icons` after editing build/icon.svg. The outputs
 * are committed so a fresh checkout (or CI without sharp installed) can
 * produce a release without re-running this script.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import png2icons from "png2icons";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = resolve(ROOT, "build", "icon.svg");
const OUT_PNG = resolve(ROOT, "build", "icon.png");
const OUT_ICO = resolve(ROOT, "build", "icon.ico");
const OUT_ICNS = resolve(ROOT, "build", "icon.icns");

async function main() {
  const svg = await readFile(SRC);

  // Master 1024×1024 PNG (used directly for Linux, fed into the .ico/.icns converters)
  const masterPng = await sharp(svg, { density: 384 })
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(OUT_PNG, masterPng);
  console.log(`✓ ${OUT_PNG} (1024×1024)`);

  // Windows .ico — png2icons embeds multiple sizes (16, 24, 32, 48, 64, 128, 256)
  const ico = png2icons.createICO(masterPng, png2icons.BICUBIC, 0, false);
  if (!ico) throw new Error("png2icons failed to produce .ico");
  await writeFile(OUT_ICO, ico);
  console.log(`✓ ${OUT_ICO} (multi-size)`);

  // macOS .icns — same source, different container
  const icns = png2icons.createICNS(masterPng, png2icons.BICUBIC, 0);
  if (!icns) throw new Error("png2icons failed to produce .icns");
  await writeFile(OUT_ICNS, icns);
  console.log(`✓ ${OUT_ICNS} (multi-size)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

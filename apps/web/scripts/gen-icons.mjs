// ============================================================
// Generate raster app icons from the SVG source.
//
//   node scripts/gen-icons.mjs
//
// Emits the PNG sizes PWA installability and the app stores expect,
// into public/icons/. The "any" icons are a straight raster of the
// full-bleed SVG; the maskable icon composites the mark at ~80% on a
// solid brand ground so it survives the platform safe-zone crop.
// Re-run whenever src/app/icon.svg changes.
// ============================================================

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const SRC = path.join(root, '../src/app/icon.svg');
const OUT = path.join(root, '../public/icons');
const BRAND = '#2575EA'; // matches the SVG gradient start / manifest theme_color

mkdirSync(OUT, { recursive: true });

async function raster(size, file) {
  await sharp(SRC, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toFile(path.join(OUT, file));
  return `${file} (${size}×${size})`;
}

async function maskable(size, file) {
  const inner = Math.round(size * 0.8); // 80% safe zone
  const pad = Math.round((size - inner) / 2);
  const mark = await sharp(SRC, { density: 384 }).resize(inner, inner, { fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toFile(path.join(OUT, file));
  return `${file} (${size}×${size}, maskable)`;
}

const written = [];
written.push(await raster(192, 'icon-192.png'));
written.push(await raster(512, 'icon-512.png'));
written.push(await raster(180, 'apple-touch-icon-180.png'));
written.push(await maskable(512, 'icon-maskable-512.png'));

console.log('Wrote to public/icons/:');
written.forEach((w) => console.log('  •', w));

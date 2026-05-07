// Fixes legacy JSX attributes that contain literal `\uXXXX` escape sequences.
// Inside JSX attribute strings (`attr="..."`), backslash-u sequences are
// NOT decoded and render literally. We rewrite them to the real Unicode
// character so they display correctly.
//
// JS string literals inside JSX expressions ({'...ü...'}) keep working
// — those are correctly decoded by the JavaScript runtime, so we don't touch
// them.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const files = [
  'apps/web/src/app/stats/page.tsx',
  'apps/web/src/components/notifications/PriceAlertSettings.tsx',
  'apps/web/src/components/onboarding/OnboardingModal.tsx',
  'apps/web/src/components/stations/StationList.tsx',
  'apps/web/src/components/stations/StationPanel.tsx',
];

const attrRe = /(\s[a-zA-Z-]+=")([^"]*\\u[0-9a-fA-F]{4}[^"]*)(")/g;

const decodeEscapes = (s) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const root = path.resolve(import.meta.dirname, '..');

for (const rel of files) {
  const abs = path.join(root, rel);
  const text = await readFile(abs, 'utf8');
  let count = 0;
  const next = text.replace(attrRe, (_, prefix, body, suffix) => {
    count += 1;
    return prefix + decodeEscapes(body) + suffix;
  });
  if (next !== text) {
    await writeFile(abs, next, 'utf8');
    console.log(`${rel}: ${count} replacements`);
  } else {
    console.log(`${rel}: no change`);
  }
}

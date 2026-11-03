// Renders icons/icon.svg into every PNG the site and the Android app need, plus the Android TV banner.
//   node tools/make-icons.js
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium); nothing else.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright'); // resolves a global install too (NODE_PATH)
const svg = readFileSync(join(root, 'icons/icon.svg'), 'utf8');
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const PNGS = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(html, width, height, file, omitBackground = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(50);
  const buf = await page.screenshot({ omitBackground, clip: { x: 0, y: 0, width, height } });
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), buf);
  console.log(file, width + 'x' + height);
}

for (const [file, size] of PNGS) {
  await shot(`<img src="${dataUri}" width="${size}" height="${size}" style="display:block">`, size, size, file);
}

// Maskable icon: full-bleed gradient, artwork inside the central 80% "safe zone" (no inner rounded square).
const pupOnly = svg.replace(/<rect [^>]*rx="110"[^>]*\/>/, '');
const pupUri = 'data:image/svg+xml;base64,' + Buffer.from(pupOnly).toString('base64');
await shot(`<div style="width:512px;height:512px;background:linear-gradient(135deg,#ffb07c,#ff6f8f);display:grid;place-items:center">
  <img src="${pupUri}" width="410" height="410" style="display:block"></div>`, 512, 512, 'icons/maskable-512.png', false);

// Android TV banner (320×180, no transparency): icon + the game's name.
await shot(`<div style="width:320px;height:180px;background:linear-gradient(135deg,#ffb07c,#ff6f8f);display:flex;align-items:center;gap:12px;padding:0 16px;box-sizing:border-box;font-family:'Nunito','Segoe UI',Arial,sans-serif">
  <img src="${dataUri}" width="108" height="108" style="display:block;border-radius:24px;box-shadow:0 6px 16px rgba(80,30,20,.25);flex:none">
  <div style="color:#4a2f1c;font-weight:900;line-height:.95;letter-spacing:-.02em"><div style="font-size:40px">Doku</div><div style="font-size:40px;color:#fff;text-shadow:0 2px 0 rgba(120,40,40,.25)">Puppies</div></div>
</div>`, 320, 180, 'android/app/src/main/res/drawable/banner.png', false);

// Google Play feature graphic (1024×500, no transparency).
await shot(`<div style="width:1024px;height:500px;background:linear-gradient(135deg,#ffb07c,#ff6f8f);display:flex;align-items:center;gap:48px;padding:0 72px;box-sizing:border-box;font-family:'Nunito','Segoe UI',Arial,sans-serif">
  <img src="${dataUri}" width="300" height="300" style="display:block;border-radius:66px;box-shadow:0 14px 36px rgba(80,30,20,.28);flex:none">
  <div style="color:#4a2f1c;font-weight:900;line-height:.95;letter-spacing:-.02em">
    <div style="font-size:104px">Doku</div><div style="font-size:104px;color:#fff;text-shadow:0 3px 0 rgba(120,40,40,.25)">Puppies</div>
    <div style="font-size:30px;font-weight:700;margin-top:22px;color:#5a3a2a">Cosy logic puzzles · free · no ads</div>
  </div>
</div>`, 1024, 500, 'store/feature-graphic.png', false);

await browser.close();

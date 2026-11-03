// Store screenshots: phone, 7" tablet, 10" tablet (landscape) and TV, into store/screenshots/.
//   python3 -m http.server 8080            # in the repo root (or point at the live site)
//   node tools/screenshots.js [http://localhost:8080/]
// Seeds a demo profile (a few walks done, some pups adopted) so the screens look lived-in.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://localhost:8080/';
const out = join(root, 'store/screenshots');
mkdirSync(out, { recursive: true });

const DEVICES = {
  phone: { width: 360, height: 640, scale: 3 },      // 1080×1920
  tablet7: { width: 600, height: 960, scale: 2 },    // 1200×1920
  tablet10: { width: 1280, height: 800, scale: 2 },  // 2560×1600
  tv: { width: 1920, height: 1080, scale: 1 },       // 1920×1080
};

function demoProfile() {
  const now = Date.now(), levels = {}, pups = {};
  for (let L = 1; L <= 24; L++) levels['L' + L] = { stars: L % 4 === 0 ? 2 : 3, best: 40 + L * 7, plays: 1, at: now - (30 - L) * 864e5 };
  for (const id of ['biscuit', 'pepper', 'maple', 'luna']) pups[id] = now;
  return {
    v: 1, createdAt: now - 31 * 864e5, updatedAt: now, treatsEarned: 96, treatsSpent: 21, selectedPup: 'maple', pups, levels,
    daily: {}, streak: { count: 6, last: '', best: 9 }, events: {}, tricks: {}, dailyTricks: { date: '', progress: {}, claimed: {} },
    stats: { solved: 31, marks: 900, pupsPlaced: 220, mistakes: 7, hintsUsed: 12, perfect: 18, noHint: 20, byRank: {}, bySize: {}, bestTime: {}, timePlayed: 5400, fetched: 1, zoomies: 2 },
    settings: { sound: false, haptics: false, autoMark: false, reduceMotion: false, bigText: false, showCoords: false }, progress: {},
  };
}

const browser = await chromium.launch();
for (const [name, d] of Object.entries(DEVICES)) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, hasTouch: name !== 'tv', isMobile: name !== 'tv' });
  await ctx.addInitScript(p => {
    const d = new Date(); p.streak.last = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('dokupuppies.profile.v1', JSON.stringify(p)); localStorage.setItem('dokupuppies.key', 'd3m0'.repeat(8));
  }, demoProfile());
  const page = await ctx.newPage();
  const snap = async (label) => { await page.waitForTimeout(700); await page.screenshot({ path: join(out, `${name}-${label}.jpg`), type: 'jpeg', quality: 92 }); console.log(name, label); };
  const go = async (screen, arg) => { await page.evaluate(([s, a]) => window.dokuPuppies.go(s, a), [screen, arg]); await page.waitForTimeout(400); };

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#s-home.active');
  await snap('1-home');

  await go('walks'); await snap('2-walks');

  await go('game', { kind: 'level', id: 25 });
  await page.waitForFunction(() => window.dokuPuppies.game && window.dokuPuppies.game.cellEls);
  // play a few moves from the solution, then ask for a Sniff so the explanation bubble shows
  await page.evaluate(() => {
    const g = window.dokuPuppies.game, n = g.n, sol = g.puzzle.solution;
    const pups = []; for (let r = 0; r < n; r++) pups.push(r * n + sol[r]);
    for (const i of pups.slice(0, 2)) { g.setCursor(i); g.act('pup'); }
    g.setCursor(-1);
  });
  await page.waitForTimeout(600);
  // first Sniff = the mechanical "cross off blocked squares" step; apply it, then ask for a real deduction
  await page.evaluate(() => window.dokuPuppies.sniff()); await page.waitForTimeout(300);
  await page.evaluate(() => window.dokuPuppies.sniff()); await page.waitForTimeout(600);
  await page.evaluate(() => window.dokuPuppies.sniff());
  await snap('3-sniff');

  await go('collection'); await snap('4-kennel');
  await go('daily'); await snap('5-daily');
  await go('free'); await snap('6-free');
  await ctx.close();
}
await browser.close();

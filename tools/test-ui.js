// End-to-end smoke test of the web game in headless Chromium (phone, tablet landscape and TV/keyboard).
//   python3 -m http.server 8080      # in the repo root
//   node tools/test-ui.js [http://localhost:8080/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] || 'http://localhost:8080/';
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) failures++; };
const browser = await chromium.launch();

async function session(name, opts, body) {
  console.log(name);
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#s-home.active');
  try { await body(page, ctx); } catch (e) { check(false, name + ' threw: ' + e.message); }
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

const app = (page, fn, ...args) => page.evaluate(([f, a]) => (new Function('app', 'args', `return (${f})(app, ...args)`))(window.dokuPuppies, a), [fn.toString(), args]);
const state = page => app(page, a => { const g = a.game; return { done: g.done, failed: g.failed, hearts: g.hearts, hints: g.hintsUsed, n: g.n }; });

await session('phone portrait', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async (page) => {
  check(await page.title() === 'Doku Puppies — a puppy logic puzzle', 'title renamed');
  check((await page.textContent('.logo')).replace(/\s+/g, '') === 'Doku🐾Puppies', 'logo reads Doku 🐾 Puppies');
  await page.click('#home-play');
  await page.waitForFunction(() => window.dokuPuppies.game && window.dokuPuppies.game.cellEls);
  const tut = await page.$('.dialog.tutorial, .tutorial');
  check(!!tut, 'tutorial shows on level 1');
  check(await app(page, a => a.handleBack()), 'handleBack closes the tutorial (Android Back)');
  check(!(await app(page, a => a.handleBack())), 'handleBack returns false with nothing open');
  // up-navigation: Home > Walks > level 1 > level 2, then the ‹ button jumps back to Walks, then Home (history collapses with it)
  const base = await app(page, a => history.state.i);
  await app(page, a => { a.go('walks'); a.go('game', { kind: 'level', id: 1 }); a.go('game', { kind: 'level', id: 2 }); });
  await page.waitForTimeout(400);
  check((await app(page, a => history.state.i)) === base + 3, 'history index counts the screens visited');
  await app(page, a => a.closeAllDialogs()); // the level intro; the ‹ button closes dialogs first
  await page.locator('#s-game [data-back]').first().click(); await page.waitForTimeout(500);
  check((await app(page, a => a.current + ':' + history.state.i)) === 'walks:' + (base + 1), 'the ‹ button on a level goes up to Walks, collapsing the two levels');
  await page.locator('#s-walks [data-back]').click(); await page.waitForTimeout(500);
  check((await app(page, a => a.current)) === 'home', 'the ‹ button on Walks goes home');
  await app(page, a => a.go('settings')); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check((await app(page, a => a.current)) === 'home', 'Escape goes up from Settings to Home');
  // back to level 1 for the pointer checks below
  await app(page, a => a.go('game', { kind: 'level', id: 1 }));
  await page.waitForFunction(() => window.dokuPuppies.game && window.dokuPuppies.game.cellEls);
  await app(page, a => a.closeAllDialogs());
  // real pointer input: tap crosses off, tap again clears, double-tap seats a pup (EMPTY=0, MARK=1, PUP=2)
  const pick = await app(page, a => { const g = a.game, n = g.n, sol = g.puzzle.solution; let good = -1, bad = -1; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const i = r * n + c; if (g.given[i] || g.cells[i] !== 0) continue; if (sol[r] === c && good < 0) good = i; if (sol[r] !== c && bad < 0) bad = i; } return { good, bad }; });
  const cellOf = (page, i) => app(page, (a, i) => a.game.cells[i], i);
  const centre = async i => { const b = await page.locator('#board .cell').nth(i).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  await page.waitForTimeout(700); // let the tutorial dialog finish fading out
  let p = await centre(pick.bad);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  check((await cellOf(page, pick.bad)) === 1, 'tap crosses off a square');
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  check((await cellOf(page, pick.bad)) === 0, 'tap again clears it');
  p = await centre(pick.good);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  check((await cellOf(page, pick.good)) === 2, 'double-tap seats a pup');
  const undone = await app(page, (a, i) => { a.game.undo(); return a.game.cells[i]; }, pick.good);
  check(undone === 0, 'undo after a double-tap returns the square to empty');
  await page.waitForTimeout(450);
  p = await centre(pick.good);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  check((await cellOf(page, pick.good)) === 0, 'tapping a pup sends it home');
  // leaving a level must take its board out of play: a board left listening on #board judged later taps against its
  // own solution, so correct pups on the next level rang as mistakes and "Out of hearts" came up for the wrong game
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(450); // one mark so level 1 is saved as in progress
  await page.locator('#s-game [data-back]').first().click(); await page.waitForTimeout(500);
  check(await app(page, a => a.current === 'walks' && !a.game), 'the ‹ button tears the board down');
  check(await app(page, a => !!a.profile.progress.L1), 'an unfinished level is saved on the way out');
  await app(page, a => a.go('game', { kind: 'level', id: 2 }));
  await page.waitForFunction(() => { const g = window.dokuPuppies.game; return g && g.cellEls && g.info.id === 2; });
  await app(page, a => a.closeAllDialogs()); await page.waitForTimeout(700);
  const l1 = await page.evaluate(() => import('./js/puzzles.js').then(m => m.getLevel(1)).then(x => x.puzzle.solution));
  const targets = await app(page, (a, l1) => { const g = a.game, n = g.n, sol = g.puzzle.solution, out = []; for (let r = 0; r < n && out.length < 3; r++) { const i = r * n + sol[r]; if (!g.given[i] && g.cells[i] === 0 && l1[r] !== sol[r]) out.push(i); } return out; }, l1);
  check(targets.length === 3, 'level 2 has three correct squares that are wrong on level 1 (' + targets.length + ')');
  for (const i of targets) { const q = await centre(i); await page.mouse.click(q.x, q.y); await page.waitForTimeout(90); await page.mouse.click(q.x, q.y); await page.waitForTimeout(450); }
  await page.waitForTimeout(900); // the fail card comes 800 ms after a third mistake
  const l2 = await app(page, (a, t) => ({ pups: t.filter(i => a.game.cells[i] === 2).length, hearts: a.game.hearts, fail: !!document.querySelector('.dialog.fail, .fail') }), targets);
  check(l2.pups === 3 && l2.hearts === 3 && !l2.fail, 'correct pups on the next level are not judged by the board that was left (' + JSON.stringify(l2) + ')');
  const clock = await app(page, a => { a.game.restart(); return a.game.time; });
  check(clock < 100, 'Start over resets the clock (' + Math.round(clock) + ' ms)');
  await app(page, a => a.go('game', { kind: 'level', id: 1 }));
  await page.waitForFunction(() => { const g = window.dokuPuppies.game; return g && g.cellEls && g.info.id === 1; });
  await page.waitForTimeout(500);
  const back = { mark: await cellOf(page, pick.good), l2kept: await app(page, a => !!a.profile.progress.L2) };
  check(back.mark === 1 && !back.l2kept, 'level 1 comes back with its saved mark; the untouched level 2 board was not kept (' + JSON.stringify(back) + ')');
  // wrong pup costs a heart and becomes a mark
  const wrong = await app(page, a => { const g = a.game, n = g.n; const sol = g.puzzle.solution; let i = -1; for (let r = 0; r < n && i < 0; r++) for (let c = 0; c < n; c++) if (sol[r] !== c && !g.given[r * n + c]) { i = r * n + c; break; } g.setCursor(i); g.act('pup'); return g.hearts; });
  check(wrong === 2, 'wrong placement costs a heart (' + wrong + ')');
  // hints walk the board to the end
  let guard = 0;
  while (!(await state(page)).done && guard++ < 80) await app(page, a => { a.sniff(); a.sniff(); });
  const s = await state(page);
  check(s.done, 'board solvable by Sniff alone (' + guard + ' hints)');
  await page.waitForTimeout(1200);
  const win = await page.$('.dialog');
  check(!!win, 'win dialog shows');
  const prof = await app(page, a => ({ l1: a.profile.levels.L1, treats: a.profile.treatsEarned - a.profile.treatsSpent }));
  check(!!prof.l1, 'level 1 recorded in profile');
  // persistence across reload (localStorage key renamed)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.screen.active'); // history.state brings the last screen back
  const again = await app(page, a => !!a.profile.levels.L1);
  check(again, 'progress survives reload under dokupuppies.profile.v1');
  check(await page.evaluate(() => !!localStorage.getItem('dokupuppies.profile.v1') && !localStorage.getItem('pupdoku.profile.v1')), 'localStorage uses the new key only');
  // daily + settings mark style
  await app(page, a => a.go('daily'));
  await page.waitForSelector('#s-daily.active');
  check(!!(await page.$('#s-daily .primary, #s-daily button')), 'daily screen renders');
  await app(page, a => a.go('settings'));
  await page.waitForSelector('#s-settings.active');
  check((await page.textContent('#s-settings')).includes('Doku Puppies v1'), 'settings footer renamed');
});

await session('tablet landscape', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true }, async (page) => {
  await app(page, a => a.go('game', { kind: 'free', n: 9, rank: 3 }));
  await page.waitForFunction(() => window.dokuPuppies.game && window.dokuPuppies.game.cellEls, null, { timeout: 60000 });
  const cell = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('board')).getPropertyValue('--cell')));
  check(cell >= 40, '9×9 board gets a usable cell size (' + cell + 'px)');
  check(await page.$('.board-frame svg.terrain') !== null, 'terrain SVG drawn');
});

await session('TV keyboard', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, async (page) => {
  await page.keyboard.press('ArrowDown'); // first key switches to keyboard mode and focuses Play
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.dokuPuppies.game && window.dokuPuppies.game.cellEls);
  await app(page, a => a.handleBack()); // close tutorial if any
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  await app(page, a => { const g = a.game; if (g.given[g.cursor]) g.setCursor((g.cursor + 1) % g.N); }); // not on the given pup
  await page.keyboard.press('x');
  const marked = await app(page, a => a.game.cells.filter(c => c === 1).length);
  check(marked >= 1, 'keyboard X marks a square');
  await page.keyboard.press('h');
  check((await state(page)).hints >= 0, 'H asks for a sniff without errors');
});

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good');
process.exit(failures ? 1 : 0);

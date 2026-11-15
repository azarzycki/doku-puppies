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
  const tray = await app(page, a => { const g = a.game; const chips = Array.from(document.querySelectorAll('#yard-tray .yard-chip')); const yards = new Set(); g.cells.forEach((v, i) => { if (v === 2) yards.add(g.puzzle.regions[i]); }); return { chips: chips.length, lit: chips.filter(c => c.classList.contains('on')).length, n: g.n, yardsWithPup: yards.size }; });
  check(tray.chips === tray.n && tray.lit === tray.yardsWithPup && tray.lit >= 2, 'yard tray: one chip per yard, lit for the yards that have a pup (' + JSON.stringify(tray) + ')');
  const undone = await app(page, (a, i) => { a.game.undo(); return a.game.cells[i]; }, pick.good);
  check(undone === 0, 'undo after a double-tap returns the square to empty');
  check((await app(page, a => document.querySelectorAll('#yard-tray .yard-chip.on').length)) === tray.lit - 1, 'undo greys that yard chip again');
  await page.waitForTimeout(450);
  p = await centre(pick.good);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  check((await cellOf(page, pick.good)) === 0, 'tapping a pup sends it home');
  // no-guessing mode, style A: a cross that needs a reason shows "?" and waits for the squares that block it
  await app(page, a => { a.profile.settings.noGuess = true; a.profile.settings.noGuessStyle = 'A'; a.game.settings = a.profile.settings; a.game.syncMode(); });
  await page.waitForTimeout(200);
  // a square that one row, column or yard rules out (few blockers), the others it rules out, and a square nothing forces a pup onto
  const findProof = () => page.evaluate(async () => {
    const { rulesOut, forcedIn } = await import('./js/engine.js');
    const g = window.dokuPuppies.game, st = g.proof.st(), n = g.n, open = i => st.cand[i] && !st.pup[i];
    let best = null;
    for (const type of ['reg', 'row', 'col']) for (let idx = 0; idx < n; idx++) {
      if (st.unitHasPup(type, idx)) continue;
      const cells = st.unitCells(type, idx); if (cells.length < 2) continue;
      const outs = []; for (let i = 0; i < g.N; i++) if (open(i) && rulesOut(st, [{ type, idx }], i)) outs.push(i);
      if (outs.length && (!best || cells.length < best.cells.length)) best = { unit: { type, idx }, cells, target: outs[0], others: outs.slice(1) };
    }
    let unforced = -1; for (let i = 0; i < g.N && unforced < 0; i++) if (open(i) && !forcedIn(st, i) && !(best && (i === best.target || best.others.includes(i) || best.cells.includes(i)))) unforced = i;
    return { best, unforced };
  });
  const ui = () => app(page, a => { const g = a.game, q = s => document.querySelectorAll(s).length; return { ask: g.proof.ask, want: g.proof.want, lit: q('#board .cell.ev'), tabsOn: q('#board .unit-tab.on'), tests: g.proof.tests.length, picks: g.proof.picks.length, whatif: document.getElementById('board').classList.contains('whatif'), ghosts: q('#board .cell.ghost'), rivals: q('#board .cell.rival'), title: document.getElementById('basis-title').textContent, hidden: document.getElementById('basis-bubble').classList.contains('hidden'), buttons: [...document.querySelectorAll('#basis-actions button')].map(b => b.dataset.act).join() }; });
  const tapCell = async i => { const c = await centre(i); await page.mouse.click(c.x, c.y); await page.waitForTimeout(400); };
  const dblCell = async i => { const c = await centre(i); await page.mouse.click(c.x, c.y); await page.waitForTimeout(90); await page.mouse.click(c.x, c.y); await page.waitForTimeout(450); };
  const holdCell = async i => { const c = await centre(i); await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(520); await page.mouse.up(); await page.waitForTimeout(250); };
  let pf = await findProof();
  check(!!pf.best && pf.unforced >= 0, 'level 1 has a square that one row, column or yard rules out (' + JSON.stringify(pf.best && pf.best.unit) + ')');
  let u0 = await ui();
  const tabsShown = await app(page, a => [...document.querySelectorAll('#board .unit-tab')].filter(t => getComputedStyle(t).display !== 'none').length / a.game.n);
  check(tabsShown === 4 && !u0.hidden && u0.title === 'No guessing · A' && u0.buttons === 'style', 'no-guessing: a fence tab at both ends of every row and column, and the panel under the board is up with the A/B switch (' + JSON.stringify(u0) + ')');
  const boardY = (await page.locator('#board').boundingBox()).y;
  await tapCell(pf.best.target);
  u0 = await ui();
  check((await cellOf(page, pf.best.target)) === 0 && u0.ask === pf.best.target && u0.title === 'Why is this square out?' && (await page.locator('#board .cell.ask').count()) === 1, 'A: tapping an unproven square leaves it uncrossed, marks it "?" and asks why (' + JSON.stringify(u0) + ')');
  check(Math.abs((await page.locator('#board').boundingBox()).y - boardY) < 1, 'the board does not shift when the question comes up');
  await tapCell(pf.best.cells[0]);
  u0 = await ui();
  check(u0.lit === 1 && (await cellOf(page, pf.best.target)) === 0 && u0.ask === pf.best.target, 'A: one blocker lit is not yet a reason (' + JSON.stringify(u0) + ')');
  for (const c of pf.best.cells.slice(1)) { if ((await ui()).ask < 0) break; await tapCell(c); }
  u0 = await ui();
  check((await cellOf(page, pf.best.target)) === 1 && u0.ask === -1 && u0.lit === pf.best.cells.length && u0.title === 'Crossed off', 'A: once every open square of the row, column or yard is lit, the square is crossed off and the blockers stay lit (' + JSON.stringify(u0) + ')');
  if (pf.best.others.length) { await tapCell(pf.best.others[0]); check((await cellOf(page, pf.best.others[0])) === 1 && (await ui()).ask === -1, 'A: another square the lit blockers rule out takes a single tap'); }
  await tapCell(pf.unforced);
  u0 = await ui();
  check(u0.ask === pf.unforced && u0.lit === 0, 'A: a square the lit blockers do not reach becomes the new question, and the used blockers go dark (' + JSON.stringify(u0) + ')');
  await tapCell(pf.unforced);
  check((await ui()).ask === -1 && (await cellOf(page, pf.unforced)) === 0, 'A: tapping the "?" again drops the question');
  // whole units: hold a square for its yard, a fence tab for a row, R / C / Y on the keyboard
  await holdCell(pf.unforced);
  u0 = await ui();
  const yardOpen = await app(page, (a, i) => { const g = a.game, st = g.proof.st(); return st.unitCells('reg', g.puzzle.regions[i]).length; }, pf.unforced);
  check(u0.picks === 1 && u0.lit === yardOpen && (await cellOf(page, pf.unforced)) === 0, 'A: holding a square lights its whole yard (' + JSON.stringify(u0) + ', ' + yardOpen + ' open)');
  await page.locator('#basis-actions [data-act="clear"]').click(); await page.waitForTimeout(150);
  check((await ui()).lit === 0, 'Clear puts the lit squares out');
  await page.locator('#board .unit-tab.row.a').nth(0).click(); await page.waitForTimeout(150);
  u0 = await ui();
  check(u0.picks === 1 && u0.tabsOn === 2, 'A: a fence tab lights a whole row (' + JSON.stringify(u0) + ')');
  await app(page, (a, i) => { a.game.proof.press('clear'); a.game.setCursor(i); }, pf.unforced);
  await page.keyboard.press('r'); await page.keyboard.press('y'); await page.waitForTimeout(100);
  check((await app(page, a => a.game.proof.picks.map(u => u.type).join())) === 'row,reg', 'keyboard R and Y name the cursor row and yard');
  await app(page, a => a.game.proof.press('clear'));
  await page.mouse.click(1, 1); // back to pointer mode
  // a pup that is not forced waits for its reason: the squares that could still take it flash, and a what-if is offered
  await dblCell(pf.unforced);
  u0 = await ui();
  check((await cellOf(page, pf.unforced)) === 0 && u0.tests === 0 && u0.want === pf.unforced && u0.rivals > 0 && u0.title === 'Why here?' && u0.buttons === 'cancel,whatif', 'A: a double-tap on a square that is not the only spot leaves the pup waiting for its reason, with its rivals flashing (' + JSON.stringify(u0) + ')');
  await page.locator('#basis-actions [data-act="whatif"]').click(); await page.waitForTimeout(400);
  u0 = await ui();
  check(u0.tests === 1 && u0.whatif && u0.ghosts === 1 && u0.title === 'What if a pup sat here?' && (await cellOf(page, pf.unforced)) === 0, 'A: the What if…? button puts a ghost pup on trial (' + JSON.stringify(u0) + ')');
  // inside the what-if the same moves work: a square crossed off there is only crossed off there
  const inner = await findProof();
  if (inner.best) {
    await tapCell(inner.best.target);
    for (const c of inner.best.cells) { if ((await ui()).ask < 0) break; await tapCell(c); }
    const st2 = await app(page, (a, i) => ({ tests: a.game.proof.tests.length, steps: a.game.proof.top ? a.game.proof.top.steps.length : -1, real: a.game.cells[i], faded: document.querySelectorAll('#board .cell.tx').length }), inner.best.target);
    check(st2.tests === 1 && st2.steps === 1 && st2.real === 0 && st2.faded === 1, 'A: a square crossed off inside a what-if is only crossed off there (' + JSON.stringify(st2) + ')');
    check(await app(page, a => { a.game.undo(); return a.game.proof.tests.length === 1 && a.game.proof.top.steps.length === 0; }), 'Undo steps back inside the what-if');
  }
  check((await app(page, a => a.handleBack())) && (await app(page, a => !a.game.proof.busy && !document.getElementById('board').classList.contains('whatif'))), 'Android Back ends the what-if');
  check(!(await app(page, a => a.handleBack())), 'with nothing open, Android Back is not swallowed');
  // style B: a tap tries a ghost pup; tapping a square of the row, column or yard it leaves with no room crosses it off
  await app(page, a => a.game.proof.press('clear'));
  await page.locator('#basis-actions [data-act="style"]').click(); await page.waitForTimeout(250);
  u0 = await ui();
  check(u0.title === 'No guessing · B' && (await app(page, a => a.profile.settings.noGuessStyle)) === 'B', 'the switch under the board changes to style B (' + JSON.stringify(u0) + ')');
  pf = await findProof();
  check(!!pf.best, 'B: there is still a square to rule out');
  await tapCell(pf.best.target);
  u0 = await ui();
  check(u0.tests === 1 && u0.whatif && u0.ghosts === 1 && (await cellOf(page, pf.best.target)) === 0, 'B: tapping an open square tries a ghost pup on it and darkens what it blocks (' + JSON.stringify(u0) + ')');
  await tapCell(pf.best.target);
  check((await ui()).tests === 0 && (await cellOf(page, pf.best.target)) === 0, 'B: tapping the ghost again takes it back');
  await tapCell(pf.best.target);
  const dark = await page.evaluate(async () => { const { stuck, unitsThrough } = await import('./js/engine.js'); const g = window.dokuPuppies.game, st = g.proof.st(), top = g.proof.top.cell; let no = -1, yes = -1; for (let i = 0; i < g.N; i++) { if (i === top || (st.cand[i] && !st.pup[i])) continue; const any = unitsThrough(st, i).some(x => stuck(st, [x])); if (any && yes < 0) yes = i; if (!any && no < 0) no = i; } return { no, yes }; });
  if (dark.no >= 0) {
    await tapCell(dark.no);
    u0 = await ui();
    check(u0.tests === 1 && (await cellOf(page, pf.best.target)) === 0 && /Nothing through that square is stuck/.test(await page.textContent('#basis-text')), 'B: a dark square with room left in its row, column and yard settles nothing (' + JSON.stringify(u0) + ')');
    await page.locator('#basis-actions [data-act="clear"]').click(); await page.waitForTimeout(150);
  }
  await tapCell(dark.yes);
  u0 = await ui();
  check((await cellOf(page, pf.best.target)) === 1 && u0.tests === 0 && !u0.whatif && u0.title === 'Ruled out', 'B: tapping a square of the row, column or yard left with no room crosses the tested square off (' + JSON.stringify(u0) + ')');
  // B: a test inside a test, then out again
  await app(page, a => a.game.proof.press('clear'));
  pf = await findProof();
  await tapCell(pf.unforced);
  const lit2 = await page.evaluate(async () => { const { forcedIn } = await import('./js/engine.js'); const g = window.dokuPuppies.game, st = g.proof.st(); for (let i = 0; i < g.N; i++) if (st.cand[i] && !st.pup[i] && !forcedIn(st, i)) return i; return -1; }); // a lit square that is nobody’s only spot
  if (lit2 >= 0) { await tapCell(lit2); u0 = await ui(); check(u0.tests === 2 && u0.ghosts === 2 && u0.title === 'And a pup here too?', 'B: tapping a lit square inside a what-if tests that one too (' + JSON.stringify(u0) + ')'); }
  await app(page, a => { while (a.game.proof.busy) a.handleBack(); });
  check((await app(page, a => a.game.hearts)) === 3 && (await cellOf(page, pick.good)) === 0, 'none of that cost a heart or touched the pup square');
  await app(page, a => { a.game.proof.press('clear'); a.profile.settings.noGuess = false; a.profile.settings.noGuessStyle = 'A'; a.game.settings = a.profile.settings; a.game.syncMode(); });
  await page.waitForTimeout(200);
  check((await app(page, a => [...document.querySelectorAll('#board .unit-tab')].filter(t => getComputedStyle(t).display !== 'none').length)) === 0 && (await ui()).hidden, 'switching the mode off hides the tabs and the panel');
  p = await centre(pick.good);
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
  // no-guessing mode end to end, once in each style: every step the hint engine takes is entered through the game
  const solveIn = (style, stopAt = '') => page.evaluate(async ({ style, stopAt }) => {
    const { nextDeduction, forcedIn, rulesOut, unitHas, unitsThrough } = await import('./js/engine.js');
    const a = window.dokuPuppies, g = a.game, P = g.proof, n = g.n;
    a.closeAllDialogs();
    g.restart();
    a.profile.settings.noGuess = true; a.profile.settings.noGuessStyle = style; g.settings = a.profile.settings; g.syncMode();
    const name = u => (u.type === 'reg' ? P.hold(g.puzzle.regions.indexOf(u.idx)) : P.tab(u)); // a whole row, column or yard
    const reason = w => w.kind === 'pointing' ? [{ type: 'reg', idx: w.reg }] : w.kind === 'claiming' ? [w.line] : w.kind === 'crowd' ? [w.unit]
      : w.kind === 'subsetRegs' ? w.regs.map(r => ({ type: 'reg', idx: r })) : w.kind === 'subsetLines' ? w.lines : null;
    // a square of the solution must never be crossed off, whatever is pointed at
    const s0 = g.puzzle.solution[0]; let safe = true;
    if (g.cells[s0] === 0) {
      P.tap(s0);
      for (const u of [{ type: 'row', idx: 1 }, { type: 'col', idx: (s0 + 1) % n }, { type: 'reg', idx: (g.puzzle.regions[s0] + 1) % n }]) name(u);
      safe = g.cells[s0] === 0;
      while (P.busy) P.backOut();
      P.press('clear');
    }
    const kinds = {}; let rejected = '', guard = 0, flip = 0;
    // a pup x that is not the only spot yet, and a unit u that on its own rules out every other square of x’s row, column or yard
    const pupFirst = () => { const st = P.st(); for (let x = 0; x < g.N; x++) { if (!g.solution[x] || !st.cand[x] || st.pup[x] || forcedIn(st, x)) continue;
      for (const type of ['reg', 'row', 'col']) for (let idx = 0; idx < n; idx++) { const u = { type, idx }; if (st.unitHasPup(type, idx) || unitHas(st, u, x)) continue;
        if (unitsThrough(st, x).some(v => !st.unitHasPup(v.type, v.idx) && st.unitCells(v.type, v.idx).every(c => c === x || rulesOut(st, [u], c)))) return { x, u }; } } return null; };
    while (!g.done && !rejected && guard++ < 600) {
      const step = nextDeduction(g.puzzle, g.board(), g.puzzle.solution); if (!step) break;
      const w = step.why;
      if (stopAt === 'pupfirst') { const f = pupFirst(); if (f) return f; }
      if (stopAt && w.kind === stopAt) return { stop: step.place.length ? step.place[0] : step.eliminate[0] }; // leave this step for real pointer input
      kinds[w.kind] = (kinds[w.kind] || 0) + 1;
      if (w.kind === 'basic') { for (const i of step.eliminate) { P.tap(i); if (g.cells[i] !== 1) rejected = 'basic'; } }
      else if (w.kind === 'single') { if (!g.tryPlacePup(step.place[0])) rejected = 'single'; }
      else if (w.kind === 'hypo') {
        if (style === 'A') { g.tryPlacePup(w.cell); P.press('whatif'); } else P.tap(w.cell); // A: a refused pup offers the what-if; B: a tap is one
        if (P.tests.length !== 1) { rejected = 'what-if did not start'; break; }
        for (const x of w.chain) g.tryPlacePup(x.cell);
        if (P.top.steps.length !== w.chain.length) { rejected = 'what-if chain'; break; }
        if (style === 'A' && flip++ % 2) name(w.unit); else P.tap(g.unitCells(w.unit).find(c => c !== w.cell)); // name the unit left with no room, or tap one of its squares
        if (P.busy || g.cells[w.cell] !== 1) rejected = 'what-if end';
      } else {
        const us = reason(w); if (!us) { rejected = w.kind; break; }
        for (const i of step.eliminate) {
          const r = P.tap(i);
          if (style === 'A' && r === 'asked') { // point at the reason: whole units one time, their open squares one at a time the next
            if (flip++ % 2) for (const u of us) name(u);
            else { const st = P.st(); for (const u of us) for (const c of st.unitCells(u.type, u.idx)) if (P.ask >= 0) P.tap(c); }
          } else if (style === 'B' && r === 'tested') { // one unit: tap any square of it; several: name each
            if (us.length === 1) P.tap(g.unitCells(us[0]).find(c => c !== i)); else for (const u of us) { if (P.tests.length) name(u); }
          }
          if (g.cells[i] !== 1 || P.busy) { rejected = w.kind + ' at ' + i + ' (' + r + ')'; break; }
        }
      }
    }
    a.profile.settings.noGuess = false; a.profile.settings.noGuessStyle = 'A';
    return { done: g.done, hearts: g.hearts, kinds, rejected, safe };
  }, { style, stopAt });
  for (const style of ['A', 'B']) {
    const solve = await solveIn(style);
    check(solve.done && !solve.rejected && solve.hearts === 3 && solve.safe, `no-guessing ${style}: a 9×9 is solved start to finish by entering every step (` + JSON.stringify(solve) + ')');
    await page.waitForTimeout(900); // the win card
  }
  // two campaign levels that need every kind of step, what-ifs included
  for (const id of [60, 160]) {
    await app(page, (a, id) => a.go('game', { kind: 'level', id }), id);
    await page.waitForFunction(id => { const g = window.dokuPuppies.game; return g && g.cellEls && g.info.id === id; }, id);
    if (id === 60) {
      // the same moves work inside a what-if: with a pup on trial, a square that only then is ruled out gets crossed off inside it
      const nested = await page.evaluate(async () => {
        const { rulesOut, forcedIn } = await import('./js/engine.js');
        const a = window.dokuPuppies, g = a.game, P = g.proof, cells = () => Array.from(g.cells).join('');
        a.closeAllDialogs();
        a.profile.settings.noGuess = true; a.profile.settings.noGuessStyle = 'A'; g.settings = a.profile.settings; g.syncMode();
        const before = cells(), st0 = P.st(); let f = null;
        for (let t = 0; t < g.N && !f; t++) { // a correct pup, so the what-if can never run into a dead end of its own
          if (!g.solution[t] || !st0.cand[t] || st0.pup[t] || forcedIn(st0, t)) continue;
          const st = st0.clone(); st.place(t);
          for (let r = 0; r < g.n && !f; r++) {
            if (st.unitHasPup('reg', r) || g.puzzle.regions[t] === r) continue;
            for (let x = 0; x < g.N; x++) if (st.cand[x] && !st.pup[x] && rulesOut(st, [{ type: 'reg', idx: r }], x) && !rulesOut(st0, [{ type: 'reg', idx: r }], x)) { f = { t, r, x }; break; }
          }
        }
        if (!f) return { found: false };
        const res = { found: true }, yard = g.puzzle.regions.indexOf(f.r);
        // A: a refused pup offers the what-if; "?" on x; hold the yard
        g.tryPlacePup(f.t); P.press('whatif');
        res.asked = P.tests.length === 1 && P.tap(f.x) === 'asked';
        P.hold(yard);
        res.insideA = P.tests.length === 1 && P.top.steps.length === 1 && P.top.steps[0].i === f.x && P.ask < 0 && g.cells[f.x] === 0;
        a.sniff(); // a hint is about the real board: it ends the what-if, and its bubble takes the panel's place
        res.sniff = !P.busy && !!g.hint && document.getElementById('basis-bubble').classList.contains('hidden') && !document.getElementById('hint-bubble').classList.contains('hidden');
        g.clearHint(true); a.updateHud();
        res.panelBack = !document.getElementById('basis-bubble').classList.contains('hidden') && document.getElementById('hint-bubble').classList.contains('hidden');
        res.outA = cells() === before;
        // B: a tap is a ghost; a tap on x inside is a second ghost; a square of the yard settles the inner one
        a.profile.settings.noGuessStyle = 'B'; g.syncMode();
        res.testB = P.tap(f.t) === 'tested' && P.tap(f.x) === 'tested' && P.tests.length === 2;
        P.tap(g.unitCells({ type: 'reg', idx: f.r }).find(c => c !== f.x && c !== f.t));
        res.insideB = P.tests.length === 1 && P.top.steps.length === 1 && P.top.steps[0].i === f.x && g.cells[f.x] === 0;
        g.undo(); res.undoB = P.tests.length === 1 && P.top.steps.length === 0;
        while (P.busy) P.backOut();
        res.outB = cells() === before;
        return res;
      });
      check(nested.found && nested.asked && nested.insideA && nested.sniff && nested.panelBack && nested.outA && nested.testB && nested.insideB && nested.undoB && nested.outB, 'both styles: a square is crossed off inside a what-if and the real board is untouched; Sniff ends a what-if (' + JSON.stringify(nested) + ')');
      // pup first on the real board: ask for a pup that is not the only spot yet, then name the unit that rules its rivals out
      const pf1 = await solveIn('A', 'pupfirst');
      const got = pf1.u ? await page.evaluate(({ x, u }) => {
        const g = window.dokuPuppies.game, P = g.proof, r = { before: g.cells[x] };
        r.waits = g.tryPlacePup(x) === false && P.want === x; r.rivals = document.querySelectorAll('#board .cell.rival').length;
        r.buttons = [...document.querySelectorAll('#basis-actions button')].map(b => b.dataset.act).join();
        if (u.type === 'reg') P.hold(g.puzzle.regions.indexOf(u.idx)); else P.tab(u);
        r.after = g.cells[x]; r.busy = P.busy; r.hearts = g.hearts; r.title = document.getElementById('basis-title').textContent;
        return r;
      }, pf1) : {};
      check(!!pf1.u && got.before === 0 && got.waits && got.rivals > 0 && got.buttons === 'cancel,whatif' && got.after === 2 && !got.busy && got.hearts === 3 && got.title === 'Seated', 'A, pup first: a pup asked for early waits, and sits once the named unit rules out its rivals (' + JSON.stringify({ pf1, got }) + ')');
      // real pointer input on a pup's only spot: one tap says so, a double-tap seats it; then drags
      const centreOf = async i => { const b = await page.locator('#board .cell').nth(i).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
      for (const style of ['A', 'B']) {
        const at = await solveIn(style, 'single');
        const c = await centreOf(at.stop);
        await page.mouse.click(c.x, c.y); await page.waitForTimeout(450);
        const one = await app(page, (a, i) => ({ cell: a.game.cells[i], busy: a.game.proof.busy, title: document.getElementById('basis-title').textContent }), at.stop);
        check(one.cell === 0 && !one.busy && one.title === 'Only spot', `${style}: one tap on a pup’s only spot says so instead of asking or testing (` + JSON.stringify(one) + ')');
        await page.mouse.click(c.x, c.y); await page.waitForTimeout(90); await page.mouse.click(c.x, c.y); await page.waitForTimeout(500);
        check((await app(page, (a, i) => a.game.cells[i], at.stop)) === 2, `${style}: a double-tap seats the pup on its only spot`);
        if (style === 'B') continue;
        const pair = await app(page, a => { const g = a.game, st = g.proof.st(), n = g.n; let blocked = -1, open = -1; for (let i = 0; i < g.N - 1; i++) { if (i % n === n - 1 || g.cells[i] !== 0 || g.cells[i + 1] !== 0) continue; const o1 = st.cand[i] && !st.pup[i], o2 = st.cand[i + 1] && !st.pup[i + 1]; if (!o1 && !o2 && blocked < 0) blocked = i; if (o1 && o2 && open < 0) open = i; } return { blocked, open }; });
        const drag = async i => { const p1 = await centreOf(i), p2 = await centreOf(i + 1); await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move((p1.x + p2.x) / 2, p1.y, { steps: 3 }); await page.mouse.move(p2.x, p2.y, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(300); };
        check(pair.blocked >= 0 && pair.open >= 0, 'the board has blocked and open pairs to drag across (' + JSON.stringify(pair) + ')');
        if (pair.blocked >= 0) { await drag(pair.blocked); check(await app(page, (a, i) => a.game.cells[i] === 1 && a.game.cells[i + 1] === 1, pair.blocked), 'no-guessing: a drag crosses off squares a seated pup blocks'); }
        if (pair.open >= 0) { await drag(pair.open); check(await app(page, (a, i) => a.game.cells[i] === 0 && a.game.cells[i + 1] === 0 && !a.game.proof.busy, pair.open), 'no-guessing: a drag never crosses an unproven square, and never asks'); }
      }
    }
    for (const style of ['A', 'B']) {
      const solve = await solveIn(style);
      check(solve.done && !solve.rejected && solve.hearts === 3 && solve.safe && solve.kinds.hypo > 0, `no-guessing ${style}: level ${id} is solved by entering every step, what-ifs included (` + JSON.stringify(solve) + ')');
      await page.waitForTimeout(900);
    }
  }
  // a position from play (level 123, style A): a what-if on r9c9 that has run on to seven pups. The player wants a pup on
  // r3c8 "because rows 1 and 6 take columns 1 and 10 between them": pup first, then the two rows. After that the what-if
  // fills the whole board, which has to count as solving it.
  await app(page, a => a.go('game', { kind: 'level', id: 123 }));
  await page.waitForFunction(() => { const g = window.dokuPuppies.game; return g && g.cellEls && g.info.id === 123; });
  const played = await page.evaluate(() => {
    const a = window.dokuPuppies, g = a.game, P = g.proof, n = g.n, at = (r, c) => (r - 1) * n + (c - 1);
    a.closeAllDialogs();
    a.profile.settings.noGuess = true; a.profile.settings.noGuessStyle = 'A'; g.settings = a.profile.settings; g.syncMode();
    const real = { 1: [2, 3, 7, 9], 2: [2, 7, 9], 3: [2, 3, 7, 9], 4: [5, 7, 9], 5: [2, 6, 7, 9], 6: [2, 3, 4, 7, 9], 7: [2, 5, 7], 8: [2, 3, 6, 8, 10], 9: [4, 6, 8], 10: [2, 3, 4, 7, 9] };
    for (const r in real) for (const c of real[r]) { g.cells[at(Number(r), c)] = 1; g.paintCell(at(Number(r), c), false); }
    g.changed();
    g.tryPlacePup(at(9, 9)); P.press('whatif');
    P.top.steps.push({ t: 'x', i: at(4, 1) }, { t: 'x', i: at(4, 3) }, { t: 'x', i: at(10, 1) });
    for (const [r, c] of [[2, 3], [4, 2], [5, 5], [7, 4], [8, 7], [10, 6]]) P.top.steps.push({ t: 'pup', i: at(r, c) });
    P.refresh();
    const res = {};
    res.waits = g.tryPlacePup(at(3, 8)) === false && P.want === at(3, 8) && document.getElementById('basis-title').textContent === 'Why here?';
    res.rivals = [...document.querySelectorAll('#board .cell.rival')].map(d => Number(d.dataset.i)).sort((x, y) => x - y).join() === [at(1, 10), at(3, 10), at(6, 8)].join();
    P.tab({ type: 'row', idx: 0 }); res.oneRow = P.want === at(3, 8) && P.ghostAt(at(3, 8)) === null;
    P.tab({ type: 'row', idx: 5 }); res.seated = P.want < 0 && P.ghostAt(at(3, 8)) === 'pup' && g.cells[at(3, 8)] === 0;
    g.undo(); res.undone = P.ghostAt(at(3, 8)) === null && P.tests.length === 1;
    // the other way round: cross off the rival r3c10 with the same two rows, and the pup has its only spot
    res.asked = P.tap(at(3, 10)) === 'asked'; P.tab({ type: 'row', idx: 0 }); P.tab({ type: 'row', idx: 5 });
    res.crossed = P.ghostAt(at(3, 10)) === 'x' && g.tryPlacePup(at(3, 8)) === true;
    res.last = g.tryPlacePup(at(1, 1)) === true && !g.done && g.tryPlacePup(at(6, 10)) === true;
    res.won = g.done && !P.busy && Array.from(g.cells).filter(v => v === 2).length === n && g.hearts === 3 && !document.querySelector('#board .cell.ghost') && !document.getElementById('board').classList.contains('whatif');
    a.profile.settings.noGuess = false;
    return res;
  });
  check(Object.values(played).every(Boolean), 'A, from play: the pup waits for its reason, two rows seat it inside the what-if, and a what-if that fills the board solves it (' + JSON.stringify(played) + ')');
  await page.waitForTimeout(900);
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

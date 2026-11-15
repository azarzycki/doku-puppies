// No-guessing mode: the reasons a player can give must cover every step the hint engine can take (completeness),
// and must never rule out a square that belongs to the solution (soundness).
//   node tools/test-proof.js [puzzles]
import { Rng, generatePuzzle, initialState, findStep, proofState, forcedIn, stuck, rulesOut, unitsWithin, crowdedBy } from '../js/engine.js';

const rng = new Rng('proof-fuzz');
const PUZZLES = Number(process.argv[2]) || 160;
let puzzles = 0, bad = 0;
const seen = {}, accepted = { units: 0, squares: 0, touch: 0, block: 0 };
const fail = (...a) => { bad++; if (bad < 20) console.log('FAIL', ...a); };
const t0 = Date.now();
const same = (a, b) => a.type === b.type && a.idx === b.idx;

/** the rows, columns or yards a player would point at to enter this engine step, or null when the step needs none */
function reasonFor(step) {
  const w = step.why;
  switch (w.kind) {
    case 'pointing': return [{ type: 'reg', idx: w.reg }];
    case 'claiming': return [w.line];
    case 'crowd': return [w.unit];
    case 'subsetRegs': return w.regs.map(r => ({ type: 'reg', idx: r }));
    case 'subsetLines': return w.lines;
    default: return null;
  }
}

for (let k = 0; k < PUZZLES; k++) {
  const n = 6 + rng.int(5);
  const res = generatePuzzle(n, rng, { rank: 1 + rng.int(5), attempts: 200, deadlineMs: 4000 });
  if (!res) continue;
  puzzles++;
  const p = res.puzzle;
  const sol = new Set(); for (let r = 0; r < n; r++) sol.add(r * n + p.solution[r]);

  // completeness: walk the logical solve; each step must be enterable from the state it was found in
  const st = initialState(p);
  let guard = 0;
  while (!st.solved() && guard++ < 2000) {
    const step = findStep(st);
    if (!step) { fail('engine stuck'); break; }
    const kind = step.why.kind; seen[kind] = (seen[kind] || 0) + 1;
    if (kind === 'single') {
      if (!forcedIn(st, step.place[0])) fail('single not seen as forced', n);
    } else if (kind === 'hypo') {
      const ts = st.clone(); ts.place(step.why.cell);
      for (const x of step.why.chain) { if (!forcedIn(ts, x.cell)) fail('what-if chain pup not forced', n); ts.place(x.cell); }
      if (!stuck(ts, [step.why.unit])) fail('what-if does not end in a unit with no room', n);
    } else {
      const us = reasonFor(step);
      // pointing at whole units (fence tabs, a held yard, style B)
      for (const i of step.eliminate) if (!rulesOut(st, us, i)) fail(kind, 'not accepted from its units, n', n);
      // pointing at squares (style A): lighting every open square of those units must stand for them
      const lit = new Set(); for (const u of us) for (const c of st.unitCells(u.type, u.idx)) lit.add(c);
      const read = unitsWithin(st, lit);
      if (!us.every(u => read.some(r => same(r, u)))) fail(kind, 'lit squares not read back as their units, n', n);
      for (const i of step.eliminate) if (!rulesOut(st, read, i)) fail(kind, 'not accepted from its squares, n', n);
    }
    for (const i of step.eliminate) st.eliminate(i);
    for (const i of step.place) st.place(i);
  }

  // soundness: from random true knowledge, no reason may rule out a solution square or call a dead end
  const units = [];
  for (const type of ['row', 'col', 'reg']) for (let i = 0; i < n; i++) units.push({ type, idx: i });
  for (let trial = 0; trial < 4; trial++) {
    const board = { pups: new Set(), marks: new Set() };
    for (let i = 0; i < n * n; i++) { if (sol.has(i)) { if (rng.chance(0.2)) board.pups.add(i); } else if (rng.chance(0.45)) board.marks.add(i); }
    const s = proofState(p, board);
    const open = []; for (let i = 0; i < n * n; i++) if (s.cand[i] && !s.pup[i]) open.push(i);
    // free crosses: a square that crowds out a row, column or yard is never a solution square, and touching is a case of blocking
    for (const i of open) {
      const tc = crowdedBy(s, i, 'touch'), bc = crowdedBy(s, i, 'block');
      if (tc) accepted.touch++;
      if (bc) accepted.block++;
      if ((tc || bc) && sol.has(i)) fail('UNSOUND free cross, n', n);
      if (tc && !bc) fail('touching without blocking, n', n);
    }
    for (let e = 0; e < 90; e++) {
      let us, how;
      if (e % 3) { us = rng.shuffle(units.slice()).slice(0, 1 + rng.int(4)); how = 'units'; }
      else { // a group of lit squares: everything a few units have left, plus some strays
        const lit = new Set();
        for (const u of rng.shuffle(units.slice()).slice(0, 1 + rng.int(3))) for (const c of s.unitCells(u.type, u.idx)) lit.add(c);
        for (let x = rng.int(4); x > 0 && open.length; x--) lit.add(open[rng.int(open.length)]);
        us = unitsWithin(s, lit); how = 'squares';
      }
      if (!us.length) continue;
      if (stuck(s, us)) fail('UNSOUND dead end called on a true board, n', n, JSON.stringify(us));
      for (const i of open) {
        if (!rulesOut(s, us, i)) continue;
        accepted[how]++;
        if (sol.has(i)) fail('UNSOUND', how, 'ruled out a solution square, n', n, JSON.stringify(us));
      }
    }
  }
}
console.log(`${puzzles} puzzles; engine steps entered: ${JSON.stringify(seen)}; random proofs accepted: ${JSON.stringify(accepted)}; ${bad} failures; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(bad ? 1 : 0);

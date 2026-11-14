// No-guessing mode: the evidence a player can enter must cover every step the hint engine can take (completeness),
// and must never accept a square that belongs to the solution (soundness).
//   node tools/test-proof.js
import { Rng, generatePuzzle, initialState, findStep, proofState, proveCross, forcedIn, starved } from '../js/engine.js';

const rng = new Rng('proof-fuzz');
let puzzles = 0, bad = 0;
const seen = {}, accepted = { crowd: 0, lock: 0 };
const fail = (...a) => { bad++; if (bad < 20) console.log('FAIL', ...a); };
const t0 = Date.now();

/** the evidence a player would pick to enter this engine step, or null when the step needs none */
function evidenceFor(step) {
  const w = step.why;
  switch (w.kind) {
    case 'pointing': return [{ type: 'reg', idx: w.reg }, w.line];
    case 'claiming': return [w.line, { type: 'reg', idx: w.reg }];
    case 'crowd': return [w.unit];
    case 'subsetRegs': case 'subsetLines': return [...w.regs.map(r => ({ type: 'reg', idx: r })), ...w.lines];
    default: return null;
  }
}

for (let k = 0; k < 160; k++) {
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
      if (!starved(ts, step.why.unit)) fail('what-if does not end in a starved unit', n);
    } else {
      const ev = evidenceFor(step);
      for (const i of step.eliminate) { const r = proveCross(st, ev, i); if (!r.ok) fail(kind, 'elimination rejected:', r.reason, 'n', n); }
    }
    for (const i of step.eliminate) st.eliminate(i);
    for (const i of step.place) st.place(i);
  }

  // soundness: from random true knowledge, random evidence must never rule out a solution square
  const units = [];
  for (const type of ['row', 'col', 'reg']) for (let i = 0; i < n; i++) units.push({ type, idx: i });
  for (let trial = 0; trial < 6; trial++) {
    const board = { pups: new Set(), marks: new Set() };
    for (let i = 0; i < n * n; i++) { if (sol.has(i)) { if (rng.chance(0.2)) board.pups.add(i); } else if (rng.chance(0.45)) board.marks.add(i); }
    const s = proofState(p, board);
    for (let e = 0; e < 400; e++) {
      const size = rng.chance(0.35) ? 1 : 2 * (1 + rng.int(3));
      const ev = rng.shuffle(units.slice()).slice(0, size);
      for (let i = 0; i < n * n; i++) {
        if (!s.cand[i] || s.pup[i]) continue;
        const r = proveCross(s, ev, i);
        if (!r.ok) continue;
        accepted[r.kind]++;
        if (sol.has(i)) fail('UNSOUND', r.kind, 'ruled out a solution square, n', n, JSON.stringify(ev));
      }
    }
  }
}
console.log(`${puzzles} puzzles; engine steps entered: ${JSON.stringify(seen)}; random proofs accepted: ${JSON.stringify(accepted)}; ${bad} failures; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(bad ? 1 : 0);

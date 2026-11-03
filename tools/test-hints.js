// Fuzz test: from random *correct* partial states (true X marks + some solution pups), the hint
// engine must always be able to walk the board to the end without getting stuck.
import { Rng, generatePuzzle, nextDeduction } from '../js/engine.js';

const rng = new Rng('hint-fuzz');
let puzzles = 0, walks = 0, stuck = 0;
const t0 = Date.now();
for (let k = 0; k < 120; k++) {
  const n = 6 + rng.int(4);
  const res = generatePuzzle(n, rng, { rank: 1 + rng.int(4), attempts: 200, deadlineMs: 4000 });
  if (!res) continue;
  puzzles++;
  const p = res.puzzle;
  const solCells = new Set();
  for (let r = 0; r < n; r++) solCells.add(r * n + p.solution[r]);
  for (let trial = 0; trial < 4; trial++) {
    const board = { pups: new Set(), marks: new Set() };
    // random correct knowledge
    for (let i = 0; i < n * n; i++) {
      if (solCells.has(i)) { if (rng.chance(0.25) && !(p.givens || []).includes(i)) board.pups.add(i); }
      else if (rng.chance(0.35)) board.marks.add(i);
    }
    // sometimes a wrong mark, which the hint must flag first
    const wrongMark = rng.chance(0.2);
    if (wrongMark) { const sc = [...solCells].filter(i => !board.pups.has(i) && !(p.givens || []).includes(i)); if (sc.length) board.marks.add(sc[rng.int(sc.length)]); }
    let steps = 0, sawBadMark = false;
    while (steps++ < 1000) {
      const h = nextDeduction(p, board, p.solution);
      if (!h) break;
      if (h.why.kind === 'stuck') { stuck++; console.log('STUCK', n, 'rank', res.grade.rank, 'pups', board.pups.size, 'marks', board.marks.size); break; }
      if (h.why.kind === 'badMark') sawBadMark = true;
      for (const i of (h.unmark || [])) board.marks.delete(i);
      for (const i of h.eliminate) board.marks.add(i);
      for (const i of h.place) board.pups.add(i);
    }
    if (wrongMark && !sawBadMark) console.log('missed bad mark');
    const placed = board.pups.size + (p.givens || []).length;
    if (placed !== n) console.log('did not finish', placed, 'of', n);
    walks++;
  }
}
console.log(`${puzzles} puzzles, ${walks} walks, ${stuck} stuck, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(stuck ? 1 : 0);

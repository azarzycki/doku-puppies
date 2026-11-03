// Quick statistics for the generator: acceptance rates, rank distribution, timing.
import { Rng, generateSolution, growRegions, countSolutions, solveLogically, generatePuzzle, nextDeduction, validatePuzzle, encodePuzzle, decodePuzzle, refineToUnique } from '../js/engine.js';

const sizes = (process.argv[2] || '5,6,7,8,9,10,11').split(',').map(Number);
const samples = Number(process.argv[3] || 20);

for (const n of sizes) {
  const rng = new Rng('stats-' + n);
  let unique = 0, logic = 0; const ranks = {}; let t0 = Date.now(); let tSolve = 0, tRefine = 0;
  for (let i = 0; i < samples; i++) {
    const solution = generateSolution(n, rng);
    const regions = growRegions(n, solution, rng, { snaky: rng.next(), minSize: 1 + rng.int(4), bias: rng.next() });
    const puzzle = { n, regions, solution, givens: [] };
    const r0 = Date.now();
    const ok = refineToUnique(puzzle, rng, { minSize: 1 + rng.int(3) });
    tRefine += Date.now() - r0;
    if (!ok) continue;
    unique++;
    const s0 = Date.now();
    const res = solveLogically(puzzle);
    tSolve += Date.now() - s0;
    if (!res.solved) { ranks.unsolved = (ranks.unsolved || 0) + 1; continue; }
    logic++;
    ranks[res.grade.rank] = (ranks[res.grade.rank] || 0) + 1;
  }
  console.log(`n=${n}: unique ${unique}/${samples}, logic-solvable ${logic}/${unique}, ranks ${JSON.stringify(ranks)}, ${Date.now() - t0}ms total, refine ${(tRefine / samples).toFixed(0)}ms/puzzle, ${(tSolve / Math.max(1, unique)).toFixed(1)}ms/solve`);
}

// targeted generation timing
for (const [n, rank] of [[5, 1], [6, 1], [7, 2], [8, 2], [9, 3], [10, 4], [11, 5]]) {
  const t0 = Date.now();
  const res = generatePuzzle(n, new Rng('target-' + n + '-' + rank), { rank, attempts: 400, deadlineMs: 15000 });
  if (!res) { console.log(`target n=${n} rank=${rank}: nothing found`); continue; }
  console.log(`target n=${n} rank=${rank}: got rank ${res.grade.rank} score ${res.grade.score} steps ${res.grade.steps} counts ${JSON.stringify(res.grade.counts)} in ${Date.now() - t0}ms; valid=${validatePuzzle(res.puzzle)}`);
  const enc = encodePuzzle(res.puzzle); const dec = decodePuzzle(enc);
  if (validatePuzzle(dec)) throw new Error('roundtrip failed');
}

// walk a puzzle with hints only, to make sure hints always lead to the end
{
  const res = generatePuzzle(8, new Rng('hintwalk'), { rank: 3, attempts: 300 });
  const p = res.puzzle;
  const board = { pups: new Set(), marks: new Set() };
  let steps = 0, kinds = {};
  while (steps++ < 500) {
    const h = nextDeduction(p, board, p.solution);
    if (!h) break;
    if (h.why.kind === 'stuck') throw new Error('hint got stuck');
    kinds[h.why.kind] = (kinds[h.why.kind] || 0) + 1;
    for (const i of h.eliminate) board.marks.add(i);
    for (const i of h.place) board.pups.add(i);
  }
  console.log('hint walk finished in', steps, 'hints:', JSON.stringify(kinds), 'pups', board.pups.size);
}

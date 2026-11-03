/*
 * Pupdoku puzzle engine
 * ---------------------
 * Rules (same mechanism as Meowdoku / "Queens"):
 *   - the N×N board is split into N connected coloured regions ("yards")
 *   - place exactly one pup in every row, every column and every yard
 *   - pups may never touch, not even diagonally
 *
 * This module is dependency-free and runs both in the browser (ES module) and in Node
 * (used by tools/ to pre-generate the campaign). Everything that involves randomness goes
 * through the seeded Rng so that a given seed produces the same puzzle on every device —
 * that is what makes the daily puzzle identical for everyone.
 *
 * Contents
 *   Rng / hashString          seeded PRNG helpers
 *   generateSolution          random non-touching permutation
 *   growRegions               grow N connected regions around the solution cells
 *   countSolutions            backtracking solver (uniqueness check)
 *   LogicState + techniques   human-style deduction engine (powers hints + grading)
 *   solveLogically / grade    difficulty ranking
 *   nextDeduction             "what should I look at next?" for the in-game hint
 *   generatePuzzle            search for a unique, logic-solvable puzzle of a target rank
 *   encodePuzzle/decodePuzzle compact string form used by levels.json
 */

// ---------------------------------------------------------------- random

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  // FNV-1a, 32 bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = typeof seed === 'string' ? hashString(seed) : (seed >>> 0);
    this.next = mulberry32(this.seed);
  }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  fork(label) { return new Rng(((this.seed ^ hashString(String(label))) + this.int(0x7fffffff)) >>> 0); }
}

// ---------------------------------------------------------------- geometry helpers

export function neighbours8(n, i) {
  const r = (i / n) | 0, c = i % n, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}

function neighbours4(n, i) {
  const r = (i / n) | 0, c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

/** Every cell a pup at `i` would block: its row, column, region and the 8 cells around it. */
export function shadowOf(n, regions, i) {
  const r = (i / n) | 0, c = i % n, reg = regions[i];
  const s = new Uint8Array(n * n);
  for (let k = 0; k < n; k++) { s[r * n + k] = 1; s[k * n + c] = 1; }
  for (let k = 0; k < n * n; k++) if (regions[k] === reg) s[k] = 1;
  for (const k of neighbours8(n, i)) s[k] = 1;
  s[i] = 0;
  return s;
}

// ---------------------------------------------------------------- solution + regions

/** A random permutation p (row -> column) where consecutive rows are never diagonal neighbours. */
export function generateSolution(n, rng) {
  const sol = new Int8Array(n);
  const used = new Uint8Array(n);
  function place(row) {
    if (row === n) return true;
    const cols = rng.shuffle(Array.from({ length: n }, (_, k) => k));
    for (const c of cols) {
      if (used[c]) continue;
      if (row > 0 && Math.abs(sol[row - 1] - c) <= 1) continue;
      used[c] = 1; sol[row] = c;
      if (place(row + 1)) return true;
      used[c] = 0;
    }
    return false;
  }
  place(0);
  return sol;
}

/**
 * Grow N connected regions, region k seeded on the solution cell of row k.
 * style.snaky   0..1  prefer extending from the last-added cell (long thin regions)
 * style.minSize  grow every region to at least this many cells before free growth
 * style.bias     0..1  how strongly to favour small regions when picking who grows
 */
export function growRegions(n, solution, rng, style = {}) {
  const snaky = style.snaky ?? 0.3;
  const minSize = style.minSize ?? 2;
  const bias = style.bias ?? 0.5;
  const N = n * n;
  const regions = new Int8Array(N).fill(-1);
  const cells = Array.from({ length: n }, () => []);
  const last = new Int32Array(n);
  let unassigned = N;
  for (let k = 0; k < n; k++) {
    const i = k * n + solution[k];
    regions[i] = k; cells[k].push(i); last[k] = i; unassigned--;
  }
  function frontier(k) {
    const out = [];
    const src = (snaky > 0 && rng.chance(snaky)) ? [last[k]] : cells[k];
    for (const i of src) for (const j of neighbours4(n, i)) if (regions[j] === -1) out.push(j);
    if (!out.length && src.length === 1) for (const i of cells[k]) for (const j of neighbours4(n, i)) if (regions[j] === -1) out.push(j);
    return out;
  }
  let guard = 0;
  while (unassigned > 0 && guard++ < N * 50) {
    // pick a region to grow: small regions first until minSize, then biased random
    let order = Array.from({ length: n }, (_, k) => k);
    const needy = order.filter(k => cells[k].length < minSize);
    let k;
    if (needy.length) k = rng.pick(needy);
    else if (rng.chance(bias)) {
      const min = Math.min(...order.map(q => cells[q].length));
      k = rng.pick(order.filter(q => cells[q].length === min));
    } else k = rng.pick(order);
    const f = frontier(k);
    if (!f.length) {
      // region is boxed in; let any other region with a frontier grow instead
      const alive = order.filter(q => frontier(q).length);
      if (!alive.length) break;
      k = rng.pick(alive);
    }
    const f2 = frontier(k);
    const j = rng.pick(f2);
    regions[j] = k; cells[k].push(j); last[k] = j; unassigned--;
  }
  if (unassigned > 0) {
    // should not happen (grid is connected) but be safe: attach leftovers to any neighbour
    for (let i = 0; i < N; i++) if (regions[i] === -1) {
      for (const j of neighbours4(n, i)) if (regions[j] !== -1) { regions[i] = regions[j]; break; }
    }
  }
  return regions;
}

function regionConnected(n, regions, k, start) {
  const vis = new Set([start]); const stack = [start];
  let total = 0; for (let i = 0; i < n * n; i++) if (regions[i] === k) total++;
  while (stack.length) { const i = stack.pop(); for (const j of neighbours4(n, i)) if (regions[j] === k && !vis.has(j)) { vis.add(j); stack.push(j); } }
  return vis.size === total;
}

/**
 * Reshape the region map until the puzzle has exactly one solution.
 *
 * Moving a boundary cell x from region k to a neighbouring region k2 kills every solution that
 * puts a pup on x (it would then own two pups in k2 and none in k), leaves the intended solution
 * alone (we never move its cells), but can create new solutions that use x as k2's pup. So each
 * move is scored: when the solution count is small it is counted exactly and only improving
 * moves are accepted (with a two-move look-ahead to escape local minima); when it is huge the
 * most "popular" rival cells are moved where they create the fewest new solutions.
 *
 * minSize keeps regions from collapsing to dots (bigger minimum = fewer trivial one-cell yards).
 * Returns true when the puzzle is unique.
 */
export function refineToUnique(puzzle, rng, opts = {}) {
  const { n, regions, solution } = puzzle;
  const N = n * n;
  const maxIters = opts.maxIters ?? 120;
  const minSize = opts.minSize ?? 1;
  const CAP = opts.cap ?? 1000;
  const solCell = new Int32Array(n);
  for (let r = 0; r < n; r++) { const i = r * n + solution[r]; solCell[regions[i]] = i; }
  const sizes = new Int32Array(n);
  for (let i = 0; i < N; i++) sizes[regions[i]]++;
  const tabu = new Int32Array(N).fill(-100);

  const movable = (x) => solCell[regions[x]] !== x && sizes[regions[x]] > minSize;
  const apply = (x, k2) => { const k = regions[x]; regions[x] = k2; sizes[k]--; sizes[k2]++; return k; };
  const undo = (x, k) => { const k2 = regions[x]; regions[x] = k; sizes[k]++; sizes[k2]--; };
  const legalTargets = (x) => {
    const k = regions[x], out = [];
    for (const j of neighbours4(n, x)) {
      const k2 = regions[j];
      if (k2 === k || out.includes(k2)) continue;
      apply(x, k2);
      if (regionConnected(n, regions, k, solCell[k])) out.push(k2);
      undo(x, k);
    }
    return rng.shuffle(out);
  };

  let { total, counts } = sampleSolutions(puzzle, rng, CAP);
  for (let it = 0; it < maxIters; it++) {
    if (opts.log) opts.log(it, total);
    if (total === 1) return true;
    const order = [];
    for (let i = 0; i < N; i++) if (counts[i] && movable(i) && it - tabu[i] > 6) order.push(i);
    rng.shuffle(order);
    order.sort((a, b) => counts[b] - counts[a]);
    let applied = false;

    if (total >= CAP) {
      // too many solutions to count: move popular rival cells where they create the fewest new ones
      let best = null, bestGain = -Infinity, tried = 0;
      for (const x of order) {
        const targets = legalTargets(x);
        if (!targets.length) continue;
        if (++tried > 8) break;
        for (const k2 of targets) {
          const k = apply(x, k2);
          const created = sampleSolutions(puzzle, rng, Math.max(2, counts[x]), x).total;
          undo(x, k);
          const gain = counts[x] - created;
          if (gain > bestGain) { bestGain = gain; best = [x, k2]; }
        }
      }
      if (!best) {
        const pool = rng.shuffle(Array.from({ length: N }, (_, i) => i).filter(movable));
        for (const x of pool) { const t = legalTargets(x); if (t.length) { best = [x, t[0]]; break; } }
        if (!best) return false;
      }
      apply(best[0], best[1]); tabu[best[0]] = it;
      ({ total, counts } = sampleSolutions(puzzle, rng, CAP));
      continue;
    }

    // exact regime: first improving single move
    for (const x of order) {
      for (const k2 of legalTargets(x)) {
        const k = apply(x, k2);
        const t2 = countSolutions(puzzle, total, puzzle.givens).count;
        if (t2 < total) { total = t2; tabu[x] = it; applied = true; break; }
        undo(x, k);
      }
      if (applied) break;
    }
    if (!applied && total <= 60) {
      // local minimum: look one move further ahead (first improving pair wins)
      outer: for (const x of order) {
        for (const k2 of legalTargets(x)) {
          const k = apply(x, k2);
          const mid = sampleSolutions(puzzle, rng, total + 1);
          const order2 = [];
          for (let i = 0; i < N; i++) if (mid.counts[i] && i !== x && movable(i)) order2.push(i);
          rng.shuffle(order2); order2.sort((a, b) => mid.counts[b] - mid.counts[a]);
          for (const y of order2.slice(0, 10)) {
            for (const k3 of legalTargets(y)) {
              const ky = apply(y, k3);
              const t2 = countSolutions(puzzle, total, puzzle.givens).count;
              if (t2 < total) { total = t2; tabu[x] = it; tabu[y] = it; applied = true; break outer; }
              undo(y, ky);
            }
          }
          undo(x, k);
        }
      }
    }
    if (!applied) {
      // accept a sideways/worsening move to shake loose (tabu stops cycling)
      let moved = false;
      const pool = order.concat(rng.shuffle(Array.from({ length: N }, (_, i) => i).filter(i => movable(i) && !order.includes(i))));
      for (const x of pool) {
        const t = legalTargets(x);
        if (t.length) { apply(x, t[0]); tabu[x] = it; moved = true; break; }
      }
      if (!moved) return false;
    }
    ({ total, counts } = sampleSolutions(puzzle, rng, CAP));
  }
  return total === 1;
}

/**
 * Enumerate up to `cap` solutions in a randomised order and count how many pass through each
 * cell. `forced` (optional) restricts the enumeration to solutions that put a pup on that cell.
 */
export function sampleSolutions(puzzle, rng, cap = 1000, forced = -1) {
  const { n, regions } = puzzle;
  const fixed = puzzle.givens;
  const usedCol = new Uint8Array(n), usedReg = new Uint8Array(n);
  const rowFixed = new Int8Array(n).fill(-1);
  if (fixed) for (const i of fixed) rowFixed[(i / n) | 0] = i % n;
  if (forced >= 0) rowFixed[(forced / n) | 0] = forced % n;
  const found = new Int8Array(n);
  const counts = new Int32Array(n * n);
  const orders = [];
  for (let r = 0; r < n; r++) orders.push(rng.shuffle(Array.from({ length: n }, (_, c) => c)));
  let total = 0;
  function go(row, prevCol) {
    if (row === n) { total++; for (let r = 0; r < n; r++) counts[r * n + found[r]]++; return total >= cap; }
    const cols = orders[row];
    for (let q = 0; q < n; q++) {
      const c = cols[q];
      if (rowFixed[row] !== -1 && rowFixed[row] !== c) continue;
      if (usedCol[c]) continue;
      if (prevCol !== -1 && Math.abs(prevCol - c) <= 1) continue;
      const reg = regions[row * n + c];
      if (usedReg[reg]) continue;
      usedCol[c] = 1; usedReg[reg] = 1; found[row] = c;
      if (go(row + 1, c)) return true;
      usedCol[c] = 0; usedReg[reg] = 0;
    }
    return false;
  }
  go(0, -1);
  return { total, counts };
}

/** First solution that differs from the intended one, or null if the puzzle is unique. */
export function findOtherSolution(puzzle) {
  const { n, regions, solution } = puzzle;
  const fixed = puzzle.givens;
  const usedCol = new Uint8Array(n), usedReg = new Uint8Array(n);
  const rowFixed = new Int8Array(n).fill(-1);
  if (fixed) for (const i of fixed) rowFixed[(i / n) | 0] = i % n;
  const found = new Int8Array(n);
  let result = null;
  function go(row, prevCol, same) {
    if (row === n) { if (!same) { result = Int8Array.from(found); return true; } return false; }
    for (let c = 0; c < n; c++) {
      if (rowFixed[row] !== -1 && rowFixed[row] !== c) continue;
      if (usedCol[c]) continue;
      if (prevCol !== -1 && Math.abs(prevCol - c) <= 1) continue;
      const reg = regions[row * n + c];
      if (usedReg[reg]) continue;
      usedCol[c] = 1; usedReg[reg] = 1; found[row] = c;
      if (go(row + 1, c, same && c === solution[row])) return true;
      usedCol[c] = 0; usedReg[reg] = 0;
    }
    return false;
  }
  go(0, -1, true);
  return result;
}

// ---------------------------------------------------------------- backtracking solver

/** Count solutions (stopping at `limit`). Optionally honours fixed cells (givens). */
export function countSolutions(puzzle, limit = 2, fixed = null) {
  const { n, regions } = puzzle;
  const usedCol = new Uint8Array(n), usedReg = new Uint8Array(n);
  const rowFixed = new Int8Array(n).fill(-1);
  if (fixed) for (const i of fixed) rowFixed[(i / n) | 0] = i % n;
  let count = 0;
  const found = new Int8Array(n);
  let first = null;
  function go(row, prevCol) {
    if (row === n) { count++; if (!first) first = Int8Array.from(found); return count >= limit; }
    for (let c = 0; c < n; c++) {
      if (rowFixed[row] !== -1 && rowFixed[row] !== c) continue;
      if (usedCol[c]) continue;
      if (prevCol !== -1 && Math.abs(prevCol - c) <= 1) continue;
      const reg = regions[row * n + c];
      if (usedReg[reg]) continue;
      usedCol[c] = 1; usedReg[reg] = 1; found[row] = c;
      if (go(row + 1, c)) return true;
      usedCol[c] = 0; usedReg[reg] = 0;
    }
    return false;
  }
  go(0, -1);
  return { count, solution: first };
}

// ---------------------------------------------------------------- logic engine

export const TECH = {
  mistake:  { id: 'mistake',  w: 0,  name: 'Oops',            },
  basic:    { id: 'basic',    w: 0,  name: 'Personal space',   },
  single:   { id: 'single',   w: 1,  name: 'Only one spot',    },
  pointing: { id: 'pointing', w: 2,  name: 'Yard lock',        },
  claiming: { id: 'claiming', w: 3,  name: 'Line lock',        },
  crowd:    { id: 'crowd',    w: 4,  name: 'Too crowded',      },
  subset2:  { id: 'subset2',  w: 6,  name: 'Paired yards',     },
  subset3:  { id: 'subset3',  w: 8,  name: 'Trio of yards',    },
  hypo:     { id: 'hypo',     w: 12, name: 'What if…',         },
};

export class LogicState {
  constructor(puzzle) {
    this.n = puzzle.n;
    this.N = puzzle.n * puzzle.n;
    this.reg = puzzle.regions;
    this.cand = new Uint8Array(this.N).fill(1); // 1 = pup still possible here
    this.pup = new Uint8Array(this.N);          // 1 = pup placed here
    this.shadowCache = new Map();
  }
  clone() {
    const s = Object.create(LogicState.prototype);
    s.n = this.n; s.N = this.N; s.reg = this.reg;
    s.cand = Uint8Array.from(this.cand); s.pup = Uint8Array.from(this.pup);
    s.shadowCache = this.shadowCache;
    return s;
  }
  shadow(i) {
    let s = this.shadowCache.get(i);
    if (!s) { s = shadowOf(this.n, this.reg, i); this.shadowCache.set(i, s); }
    return s;
  }
  place(i) {
    this.pup[i] = 1; this.cand[i] = 1;
    const s = this.shadow(i);
    for (let k = 0; k < this.N; k++) if (s[k]) this.cand[k] = 0;
  }
  eliminate(i) { if (!this.pup[i]) this.cand[i] = 0; }
  /** open candidate cells (not pups) of a unit. type: 'row' | 'col' | 'reg' */
  unitCells(type, idx) {
    const out = [];
    const { n } = this;
    if (type === 'row') { for (let c = 0; c < n; c++) { const i = idx * n + c; if (this.cand[i] && !this.pup[i]) out.push(i); } }
    else if (type === 'col') { for (let r = 0; r < n; r++) { const i = r * n + idx; if (this.cand[i] && !this.pup[i]) out.push(i); } }
    else { for (let i = 0; i < this.N; i++) if (this.reg[i] === idx && this.cand[i] && !this.pup[i]) out.push(i); }
    return out;
  }
  unitHasPup(type, idx) {
    const { n } = this;
    if (type === 'row') { for (let c = 0; c < n; c++) if (this.pup[idx * n + c]) return true; return false; }
    if (type === 'col') { for (let r = 0; r < n; r++) if (this.pup[r * n + idx]) return true; return false; }
    for (let i = 0; i < this.N; i++) if (this.reg[i] === idx && this.pup[i]) return true;
    return false;
  }
  pupCount() { let k = 0; for (let i = 0; i < this.N; i++) k += this.pup[i]; return k; }
  solved() { return this.pupCount() === this.n; }
  /** returns the first unit left with no candidates and no pup, or null */
  contradiction() {
    const { n } = this;
    for (const type of ['reg', 'row', 'col']) {
      for (let idx = 0; idx < n; idx++) {
        if (this.unitHasPup(type, idx)) continue;
        if (this.unitCells(type, idx).length === 0) return { type, idx };
      }
    }
    return null;
  }
}

const UNIT_TYPES = ['reg', 'row', 'col'];

/* Each technique returns a step: { tech, place:[], eliminate:[], focus:{cells, units}, why } or null.
   `focus.cells` are the cells to spotlight and `focus.units` the units to outline. */

function techSingle(st) {
  const { n } = st;
  for (const type of UNIT_TYPES) {
    for (let idx = 0; idx < n; idx++) {
      if (st.unitHasPup(type, idx)) continue;
      const cells = st.unitCells(type, idx);
      if (cells.length === 1) {
        return { tech: TECH.single, place: [cells[0]], eliminate: [], focus: { cells: [cells[0]], units: [{ type, idx }] },
          why: { kind: 'single', unit: { type, idx }, cell: cells[0] } };
      }
    }
  }
  return null;
}

function techPointing(st) {
  // all candidates of a region lie in one row (or column) -> other regions can't use that line
  const { n } = st;
  for (let reg = 0; reg < n; reg++) {
    if (st.unitHasPup('reg', reg)) continue;
    const cells = st.unitCells('reg', reg);
    if (!cells.length) continue;
    for (const type of ['row', 'col']) {
      const idxOf = i => type === 'row' ? ((i / n) | 0) : (i % n);
      const line = idxOf(cells[0]);
      if (!cells.every(i => idxOf(i) === line)) continue;
      const elim = st.unitCells(type, line).filter(i => st.reg[i] !== reg);
      if (elim.length) {
        return { tech: TECH.pointing, place: [], eliminate: elim, focus: { cells, units: [{ type: 'reg', idx: reg }, { type, idx: line }] },
          why: { kind: 'pointing', reg, line: { type, idx: line }, cells } };
      }
    }
  }
  return null;
}

function techClaiming(st) {
  // all candidates of a row (or column) lie in one region -> that region's pup is in this line
  const { n } = st;
  for (const type of ['row', 'col']) {
    for (let idx = 0; idx < n; idx++) {
      if (st.unitHasPup(type, idx)) continue;
      const cells = st.unitCells(type, idx);
      if (!cells.length) continue;
      const reg = st.reg[cells[0]];
      if (!cells.every(i => st.reg[i] === reg)) continue;
      const idxOf = i => type === 'row' ? ((i / n) | 0) : (i % n);
      const elim = st.unitCells('reg', reg).filter(i => idxOf(i) !== idx);
      if (elim.length) {
        return { tech: TECH.claiming, place: [], eliminate: elim, focus: { cells, units: [{ type, idx }, { type: 'reg', idx: reg }] },
          why: { kind: 'claiming', reg, line: { type, idx }, cells } };
      }
    }
  }
  return null;
}

function techCrowd(st) {
  // "Too crowded": a pup on cell c would block every remaining spot of some other unit, so c is
  // impossible. All such cells for one victim unit are reported together as one step (that is how
  // a person sees it: "the pink yard can only use these two squares, so nothing may sit next to both").
  const { n, N } = st;
  let best = null;
  for (const type of UNIT_TYPES) {
    for (let idx = 0; idx < n; idx++) {
      if (st.unitHasPup(type, idx)) continue;
      const cells = st.unitCells(type, idx);
      if (!cells.length || cells.length > 6) continue;
      const elim = [];
      for (let c = 0; c < N; c++) {
        if (!st.cand[c] || st.pup[c]) continue;
        const s = st.shadow(c);
        let all = true;
        for (const i of cells) if (!s[i]) { all = false; break; }
        if (all) elim.push(c);
      }
      if (!elim.length) continue;
      const step = { tech: TECH.crowd, place: [], eliminate: elim, focus: { cells: [...cells, ...elim], units: [{ type, idx }] },
        why: { kind: 'crowd', unit: { type, idx }, victims: cells, cells: elim } };
      // prefer the smallest victim unit (clearest explanation), then the most eliminations
      if (!best || cells.length < best.why.victims.length || (cells.length === best.why.victims.length && elim.length > best.eliminate.length)) best = step;
    }
  }
  return best;
}

function combos(arr, k) {
  const out = [];
  (function rec(start, acc) {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
  })(0, []);
  return out;
}

function techSubset(st, k) {
  const { n } = st;
  const tech = k === 2 ? TECH.subset2 : TECH.subset3;
  for (const lineType of ['row', 'col']) {
    const idxOf = i => lineType === 'row' ? ((i / n) | 0) : (i % n);
    // regions -> lines
    const regs = [];
    for (let reg = 0; reg < n; reg++) {
      if (st.unitHasPup('reg', reg)) continue;
      const cells = st.unitCells('reg', reg);
      if (!cells.length) continue;
      const lines = new Set(cells.map(idxOf));
      if (lines.size <= k) regs.push({ reg, cells, lines });
    }
    for (const group of combos(regs, k)) {
      const union = new Set();
      for (const g of group) for (const l of g.lines) union.add(l);
      if (union.size !== k) continue;
      const regSet = new Set(group.map(g => g.reg));
      const elim = [];
      for (const l of union) for (const i of st.unitCells(lineType, l)) if (!regSet.has(st.reg[i])) elim.push(i);
      if (elim.length) {
        return { tech, place: [], eliminate: elim,
          focus: { cells: group.flatMap(g => g.cells), units: [...group.map(g => ({ type: 'reg', idx: g.reg })), ...[...union].map(l => ({ type: lineType, idx: l }))] },
          why: { kind: 'subsetRegs', regs: [...regSet], lines: [...union].map(l => ({ type: lineType, idx: l })) } };
      }
    }
    // lines -> regions
    const lines = [];
    for (let l = 0; l < n; l++) {
      if (st.unitHasPup(lineType, l)) continue;
      const cells = st.unitCells(lineType, l);
      if (!cells.length) continue;
      const regsIn = new Set(cells.map(i => st.reg[i]));
      if (regsIn.size <= k) lines.push({ l, cells, regs: regsIn });
    }
    for (const group of combos(lines, k)) {
      const union = new Set();
      for (const g of group) for (const r of g.regs) union.add(r);
      if (union.size !== k) continue;
      const lineSet = new Set(group.map(g => g.l));
      const elim = [];
      for (const reg of union) for (const i of st.unitCells('reg', reg)) if (!lineSet.has(idxOf(i))) elim.push(i);
      if (elim.length) {
        return { tech, place: [], eliminate: elim,
          focus: { cells: group.flatMap(g => g.cells), units: [...group.map(g => ({ type: lineType, idx: g.l })), ...[...union].map(r => ({ type: 'reg', idx: r }))] },
          why: { kind: 'subsetLines', lines: [...lineSet].map(l => ({ type: lineType, idx: l })), regs: [...union] } };
      }
    }
  }
  return null;
}

/** propagate singles after a hypothetical placement; returns {contradiction, chain} */
function propagateSingles(st, maxSteps = 64) {
  const chain = [];
  for (let step = 0; step < maxSteps; step++) {
    const c = st.contradiction();
    if (c) return { contradiction: c, chain };
    const s = techSingle(st);
    if (!s) return { contradiction: null, chain };
    st.place(s.place[0]);
    chain.push({ cell: s.place[0], unit: s.why.unit });
  }
  return { contradiction: null, chain };
}

function techHypo(st) {
  const { N } = st;
  let best = null;
  for (let c = 0; c < N; c++) {
    if (!st.cand[c] || st.pup[c]) continue;
    const trial = st.clone();
    trial.place(c);
    const { contradiction, chain } = propagateSingles(trial);
    if (contradiction) {
      const step = { tech: TECH.hypo, place: [], eliminate: [c], focus: { cells: [c, ...chain.map(x => x.cell)], units: [contradiction] },
        why: { kind: 'hypo', cell: c, chain, unit: contradiction } };
      if (!best || chain.length < best.why.chain.length) best = step;
      if (chain.length <= 1) return step;
    }
  }
  return best;
}

const TECHNIQUES = [
  st => techSingle(st),
  st => techPointing(st),
  st => techClaiming(st),
  st => techCrowd(st),
  st => techSubset(st, 2),
  st => techSubset(st, 3),
  st => techHypo(st),
];

function applyStep(st, step) {
  for (const i of step.eliminate) st.eliminate(i);
  for (const i of step.place) st.place(i);
}

/** Find the easiest technique that makes progress from this state. */
export function findStep(st, maxTechIndex = TECHNIQUES.length) {
  for (let t = 0; t < maxTechIndex; t++) {
    const step = TECHNIQUES[t](st);
    if (!step) continue;
    // drop eliminations that are already known, keep placements
    step.eliminate = step.eliminate.filter(i => st.cand[i] && !st.pup[i]);
    if (step.place.length || step.eliminate.length) return step;
  }
  return null;
}

export function initialState(puzzle) {
  const st = new LogicState(puzzle);
  for (const g of (puzzle.givens || [])) st.place(g);
  return st;
}

/**
 * Solve with human techniques only. Returns the step list, whether it got to the end, and a
 * difficulty grade. A puzzle the engine can't finish is never shipped (hints must always work).
 */
export function solveLogically(puzzle) {
  const st = initialState(puzzle);
  const steps = [];
  let guard = 0;
  while (!st.solved() && guard++ < 2000) {
    const step = findStep(st);
    if (!step) break;
    applyStep(st, step);
    steps.push(step);
  }
  const solved = st.solved();
  return { solved, steps, grade: gradeSteps(puzzle.n, steps, solved) };
}

export const RANKS = [
  { id: 1, name: 'Puppy',     label: 'Easy' },
  { id: 2, name: 'Good dog',  label: 'Medium' },
  { id: 3, name: 'Clever',    label: 'Hard' },
  { id: 4, name: 'Top dog',   label: 'Expert' },
  { id: 5, name: 'Legend',    label: 'Ultra' },
];

/**
 * Difficulty ranking, 1 (Puppy) .. 5 (Legend).
 * `score` is the summed technique weight; `effort` leaves out the n unavoidable "only one spot"
 * placements so the thresholds can scale with the board size. The rank is decided by the hardest
 * ideas needed first, then by the amount of work.
 */
export function gradeSteps(n, steps, solved) {
  let score = 0, hardest = 0;
  const counts = {};
  for (const s of steps) {
    score += s.tech.w;
    if (s.tech.w > hardest) hardest = s.tech.w;
    counts[s.tech.id] = (counts[s.tech.id] || 0) + 1;
  }
  const c = id => counts[id] || 0;
  const effort = Math.max(0, score - n);
  let rank;
  if (!solved) rank = 6;
  else if (c('hypo') === 0 && c('subset3') === 0 && c('subset2') === 0 && c('crowd') <= 1 && c('claiming') <= 1 && effort <= 1.2 * n) rank = 1;
  else if (c('hypo') === 0 && c('subset3') === 0 && c('subset2') <= 1 && c('crowd') <= 4 && effort <= 3 * n) rank = 2;
  else if (c('hypo') <= 1 && c('subset3') <= 1 && effort <= 6 * n) rank = 3;
  else if (c('hypo') <= 4 && effort <= 12 * n) rank = 4;
  else rank = 5;
  return { score, effort, hardest, counts, rank, solved, steps: steps.length };
}

export function gradePuzzle(puzzle) { return solveLogically(puzzle).grade; }

// ---------------------------------------------------------------- hints for a live board

/**
 * Work out the next thing the player could deduce.
 * board: { pups: Set<cell>, marks: Set<cell> }  (what the player has placed/marked)
 * solution: Int8Array row->col (so mistakes in the player's marks can be flagged)
 * Returns a step whose `place`/`eliminate` are NEW relative to the player's board, or null when solved.
 */
export function nextDeduction(puzzle, board, solution) {
  const { n } = puzzle;
  const solCells = new Set();
  for (let r = 0; r < n; r++) solCells.add(r * n + solution[r]);
  // 1. a wrong X mark is the most important thing to point out
  for (const m of board.marks) if (solCells.has(m)) {
    return { tech: TECH.mistake, place: [], eliminate: [], unmark: [m], focus: { cells: [m], units: [] }, why: { kind: 'badMark', cell: m } };
  }
  const st = initialState(puzzle);
  for (const p of board.pups) if (!st.pup[p]) st.place(p);
  if (st.solved()) return null;
  // 2. squares blocked by placed pups that the player hasn't marked yet
  const basic = [];
  for (let i = 0; i < st.N; i++) if (!st.cand[i] && !st.pup[i] && !board.marks.has(i)) basic.push(i);
  if (basic.length) {
    // explain by the pup that blocks the most of them
    let bestPup = -1, bestCount = -1;
    for (let p = 0; p < st.N; p++) {
      if (!st.pup[p]) continue;
      const s = st.shadow(p);
      let k = 0; for (const i of basic) if (s[i]) k++;
      if (k > bestCount) { bestCount = k; bestPup = p; }
    }
    return { tech: TECH.basic, place: [], eliminate: basic, focus: { cells: [bestPup, ...basic], units: [] }, why: { kind: 'basic', pup: bestPup, count: basic.length } };
  }
  // 3. player's marks are correct, so treat them as knowledge
  for (const m of board.marks) st.eliminate(m);
  // 4. find the easiest technique that tells the player something new
  let guard = 0;
  while (guard++ < 200) {
    const step = findStep(st);
    if (!step) return { tech: null, why: { kind: 'stuck' }, place: [], eliminate: [], focus: { cells: [], units: [] } };
    const newElim = step.eliminate.filter(i => !board.marks.has(i));
    const newPlace = step.place.filter(i => !board.pups.has(i));
    if (newElim.length || newPlace.length) {
      step.eliminate = newElim; step.place = newPlace;
      return step;
    }
    applyStep(st, step); // already known to the player; keep looking
  }
  return null;
}

// ---------------------------------------------------------------- generation

const STYLES = [
  { snaky: 0.0, minSize: 2, bias: 0.7 },
  { snaky: 0.3, minSize: 2, bias: 0.5 },
  { snaky: 0.6, minSize: 3, bias: 0.4 },
  { snaky: 0.8, minSize: 2, bias: 0.3 },
  { snaky: 0.2, minSize: 4, bias: 0.6 },
  { snaky: 0.5, minSize: 1, bias: 0.2 },
];

/**
 * Search for a puzzle. opts: { rank (1..5 target), givens (number of pre-placed pups), attempts, deadlineMs, rankTolerance }
 * Returns { puzzle, grade } where puzzle = { n, regions, solution, givens }. If nothing matches the
 * target before the budget runs out, the closest candidate is returned (always unique + logic-solvable).
 */
export function generatePuzzle(n, rng, opts = {}) {
  const target = opts.rank ?? 2;
  const givensWanted = opts.givens ?? 0;
  const attempts = opts.attempts ?? 400;
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  let best = null, bestDist = Infinity;
  for (let a = 0; a < attempts; a++) {
    if (Date.now() > deadline) break;
    const solution = generateSolution(n, rng);
    const style = STYLES[rng.int(STYLES.length)];
    const regions = growRegions(n, solution, rng, style);
    const puzzle = { n, regions, solution, givens: [] };
    if (givensWanted) {
      const rows = rng.shuffle(Array.from({ length: n }, (_, k) => k)).slice(0, givensWanted);
      puzzle.givens = rows.map(r => r * n + solution[r]);
    }
    const minSize = opts.minSize ?? (target >= 4 ? 3 : target === 3 ? 2 : 1);
    if (!refineToUnique(puzzle, rng, { minSize, maxIters: opts.refineIters ?? 200 })) continue;
    const { solved, grade } = solveLogically(puzzle);
    if (!solved) continue;
    const dist = Math.abs(grade.rank - target);
    if (dist < bestDist) { best = { puzzle, grade }; bestDist = dist; }
    if (dist === 0) break;
  }
  return best;
}

// ---------------------------------------------------------------- encoding

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

export function encodePuzzle(p) {
  let reg = '';
  for (let i = 0; i < p.n * p.n; i++) reg += B36[p.regions[i]];
  let sol = '';
  for (let r = 0; r < p.n; r++) sol += B36[p.solution[r]];
  return { n: p.n, r: reg, s: sol, g: (p.givens || []).slice() };
}

export function decodePuzzle(e) {
  const n = e.n;
  const regions = new Int8Array(n * n);
  for (let i = 0; i < n * n; i++) regions[i] = B36.indexOf(e.r[i]);
  const solution = new Int8Array(n);
  for (let r = 0; r < n; r++) solution[r] = B36.indexOf(e.s[r]);
  return { n, regions, solution, givens: (e.g || []).slice() };
}

/** Verify a decoded puzzle is well formed (regions connected, one per row in solution, unique). */
export function validatePuzzle(p) {
  const { n, regions } = p;
  const seen = new Uint8Array(n);
  for (let i = 0; i < n * n; i++) { if (regions[i] < 0 || regions[i] >= n) return 'bad region id'; seen[regions[i]] = 1; }
  for (let k = 0; k < n; k++) if (!seen[k]) return 'missing region ' + k;
  // connectivity
  for (let k = 0; k < n; k++) {
    const cells = []; for (let i = 0; i < n * n; i++) if (regions[i] === k) cells.push(i);
    const vis = new Set([cells[0]]); const stack = [cells[0]];
    while (stack.length) { const i = stack.pop(); for (const j of neighbours4(n, i)) if (regions[j] === k && !vis.has(j)) { vis.add(j); stack.push(j); } }
    if (vis.size !== cells.length) return 'region ' + k + ' not connected';
  }
  const { count, solution } = countSolutions(p, 2, p.givens);
  if (count !== 1) return 'solutions: ' + count;
  for (let r = 0; r < n; r++) if (solution[r] !== p.solution[r]) return 'stored solution differs';
  return null;
}

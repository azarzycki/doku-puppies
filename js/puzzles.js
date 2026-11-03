/*
 * Puzzle sources: the pre-generated campaign, the free-play bank, the daily table, and a
 * seeded runtime generator (in a Worker when possible) for everything else. Also owns the
 * colour palette for yards and the wording of hint explanations.
 */
import { Rng, decodePuzzle, generatePuzzle, encodePuzzle, hashString, RANKS } from './engine.js';
import { TERRAINS, terrainDistance } from './terrain.js';

const base = new URL('.', import.meta.url).href.replace(/js\/$/, '');

let levelsData = null, bankData = null, dailyData = null;

export async function loadLevels() {
  if (!levelsData) levelsData = await fetch(base + 'data/levels.json').then(r => r.json());
  return levelsData;
}
export async function loadBank() {
  if (!bankData) bankData = await fetch(base + 'data/bank.json').then(r => r.json()).catch(() => ({}));
  return bankData;
}
export async function loadDaily() {
  if (!dailyData) dailyData = await fetch(base + 'data/daily.json').then(r => r.json()).catch(() => ({}));
  return dailyData;
}

export const WALKS_META = {
  1: { emoji: '🌳', sky: 'linear-gradient(160deg,#dff5e1,#fff7d6)' },
  2: { emoji: '🏡', sky: 'linear-gradient(160deg,#ffe9d6,#fff3b0)' },
  3: { emoji: '🏖️', sky: 'linear-gradient(160deg,#d6f1ff,#fff0c2)' },
  4: { emoji: '🌲', sky: 'linear-gradient(160deg,#d7f0d2,#e4f7ff)' },
  5: { emoji: '❄️', sky: 'linear-gradient(160deg,#e6f0ff,#ffffff)' },
  6: { emoji: '🌃', sky: 'linear-gradient(160deg,#e7dcff,#ffd9ec)' },
};

/** Campaign level by number (1..160) -> { id, n, rank, puzzle, walk } */
export async function getLevel(id) {
  const data = await loadLevels();
  const L = data.levels.find(l => l.id === id);
  if (!L) return null;
  const walk = data.walks.find(w => id >= w.from && id <= w.to);
  return { kind: 'level', id, key: 'L' + id, n: L.n, rank: L.rank, puzzle: decodePuzzle(L), walk, boss: walk && walk.to === id,
    title: `Level ${id}`, subtitle: walk ? walk.name : '' };
}
export async function levelCount() { return (await loadLevels()).levels.length; }
export async function getWalks() { return (await loadLevels()).walks; }

/** Endless Walkies: levels past the campaign, seeded by number so everyone gets the same board. */
export async function getEndlessLevel(id) {
  const cycle = [[8, 3], [9, 3], [9, 4], [10, 4], [8, 4], [11, 4], [9, 5], [10, 5]];
  const [n, rank] = cycle[(id - 161) % cycle.length];
  let res = null;
  if (n >= 10) {
    const bank = await loadBank();
    res = pickFromBank(bank, n, rank, hashString('endless-' + id));
  }
  // seed prefixes keep the historical 'pupdoku-' spelling: the shipped data files were generated from them
  if (!res) res = await generateAsync(n, rank, 'pupdoku-E' + id, n >= 10 ? 60000 : 20000);
  return { kind: 'level', id, key: 'L' + id, n: res.n, rank: res.rank, puzzle: res.puzzle, walk: null, boss: false, title: `Level ${id}`, subtitle: 'Endless Walkies' };
}

function pickFromBank(bank, n, rank, seed) {
  // closest rank available for this size
  const order = [rank, rank - 1, rank + 1, rank - 2, rank + 2, rank - 3, rank + 3, rank - 4, rank + 4].filter(r => r >= 1 && r <= 5);
  for (const r of order) {
    const list = bank[`${n}:${r}`];
    if (list && list.length) {
      const e = list[seed % list.length];
      return { n, rank: r, puzzle: decodePuzzle(e), fromBank: true };
    }
  }
  return null;
}

/** Free play: random bank puzzle for the size/rank, else generated. */
export async function getFreePuzzle(n, rank, exclude = new Set()) {
  const bank = await loadBank();
  const list = bank[`${n}:${rank}`] || [];
  const fresh = list.map((e, i) => ({ e, i })).filter(x => !exclude.has(`${n}:${rank}:${x.i}`));
  if (fresh.length) {
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    return { kind: 'free', key: `F${n}:${rank}:${pick.i}`, n, rank, puzzle: decodePuzzle(pick.e), title: `${n}×${n} free play`, subtitle: RANKS[rank - 1].name, bankId: `${n}:${rank}:${pick.i}` };
  }
  if (n <= 9) {
    const res = await generateAsync(n, rank, 'free-' + Date.now() + '-' + Math.random(), 25000);
    return { kind: 'free', key: `F${n}:${rank}:g${Date.now()}`, n, rank: res.rank, puzzle: res.puzzle, title: `${n}×${n} free play`, subtitle: RANKS[res.rank - 1].name };
  }
  const near = pickFromBank(bank, n, rank, Math.floor(Math.random() * 1e9));
  if (near) return { kind: 'free', key: `F${n}:${near.rank}:x`, n, rank: near.rank, puzzle: near.puzzle, title: `${n}×${n} free play`, subtitle: RANKS[near.rank - 1].name };
  const res = await generateAsync(n, rank, 'free-' + Date.now(), 60000);
  return { kind: 'free', key: `F${n}:${rank}:g${Date.now()}`, n, rank: res.rank, puzzle: res.puzzle, title: `${n}×${n} free play`, subtitle: RANKS[res.rank - 1].name };
}

const DAILY_PLAN = { 1: [7, 2], 2: [8, 2], 3: [8, 3], 4: [9, 3], 5: [9, 3], 6: [10, 4], 0: [11, 4] };

/** Daily puzzle for a date key (YYYY-MM-DD): everyone gets the same board. */
export async function getDaily(dateKey) {
  const table = await loadDaily();
  const e = table[dateKey];
  const d = new Date(dateKey + 'T12:00:00');
  const nice = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (e) return { kind: 'daily', key: 'D' + dateKey, date: dateKey, n: e.n, rank: e.rank, puzzle: decodePuzzle(e), title: 'Daily puzzle', subtitle: nice };
  // outside the pre-generated table: generate on the device from the date (still identical everywhere)
  let [n, rank] = DAILY_PLAN[d.getDay()];
  if (n > 9) n = 9;
  const res = await generateAsync(n, rank, 'pupdoku-D' + dateKey, 30000, true);
  return { kind: 'daily', key: 'D' + dateKey, date: dateKey, n: res.n, rank: res.rank, puzzle: res.puzzle, title: 'Daily puzzle', subtitle: nice };
}

/** Event puzzle i (0..4) for an event in a given year. */
export async function getEventPuzzle(ev, year, i) {
  const bank = await loadBank();
  const n = ev.sizes[i];
  const res = pickFromBank(bank, n, ev.rank, hashString(`${ev.id}-${year}-${i}`)) || await generateAsync(n, ev.rank, `${ev.id}-${year}-${i}`, 30000, true);
  return { kind: 'event', key: `E${ev.id}-${year}-${i}`, eventId: ev.id, year, index: i, n: res.n, rank: res.rank, puzzle: res.puzzle, title: `${ev.emoji} ${ev.name}`, subtitle: `Puzzle ${i + 1} of ${ev.sizes.length}` };
}

// ---------------------------------------------------------------- runtime generation

let worker = null, workerBroken = false, jobId = 0;
const pending = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p.resolve(e.data); } };
    worker.onerror = () => { workerBroken = true; for (const p of pending.values()) p.reject(new Error('worker failed')); pending.clear(); worker = null; };
  } catch { workerBroken = true; worker = null; }
  return worker;
}

/** Generate with a seed; deterministic = true means the result must not depend on timing (no deadline). */
export async function generateAsync(n, rank, seed, deadlineMs, deterministic = false) {
  const opts = { rank, attempts: deterministic ? 400 : 5000, deadlineMs: deterministic ? undefined : deadlineMs };
  const w = getWorker();
  let enc = null;
  if (w) {
    try {
      const id = ++jobId;
      const res = await new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); w.postMessage({ id, n, seed, opts }); });
      if (res.error) throw new Error(res.error);
      enc = res;
    } catch (e) { enc = null; }
  }
  if (!enc) {
    const res = generatePuzzle(n, new Rng(seed), opts);
    if (!res) throw new Error('Could not make a puzzle');
    enc = { p: encodePuzzle(res.puzzle), rank: res.grade.rank };
  }
  return { n, rank: enc.rank, puzzle: decodePuzzle(enc.p) };
}

// ---------------------------------------------------------------- yard terrains

export { TERRAINS as PALETTE };

/**
 * Give every region a terrain so that neighbouring yards always look clearly different
 * (hue, saturation and lightness all count). Deterministic for a given board.
 */
export function assignColors(puzzle) {
  const { n, regions } = puzzle;
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n;
    if (c + 1 < n && regions[i + 1] !== regions[i]) { adj[regions[i]].add(regions[i + 1]); adj[regions[i + 1]].add(regions[i]); }
    if (r + 1 < n && regions[i + n] !== regions[i]) { adj[regions[i]].add(regions[i + n]); adj[regions[i + n]].add(regions[i]); }
  }
  const rng = new Rng('terrain-' + n + '-' + Array.from(regions).join(''));
  const order = rng.shuffle(TERRAINS.map((_, i) => i));
  const pick = new Array(n).fill(-1);
  // biggest regions first so the most visible yards get the strongest contrast
  const sizes = new Array(n).fill(0); for (let i = 0; i < n * n; i++) sizes[regions[i]]++;
  const regOrder = Array.from({ length: n }, (_, k) => k).sort((a, b) => sizes[b] - sizes[a] || a - b);
  for (const k of regOrder) {
    const taken = new Set(pick.filter(x => x >= 0));
    let best = -1, bestScore = -Infinity;
    for (const ti of order) {
      let score = Math.min(...[...adj[k]].filter(q => pick[q] >= 0).map(q => terrainDistance(TERRAINS[ti], TERRAINS[pick[q]])), 400);
      if (taken.has(ti)) score -= 1000; // every yard its own terrain whenever possible
      if (score > bestScore) { bestScore = score; best = ti; }
    }
    pick[k] = best;
  }
  return pick.map(ti => TERRAINS[ti]);
}

// ---------------------------------------------------------------- hint wording

export function explainStep(step, puzzle, colors) {
  const yard = reg => `the ${colors[reg].label}`;
  const unit = u => u.type === 'reg' ? yard(u.idx) : u.type === 'row' ? `row ${u.idx + 1}` : `column ${u.idx + 1}`;
  const Unit = u => { const s = unit(u); return s[0].toUpperCase() + s.slice(1); };
  const w = step.why;
  const list = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // "rows 2, 3 and 4" / "columns 1 and 5" when all lines are the same kind
  const linesText = lines => lines.every(l => l.type === lines[0].type) && lines.length > 1
    ? `${lines[0].type === 'row' ? 'rows' : 'columns'} ${list(lines.map(l => String(l.idx + 1)))}` : list(lines.map(unit));
  const yardsText = regs => regs.length > 1 ? `the ${list(regs.map(r => colors[r].label))}` : yard(regs[0]);
  switch (w.kind) {
    case 'badMark': return { title: 'Oops!', text: 'One of your ✕ marks sits right where a pup belongs. Let’s clear it.' };
    case 'basic': return { title: 'Personal space', text: `A pup blocks its whole row and column, its yard, and the 8 squares around it. ${w.count === 1 ? 'One square is' : w.count + ' squares are'} blocked by pups already sitting — cross ${w.count === 1 ? 'it' : 'them'} off.` };
    case 'single':
      if (w.unit.type === 'reg') return { title: 'Only one spot', text: `Every other square in ${yard(w.unit.idx)} is blocked, so ${yard(w.unit.idx)}’s pup has to sit here.` };
      return { title: 'Only one spot', text: `${Unit(w.unit)} has just one open square left — that is where its pup goes.` };
    case 'pointing': return { title: 'Yard lock', text: `Every open square of ${yard(w.reg)} lies in ${unit(w.line)}. That yard’s pup will take ${unit(w.line)}, so no other yard can use it — cross off the rest of ${unit(w.line)}.` };
    case 'claiming': return { title: 'Line lock', text: `The only open squares in ${unit(w.line)} belong to ${yard(w.reg)}. So ${yard(w.reg)}’s pup must sit in ${unit(w.line)}, and its other squares are out.` };
    case 'crowd': return { title: 'Too crowded', text: `${Unit(w.unit)} has only ${w.victims.length === 1 ? 'one spot' : w.victims.length + ' spots'} left. A pup on ${w.cells.length === 1 ? 'the highlighted square' : 'any of the ' + w.cells.length + ' highlighted squares'} would block all of them — so ${w.cells.length === 1 ? 'it is' : 'they are'} out.` };
    case 'subsetRegs': return { title: w.regs.length === 2 ? 'Paired yards' : 'Trio of yards', text: `${cap(yardsText(w.regs))} fit entirely inside ${linesText(w.lines)}. Those ${w.lines.length} lines are spoken for, so no other yard can use them.` };
    case 'subsetLines': return { title: w.lines.length === 2 ? 'Paired lines' : 'Trio of lines', text: `${cap(linesText(w.lines))} only have open squares in ${yardsText(w.regs)}. Those yards must supply those lines’ pups, so their squares anywhere else are out.` };
    case 'hypo': {
      const chain = w.chain.map(x => unit(x.unit));
      const lead = chain.length ? `That would force a pup into ${list(chain)}, and then ` : 'Then ';
      return { title: 'What if…', text: `What if a pup sat on the highlighted square? ${lead}${unit(w.unit)} would have nowhere left to go. So that square is out.` };
    }
    case 'stuck': return { title: 'Hmm…', text: 'I can’t sniff out a single-step deduction here. Try Fetch to reveal a pup.' };
    default: return { title: 'Hint', text: 'Look at the highlighted squares.' };
  }
}

export { RANKS };

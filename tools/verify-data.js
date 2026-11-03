// Checks every shipped puzzle: well formed, unique, and solvable end-to-end using only the
// in-game hint engine (so "Sniff" can never dead-end). Run: node tools/verify-data.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePuzzle, validatePuzzle, nextDeduction, solveLogically } from '../js/engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');

function hintWalk(p) {
  const board = { pups: new Set(), marks: new Set() };
  for (let steps = 0; steps < 2000; steps++) {
    const h = nextDeduction(p, board, p.solution);
    if (!h) return { ok: board.pups.size + (p.givens || []).length === p.n, steps };
    if (h.why.kind === 'stuck') return { ok: false, steps, reason: 'stuck' };
    for (const i of h.eliminate) board.marks.add(i);
    for (const i of h.place) board.pups.add(i);
    for (const i of (h.unmark || [])) board.marks.delete(i);
  }
  return { ok: false, reason: 'too many steps' };
}

function check(label, enc) {
  const p = decodePuzzle(enc);
  const err = validatePuzzle(p);
  if (err) return `${label}: INVALID (${err})`;
  const lg = solveLogically(p);
  if (!lg.solved) return `${label}: logic solver cannot finish`;
  if (enc.rank && lg.grade.rank !== enc.rank) return `${label}: stored rank ${enc.rank} != graded ${lg.grade.rank}`;
  const w = hintWalk(p);
  if (!w.ok) return `${label}: hint walk failed (${w.reason})`;
  return null;
}

let total = 0, bad = 0;
const levels = JSON.parse(fs.readFileSync(path.join(DATA, 'levels.json'), 'utf8'));
for (const L of levels.levels) { total++; const e = check('level ' + L.id, L); if (e) { bad++; console.log(e); } }
const bank = JSON.parse(fs.readFileSync(path.join(DATA, 'bank.json'), 'utf8'));
for (const [k, list] of Object.entries(bank)) list.forEach((e, i) => { total++; const r = check(`bank ${k}#${i}`, { ...e, rank: Number(k.split(':')[1]) }); if (r) { bad++; console.log(r); } });
const daily = JSON.parse(fs.readFileSync(path.join(DATA, 'daily.json'), 'utf8'));
for (const [d, e] of Object.entries(daily)) { total++; const r = check('daily ' + d, e); if (r) { bad++; console.log(r); } }
console.log(`${total} puzzles checked, ${bad} problems`);
process.exit(bad ? 1 : 0);

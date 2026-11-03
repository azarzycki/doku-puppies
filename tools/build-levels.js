#!/usr/bin/env node
/*
 * Pre-generates every puzzle the game ships with, using a small worker pool:
 *   node tools/build-levels.js campaign   -> tools/out/campaign.jsonl
 *   node tools/build-levels.js bank       -> tools/out/bank.jsonl     (free play, by size + rank)
 *   node tools/build-levels.js daily      -> tools/out/daily.jsonl    (one shared board per day)
 *   node tools/build-levels.js compile    -> data/levels.json, data/bank.json, data/daily.json
 * Output is appended per puzzle so a run can be stopped and resumed. Seeds are fixed, so re-running
 * a job produces the same board.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Rng, generatePuzzle, encodePuzzle, validatePuzzle } from '../js/engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
const DATA = path.join(here, '..', 'data');

// ---------------------------------------------------------------- job plans

export const WALKS = [
  { id: 1, name: 'Puppy Park',   from: 1,   to: 15 },
  { id: 2, name: 'Backyard',     from: 16,  to: 35 },
  { id: 3, name: 'Beach Day',    from: 36,  to: 60 },
  { id: 4, name: 'Forest Trail', from: 61,  to: 90 },
  { id: 5, name: 'Snowy Hills',  from: 91,  to: 125 },
  { id: 6, name: 'City Lights',  from: 126, to: 160 },
];

function lerp(a, b, t) { return a + (b - a) * t; }

/** size / target rank / givens for campaign level L (1-based) */
export function campaignPlan(L) {
  const seg = (from, to, n, r0, r1, givens = 0) => {
    const t = to === from ? 0 : (L - from) / (to - from);
    return { n, rank: Math.round(lerp(r0, r1, t)), givens };
  };
  if (L <= 4)   return { n: 5, rank: 1, givens: 1 };
  if (L <= 8)   return seg(5, 8, 5, 1, 2);
  if (L <= 15)  return seg(9, 15, 6, 1, 2);
  if (L <= 22)  return seg(16, 22, 6, 2, 2);
  if (L <= 35)  return seg(23, 35, 7, 2, 3);
  if (L <= 45)  return seg(36, 45, 7, 3, 3);
  if (L <= 60)  return seg(46, 60, 8, 2, 3);
  if (L <= 72)  return seg(61, 72, 8, 3, 4);
  if (L <= 90)  return seg(73, 90, 9, 3, 3);
  if (L <= 105) return seg(91, 105, 9, 3, 4);
  if (L <= 125) return seg(106, 125, 10, 3, 4);
  if (L <= 140) return seg(126, 140, 10, 4, 4);
  return seg(141, 160, 11, 4, 5);
}

export const DAILY_PLAN = { // JS getDay(): 0 = Sunday
  1: { n: 7, rank: 2 }, 2: { n: 8, rank: 2 }, 3: { n: 8, rank: 3 }, 4: { n: 9, rank: 3 },
  5: { n: 9, rank: 3 }, 6: { n: 10, rank: 4 }, 0: { n: 11, rank: 4 },
};

function deadlineFor(n) { return n <= 8 ? 8000 : n === 9 ? 20000 : n === 10 ? 40000 : n === 11 ? 70000 : 150000; }

function jobsFor(kind) {
  // Seeds keep the historical 'pupdoku-' prefix on purpose: the shipped data files (and the
  // on-device daily/endless fallbacks in js/puzzles.js) were generated from them.
  const jobs = [];
  if (kind === 'campaign') {
    for (let L = 1; L <= 160; L++) {
      const plan = campaignPlan(L);
      const boss = WALKS.some(w => w.to === L);
      const rank = Math.min(5, plan.rank + (boss ? 1 : 0));
      jobs.push({ kind, id: String(L), seed: 'pupdoku-L' + L, n: plan.n, rank, givens: plan.givens, deadlineMs: deadlineFor(plan.n) });
    }
  } else if (kind === 'bank') {
    for (let n = 5; n <= 12; n++) for (let rank = 1; rank <= 5; rank++) {
      if (n === 5 && rank > 3) continue;
      if (n === 6 && rank > 4) continue;
      const per = n >= 11 ? 6 : 10;
      for (let i = 0; i < per; i++) jobs.push({ kind, id: `${n}:${rank}:${i}`, seed: `pupdoku-B${n}-${rank}-${i}`, n, rank, givens: 0, deadlineMs: deadlineFor(n) });
    }
  } else if (kind === 'daily') {
    const start = new Date(Date.UTC(2026, 10, 1)); // 2026-11-01
    const end = new Date(Date.UTC(2027, 11, 31));
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const plan = DAILY_PLAN[d.getUTCDay()];
      jobs.push({ kind, id: iso, seed: 'pupdoku-D' + iso, n: plan.n, rank: plan.rank, givens: 0, deadlineMs: Math.min(deadlineFor(plan.n), 60000) });
    }
  }
  return jobs;
}

// ---------------------------------------------------------------- worker side

function runJob(job) {
  const t0 = Date.now();
  let res = null;
  for (let attempt = 0; attempt < 4 && !res; attempt++) {
    const rng = new Rng(job.seed + (attempt ? '-retry' + attempt : ''));
    res = generatePuzzle(job.n, rng, { rank: job.rank, givens: job.givens, attempts: 5000, deadlineMs: job.deadlineMs });
  }
  if (!res) return { id: job.id, error: 'no puzzle' };
  const err = validatePuzzle(res.puzzle);
  if (err) return { id: job.id, error: err };
  return { id: job.id, n: job.n, target: job.rank, rank: res.grade.rank, score: res.grade.score, counts: res.grade.counts, ms: Date.now() - t0, p: encodePuzzle(res.puzzle) };
}

if (!isMainThread) {
  parentPort.on('message', job => { parentPort.postMessage(runJob(job)); });
}

// ---------------------------------------------------------------- main side

function readDone(file) {
  const done = new Map();
  if (!fs.existsSync(file)) return done;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (!o.error) done.set(o.id, o); } catch {}
  }
  return done;
}

async function runKind(kind) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, kind + '.jsonl');
  const done = readDone(file);
  let jobs = jobsFor(kind).filter(j => !done.has(j.id));
  if (process.env.LIMIT) jobs = jobs.slice(0, Number(process.env.LIMIT));
  console.log(`${kind}: ${jobs.length} jobs to do (${done.size} already done)`);
  if (!jobs.length) return;
  const workers = Math.max(1, Math.min(os.cpus().length, Number(process.env.WORKERS || 2)));
  let next = 0, finished = 0;
  const t0 = Date.now();
  const pool = [];
  await new Promise(resolve => {
    for (let w = 0; w < workers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { worker: true } });
      pool.push(worker);
      const feed = () => { if (next < jobs.length) worker.postMessage(jobs[next++]); };
      worker.on('message', res => {
        finished++;
        fs.appendFileSync(file, JSON.stringify(res) + '\n');
        const tag = res.error ? `ERROR ${res.error}` : `n=${res.n} target ${res.target} got ${res.rank} (score ${res.score}) ${res.ms}ms`;
        console.log(`[${finished}/${jobs.length}] ${kind} ${res.id}: ${tag}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        if (finished === jobs.length) resolve(); else feed();
      });
      worker.on('error', e => { console.error('worker error', e); });
      feed();
    }
  });
  for (const w of pool) await w.terminate();
}

function compile() {
  fs.mkdirSync(DATA, { recursive: true });
  const camp = readDone(path.join(OUT, 'campaign.jsonl'));
  const levels = [];
  for (let L = 1; L <= 160; L++) {
    const o = camp.get(String(L));
    if (!o) { console.warn('missing campaign level', L); continue; }
    levels.push({ id: L, n: o.n, rank: o.rank, score: o.score, ...o.p });
  }
  fs.writeFileSync(path.join(DATA, 'levels.json'), JSON.stringify({ walks: WALKS, levels }));
  const bank = {};
  for (const o of readDone(path.join(OUT, 'bank.jsonl')).values()) {
    const key = `${o.n}:${o.rank}`;
    (bank[key] ||= []).push({ score: o.score, ...o.p });
  }
  fs.writeFileSync(path.join(DATA, 'bank.json'), JSON.stringify(bank));
  const daily = {};
  for (const o of readDone(path.join(OUT, 'daily.jsonl')).values()) daily[o.id] = { rank: o.rank, score: o.score, ...o.p };
  fs.writeFileSync(path.join(DATA, 'daily.json'), JSON.stringify(daily));
  const size = f => (fs.statSync(path.join(DATA, f)).size / 1024).toFixed(0) + 'KB';
  console.log(`compiled: ${levels.length} levels (${size('levels.json')}), bank ${Object.values(bank).reduce((a, b) => a + b.length, 0)} (${size('bank.json')}), daily ${Object.keys(daily).length} (${size('daily.json')})`);
}

if (isMainThread) {
  const what = process.argv[2] || 'all';
  (async () => {
    if (what === 'compile') { compile(); return; }
    const kinds = what === 'all' ? ['campaign', 'bank', 'daily'] : [what];
    for (const k of kinds) await runKind(k);
    compile();
  })();
}

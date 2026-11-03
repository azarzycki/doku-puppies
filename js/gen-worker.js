// Runs the puzzle generator off the main thread so the UI keeps animating.
import { Rng, generatePuzzle, encodePuzzle } from './engine.js';

self.onmessage = e => {
  const { id, n, seed, opts } = e.data;
  try {
    const res = generatePuzzle(n, new Rng(seed), opts);
    if (!res) { self.postMessage({ id, error: 'no puzzle' }); return; }
    self.postMessage({ id, p: encodePuzzle(res.puzzle), rank: res.grade.rank });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};

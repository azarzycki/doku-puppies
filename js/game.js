/*
 * One puzzle session: the board, touch/mouse/keyboard input, hearts, timer, undo, hints.
 * The App decides what happens around it (rewards, dialogs, navigation).
 */
import { nextDeduction, neighbours8, shadowOf } from './engine.js';
import { assignColors, explainStep } from './puzzles.js';
import { buildTerrainSvg } from './terrain.js';
import { pupSvg } from './pups.js';
import { sfx, haptic } from './sound.js';

const DOUBLE_TAP_MS = 320; // two taps on the same square inside this window seat a pup

const EMPTY = 0, MARK = 1, PUP = 2;
const FREE_HINTS = 3;

/** "No pup here" marks. bones (default): two glossy crossed bones; x: a bold ✕; paw: a paw print in a no-entry ring. */
export const MARK_STYLES = {
  bones: `<svg class="mark mark-bones" viewBox="0 0 100 100" aria-hidden="true">
    <g transform="translate(2 3)" fill="#000" opacity=".22"><g transform="rotate(45 50 50)"><rect x="20" y="42" width="60" height="16" rx="8"/><circle cx="20" cy="42" r="9"/><circle cx="20" cy="58" r="9"/><circle cx="80" cy="42" r="9"/><circle cx="80" cy="58" r="9"/></g><g transform="rotate(-45 50 50)"><rect x="20" y="42" width="60" height="16" rx="8"/><circle cx="20" cy="42" r="9"/><circle cx="20" cy="58" r="9"/><circle cx="80" cy="42" r="9"/><circle cx="80" cy="58" r="9"/></g></g>
    <g transform="rotate(45 50 50)"><g fill="#fff4dc" stroke="#b8863f" stroke-width="3"><rect x="20" y="42" width="60" height="16" rx="8"/><circle cx="20" cy="42" r="9"/><circle cx="20" cy="58" r="9"/><circle cx="80" cy="42" r="9"/><circle cx="80" cy="58" r="9"/></g><rect x="28" y="45" width="44" height="4" rx="2" fill="#fff" opacity=".85"/></g>
    <g transform="rotate(-45 50 50)"><g fill="#fff4dc" stroke="#b8863f" stroke-width="3"><rect x="20" y="42" width="60" height="16" rx="8"/><circle cx="20" cy="42" r="9"/><circle cx="20" cy="58" r="9"/><circle cx="80" cy="42" r="9"/><circle cx="80" cy="58" r="9"/></g><rect x="28" y="45" width="44" height="4" rx="2" fill="#fff" opacity=".85"/></g>
    <circle class="mark-shine" cx="50" cy="50" r="6" fill="#fff" opacity=".9"/></svg>`,
  x: `<svg class="mark mark-x" viewBox="0 0 100 100" aria-hidden="true"><path d="M24 24 L76 76 M76 24 L24 76" stroke="#fff" stroke-width="24" stroke-linecap="round" fill="none" opacity=".9"/><path d="M24 24 L76 76 M76 24 L24 76" stroke="#4a3528" stroke-width="13" stroke-linecap="round" fill="none"/><path d="M28 24 L48 44" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/></svg>`,
  paw: `<svg class="mark mark-paw" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="#fff" stroke="#e5484d" stroke-width="9"/><g fill="#4a3528"><ellipse cx="50" cy="60" rx="15" ry="13"/><circle cx="31" cy="46" r="7.5"/><circle cx="43" cy="35" r="7.5"/><circle cx="57" cy="35" r="7.5"/><circle cx="69" cy="46" r="7.5"/></g><path d="M23 77 L77 23" stroke="#e5484d" stroke-width="9" stroke-linecap="round"/></svg>`,
};
const markSvg = style => MARK_STYLES[style] || MARK_STYLES.bones;

export class Game {
  /**
   * info: { kind, key, n, rank, puzzle, title, subtitle }
   * opts: { pupSpec, settings, resume, hooks: { onWin, onFail, onChange, onNeedTreats, spend } }
   */
  constructor(info, opts) {
    this.info = info;
    this.puzzle = info.puzzle;
    this.n = info.n;
    this.N = this.n * this.n;
    this.colors = assignColors(this.puzzle);
    this.pupSpec = opts.pupSpec;
    this.settings = opts.settings || {};
    this.hooks = opts.hooks || {};
    this.cells = new Uint8Array(this.N);
    this.given = new Uint8Array(this.N);
    for (const g of (this.puzzle.givens || [])) { this.cells[g] = PUP; this.given[g] = 1; }
    this.solution = new Uint8Array(this.N);
    for (let r = 0; r < this.n; r++) this.solution[r * this.n + this.puzzle.solution[r]] = 1;
    this.hearts = 3; this.maxHearts = 3;
    this.mistakes = 0; this.hintsUsed = 0; this.freeHintsUsed = 0; this.fetched = 0; this.marksMade = 0;
    this.elapsed = 0; this.running = false; this.lastTick = 0;
    this.history = [];
    this.hint = null;
    this.done = false; this.failed = false;
    this.cursor = -1;
    this.tokenSvg = pupSvg(this.pupSpec, { cls: 'token-pup' });
    this.tokenSadSvg = pupSvg(this.pupSpec, { cls: 'token-pup', mood: 'sad' });
    if (opts.resume) this.restore(opts.resume);
  }

  // ---------------------------------------------------------------- DOM

  mount(boardEl, frameEl) {
    this.el = boardEl;
    this.frameEl = frameEl || boardEl.parentElement;
    boardEl.innerHTML = '';
    boardEl.style.setProperty('--n', this.n);
    boardEl.setAttribute('role', 'grid');
    boardEl.className = 'board';
    this.cellEls = [];
    const { n, puzzle } = this;
    for (let i = 0; i < this.N; i++) {
      const r = (i / n) | 0, c = i % n, reg = puzzle.regions[i];
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      d.setAttribute('role', 'gridcell');
      d.setAttribute('tabindex', '-1');
      d.style.setProperty('--rc', this.colors[reg].fill);
      d.style.setProperty('--rd', this.colors[reg].deep);
      if (r === 0 || puzzle.regions[i - n] !== reg) d.classList.add('bt');
      if (c === 0 || puzzle.regions[i - 1] !== reg) d.classList.add('bl');
      if (r === n - 1) d.classList.add('bb');
      if (c === n - 1) d.classList.add('br');
      d.style.animationDelay = ((r + c) * 28) + 'ms';
      d.addEventListener('animationend', () => { d.style.animationDelay = ''; }, { once: true });
      d.innerHTML = `<div class="cell-inner">${markSvg(this.settings.markStyle)}<div class="token"></div><span class="coord">${c + 1},${r + 1}</span></div>`;
      boardEl.appendChild(d);
      this.cellEls.push(d);
    }
    boardEl.classList.toggle('coords', !!this.settings.showCoords);
    this.drawTerrain();
    for (let i = 0; i < this.N; i++) this.paintCell(i, false);
    this.bindPointer();
    this.updateAria();
  }

  /** swap the mark artwork on a live board */
  setMarkStyle(style) {
    this.settings.markStyle = style;
    if (!this.cellEls) return;
    for (const d of this.cellEls) { const old = d.querySelector('.mark'); if (old) old.outerHTML = markSvg(style); }
  }
  /** fence depth (cell units) for the current cell size; the frame's padding must match */
  static fenceUnits(cellPx) { const px = Math.min(30, Math.max(16, .45 * cellPx)); return px / Math.max(1, cellPx); }
  drawTerrain() {
    const old = this.frameEl.querySelector('svg.terrain'); if (old) old.remove();
    const cellPx = parseFloat(getComputedStyle(this.el).getPropertyValue('--cell')) || 40;
    const m = Game.fenceUnits(cellPx);
    this.frameEl.style.setProperty('--fence', (m * cellPx).toFixed(2) + 'px');
    this.frameEl.insertAdjacentHTML('afterbegin', buildTerrainSvg(this.puzzle, this.colors, m));
  }

  paintCell(i, animate = true) {
    const d = this.cellEls[i], s = this.cells[i];
    d.classList.toggle('is-mark', s === MARK);
    d.classList.toggle('is-pup', s === PUP);
    d.classList.toggle('is-given', !!this.given[i]);
    const tok = d.querySelector('.token');
    if (s === PUP) {
      if (!tok.firstChild) { tok.innerHTML = this.tokenSvg + (this.given[i] ? '<span class="given-badge" title="Starting pup">🦴</span>' : ''); }
      if (animate) { tok.classList.remove('drop'); void tok.offsetWidth; tok.classList.add('drop'); }
    } else if (tok.firstChild) tok.innerHTML = '';
    if (animate && s === MARK) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
    d.setAttribute('aria-label', this.cellLabel(i));
  }
  cellLabel(i) {
    const r = (i / this.n | 0) + 1, c = (i % this.n) + 1;
    const state = this.cells[i] === PUP ? (this.given[i] ? 'starting pup' : 'pup') : this.cells[i] === MARK ? 'crossed off' : 'empty';
    return `Row ${r}, column ${c}, ${this.colors[this.puzzle.regions[i]].label}, ${state}`;
  }
  updateAria() { this.el.setAttribute('aria-label', `${this.n} by ${this.n} board`); }

  // ---------------------------------------------------------------- pointer input

  bindPointer() {
    const el = this.el;
    let drag = null; // { mode: 'mark'|'erase', moved:false, start:i, timer, batch:[] }
    let lastTap = null; // { i, t, wasPup } for double-tap detection
    const cellAt = (x, y) => {
      const t = document.elementFromPoint(x, y);
      const c = t && t.closest && t.closest('.cell');
      return c && c.parentElement === el ? Number(c.dataset.i) : -1;
    };
    el.addEventListener('pointerdown', e => {
      if (this.done || this.failed) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch {}
      this.setCursor(i, false);
      const s = this.cells[i];
      drag = { start: i, moved: false, mode: s === EMPTY ? 'mark' : s === MARK ? 'erase' : null, batch: [], pointerId: e.pointerId, timer: null, longPressed: false };
      if (s === EMPTY && !this.given[i]) {
        drag.timer = setTimeout(() => { if (drag && !drag.moved) { drag.longPressed = true; this.tryPlacePup(i); } }, 420);
      }
    });
    el.addEventListener('pointermove', e => {
      if (!drag || !drag.mode) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0 || i === drag.start && !drag.moved) return;
      if (!drag.moved) { drag.moved = true; clearTimeout(drag.timer); if (!drag.batch.length) this.paintDrag(drag, drag.start); }
      this.paintDrag(drag, i);
    });
    const finish = e => {
      if (!drag) return;
      clearTimeout(drag.timer);
      const d = drag; drag = null;
      if (d.moved) { if (d.batch.length) this.pushHistory(d.batch); lastTap = null; return; }
      if (d.longPressed) { lastTap = null; return; }
      const now = performance.now();
      const i = d.start;
      if (lastTap && lastTap.i === i && now - lastTap.t < DOUBLE_TAP_MS) {
        const wasPup = lastTap.wasPup; lastTap = null;
        if (!wasPup) this.doubleTap(i); // double-tapping a pup just sends it home (the first tap did)
        return;
      }
      lastTap = { i, t: now, wasPup: this.cells[i] === PUP };
      this.tap(i);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', () => { if (drag) { clearTimeout(drag.timer); if (drag.batch.length) this.pushHistory(drag.batch); drag = null; } });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  paintDrag(drag, i) {
    if (this.given[i]) return;
    const s = this.cells[i];
    if (drag.mode === 'mark' && s === EMPTY) { drag.batch.push({ i, from: s, to: MARK }); this.set(i, MARK); }
    else if (drag.mode === 'erase' && s === MARK) { drag.batch.push({ i, from: s, to: EMPTY }); this.set(i, EMPTY, true); }
  }

  // ---------------------------------------------------------------- state changes

  set(i, state, quiet = false) {
    const prev = this.cells[i];
    this.start();
    this.cells[i] = state;
    this.paintCell(i, !quiet || state === PUP);
    if (state === MARK && prev !== MARK) { this.marksMade++; if (!quiet) sfx.mark(); }
    else if (state === EMPTY && prev === MARK && !quiet) sfx.clear();
    this.clearHint(true);
    this.changed();
  }
  pushHistory(batch) { if (batch.length) { this.history.push(batch); this.changed(); } }
  changed() { this.hooks.onChange && this.hooks.onChange(this); }

  /** single tap: empty <-> crossed off; a pup is sent home */
  tap(i) {
    if (this.done || this.failed || this.given[i]) return;
    const s = this.cells[i];
    if (s === EMPTY) { this.pushHistory([{ i, from: s, to: MARK }]); this.set(i, MARK); if (this.settings.haptics) haptic(8); }
    else { this.pushHistory([{ i, from: s, to: EMPTY }]); this.set(i, EMPTY); if (s === PUP) this.unmarkAuto(i); }
  }

  /** double tap seats a pup; the first tap's toggle is folded back so undo returns to the original state */
  doubleTap(i) {
    if (this.done || this.failed || this.given[i]) return;
    const last = this.history[this.history.length - 1];
    if (last && last.length === 1 && last[0].i === i && !last[0].auto) { this.history.pop(); this.set(i, last[0].from, true); }
    this.tryPlacePup(i);
  }

  /** keyboard / remote OK: empty -> mark -> pup -> empty */
  cycle(i) {
    if (this.done || this.failed || this.given[i]) return;
    const s = this.cells[i];
    if (s === EMPTY) { this.pushHistory([{ i, from: s, to: MARK }]); this.set(i, MARK); if (this.settings.haptics) haptic(8); }
    else if (s === MARK) this.tryPlacePup(i);
    else { this.pushHistory([{ i, from: s, to: EMPTY }]); this.set(i, EMPTY); this.unmarkAuto(i); }
  }

  tryPlacePup(i) {
    if (this.done || this.failed || this.given[i]) return;
    this.start();
    if (!this.solution[i]) return this.mistake(i);
    const batch = [{ i, from: this.cells[i], to: PUP }];
    this.set(i, PUP);
    if (this.settings.haptics) haptic([10, 30, 10]);
    sfx.place();
    if (this.settings.autoMark) this.autoMarkAround(i, batch);
    this.pushHistory(batch);
    this.checkWin();
  }

  /** mark every square a pup at i blocks (recorded into batch) */
  autoMarkAround(i, batch) {
    const s = shadowOf(this.n, this.puzzle.regions, i);
    for (let k = 0; k < this.N; k++) if (s[k] && this.cells[k] === EMPTY) { batch.push({ i: k, from: EMPTY, to: MARK, auto: true }); this.cells[k] = MARK; this.paintCell(k, true); this.marksMade++; }
  }
  unmarkAuto(i) { /* marks placed automatically stay; undo removes them with the pup */ }

  mistake(i) {
    this.mistakes++;
    this.hearts = Math.max(0, this.hearts - 1);
    const d = this.cellEls[i];
    const tok = d.querySelector('.token');
    tok.innerHTML = this.tokenSadSvg;
    d.classList.add('wrong');
    sfx.wrong();
    if (this.settings.haptics) haptic([40, 40, 40]);
    this.clearHint(true);
    setTimeout(() => {
      d.classList.remove('wrong');
      tok.innerHTML = '';
      if (this.cells[i] !== MARK) { this.pushHistory([{ i, from: this.cells[i], to: MARK }]); this.cells[i] = MARK; this.marksMade++; }
      this.paintCell(i, true);
      d.classList.add('bad-mark'); setTimeout(() => d.classList.remove('bad-mark'), 900);
    }, 650);
    this.hooks.onMistake && this.hooks.onMistake(this);
    if (this.hearts === 0) { this.failed = true; this.pause(); setTimeout(() => this.hooks.onFail && this.hooks.onFail(this), 800); }
    this.changed();
  }

  /** give one heart back (bought with treats) */
  revive() { this.failed = false; this.hearts = 1; this.start(); this.changed(); }

  undo() {
    if (this.done || this.failed || !this.history.length) return;
    const batch = this.history.pop();
    for (let k = batch.length - 1; k >= 0; k--) { const { i, from } = batch[k]; this.cells[i] = from; this.paintCell(i, false); }
    sfx.clear();
    this.clearHint(false);
    this.changed();
  }

  restart() {
    for (let i = 0; i < this.N; i++) if (!this.given[i]) this.cells[i] = EMPTY;
    this.hearts = this.maxHearts; this.mistakes = 0; this.history = []; this.failed = false; this.done = false;
    this.hintsUsed = 0; this.freeHintsUsed = 0; this.fetched = 0; this.elapsed = 0;
    this.clearHint(false);
    if (this.el) for (let i = 0; i < this.N; i++) this.paintCell(i, false);
    this.changed();
  }

  checkWin() {
    let pups = 0;
    for (let i = 0; i < this.N; i++) if (this.cells[i] === PUP) pups++;
    if (pups < this.n) return false;
    this.done = true; this.pause();
    this.clearHint(false);
    const stars = 3 - (this.mistakes > 0 ? 1 : 0) - (this.hintsUsed > 0 ? 1 : 0);
    this.celebrate();
    setTimeout(() => this.hooks.onWin && this.hooks.onWin(this, { time: this.elapsed, mistakes: this.mistakes, hints: this.hintsUsed, fetched: this.fetched, stars }), 300);
    return true;
  }
  celebrate() {
    this.el.classList.add('won');
    let k = 0;
    for (let i = 0; i < this.N; i++) if (this.cells[i] === PUP) {
      const tok = this.cellEls[i].querySelector('.token');
      tok.style.animationDelay = (k++ * 90) + 'ms';
      tok.classList.add('jump');
      const svg = tok.querySelector('svg'); if (svg) svg.dataset.mood = 'excited';
    }
  }

  // ---------------------------------------------------------------- timer

  start() { if (this.running || this.done || this.failed) return; this.running = true; this.lastTick = performance.now(); }
  pause() { if (!this.running) return; this.elapsed += performance.now() - this.lastTick; this.running = false; }
  resume() { if (!this.done && !this.failed && this.history.length + this.hintsUsed > 0) this.start(); }
  get time() { return this.elapsed + (this.running ? performance.now() - this.lastTick : 0); }

  // ---------------------------------------------------------------- hints

  board() {
    const pups = new Set(), marks = new Set();
    for (let i = 0; i < this.N; i++) { if (this.cells[i] === PUP) pups.add(i); else if (this.cells[i] === MARK) marks.add(i); }
    return { pups, marks };
  }

  /** Sniff: explain the next deduction. Returns {ok, reason} */
  requestHint() {
    if (this.done || this.failed) return { ok: false };
    if (this.hint) { this.applyHint(); return { ok: true, applied: true }; }
    const step = nextDeduction(this.puzzle, this.board(), this.puzzle.solution);
    if (!step) return { ok: false, reason: 'solved' };
    const mechanical = step.tech && (step.tech.id === 'basic' || step.tech.id === 'mistake');
    if (!mechanical) {
      if (this.freeHintsUsed < FREE_HINTS) this.freeHintsUsed++;
      else if (!(this.hooks.spend && this.hooks.spend(1, 'hint'))) return { ok: false, reason: 'treats', cost: 1 };
      this.hintsUsed++;
    }
    this.start();
    this.hint = step;
    this.showHint(step);
    sfx.hint();
    this.changed();
    return { ok: true, step, free: mechanical || this.freeHintsUsed <= FREE_HINTS };
  }
  hintsLeftFree() { return Math.max(0, FREE_HINTS - this.freeHintsUsed); }

  showHint(step) {
    const el = this.el;
    el.classList.add('hinting');
    const focus = new Set(step.focus.cells);
    for (const u of step.focus.units) for (const i of this.unitCells(u)) focus.add(i);
    for (let i = 0; i < this.N; i++) {
      const d = this.cellEls[i];
      d.classList.toggle('hl', focus.has(i));
      d.classList.toggle('hl-main', step.focus.cells.includes(i));
      d.classList.toggle('hl-out', step.eliminate.includes(i) || (step.unmark || []).includes(i));
      d.classList.toggle('hl-in', step.place.includes(i));
      d.classList.toggle('hl-ghost', step.why.kind === 'hypo' && (i === step.why.cell || step.why.chain.some(x => x.cell === i)));
    }
    const text = explainStep(step, this.puzzle, this.colors);
    this.hooks.onHint && this.hooks.onHint(this, step, text);
  }
  unitCells(u) {
    const out = [];
    for (let i = 0; i < this.N; i++) {
      const r = (i / this.n) | 0, c = i % this.n;
      if ((u.type === 'row' && r === u.idx) || (u.type === 'col' && c === u.idx) || (u.type === 'reg' && this.puzzle.regions[i] === u.idx)) out.push(i);
    }
    return out;
  }
  clearHint(notify = true) {
    if (!this.hint && !this.el?.classList.contains('hinting')) return;
    this.hint = null;
    if (this.el) {
      this.el.classList.remove('hinting');
      for (const d of this.cellEls) d.classList.remove('hl', 'hl-main', 'hl-out', 'hl-in', 'hl-ghost');
    }
    if (notify) this.hooks.onHint && this.hooks.onHint(this, null, null);
  }
  /** "Show me": perform the pending hint on the board */
  applyHint() {
    const step = this.hint; if (!step) return;
    const batch = [];
    for (const i of (step.unmark || [])) if (this.cells[i] === MARK) { batch.push({ i, from: MARK, to: EMPTY }); this.cells[i] = EMPTY; this.paintCell(i, true); }
    for (const i of step.eliminate) if (this.cells[i] === EMPTY) { batch.push({ i, from: EMPTY, to: MARK }); this.cells[i] = MARK; this.paintCell(i, true); this.marksMade++; }
    for (const i of step.place) if (this.cells[i] !== PUP) {
      batch.push({ i, from: this.cells[i], to: PUP }); this.cells[i] = PUP; this.paintCell(i, true);
      if (this.settings.autoMark) this.autoMarkAround(i, batch);
    }
    if (step.eliminate.length && !step.place.length) sfx.mark();
    if (step.place.length) sfx.place();
    this.pushHistory(batch);
    this.clearHint(true);
    this.checkWin();
  }

  /** Fetch: reveal one correct pup (the app has already charged treats) */
  fetchPup() {
    if (this.done || this.failed) return false;
    this.start();
    // prefer the most constrained row (fewest open squares)
    let best = -1, bestOpen = Infinity;
    for (let r = 0; r < this.n; r++) {
      const i = r * this.n + this.puzzle.solution[r];
      if (this.cells[i] === PUP) continue;
      let open = 0; for (let c = 0; c < this.n; c++) if (this.cells[r * this.n + c] === EMPTY) open++;
      if (open < bestOpen) { bestOpen = open; best = i; }
    }
    if (best < 0) return false;
    this.hintsUsed++; this.fetched++;
    const batch = [{ i: best, from: this.cells[best], to: PUP }];
    this.cells[best] = PUP; this.paintCell(best, true);
    this.cellEls[best].classList.add('fetched'); setTimeout(() => this.cellEls[best].classList.remove('fetched'), 1200);
    if (this.settings.autoMark) this.autoMarkAround(best, batch);
    this.pushHistory(batch);
    sfx.bark();
    this.clearHint(true);
    this.checkWin();
    return true;
  }

  // ---------------------------------------------------------------- keyboard / D-pad

  setCursor(i, scroll = true) {
    if (this.cursor >= 0 && this.cellEls[this.cursor]) this.cellEls[this.cursor].classList.remove('cursor');
    this.cursor = i;
    if (i >= 0) { const d = this.cellEls[i]; d.classList.add('cursor'); if (scroll) d.focus({ preventScroll: true }); }
  }
  moveCursor(dr, dc) {
    const n = this.n;
    if (this.cursor < 0) { this.setCursor(0); return true; }
    const r = (this.cursor / n) | 0, c = this.cursor % n;
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) return false; // leave the board
    this.setCursor(nr * n + nc);
    return true;
  }
  /** keyboard action on the cursor cell: 'cycle' | 'mark' | 'pup' | 'clear' */
  act(what) {
    if (this.cursor < 0 || this.done || this.failed) return;
    const i = this.cursor, s = this.cells[i];
    if (this.given[i]) return;
    if (what === 'cycle') this.cycle(i);
    else if (what === 'mark') { if (s === EMPTY) { this.pushHistory([{ i, from: s, to: MARK }]); this.set(i, MARK); } else if (s === MARK) { this.pushHistory([{ i, from: s, to: EMPTY }]); this.set(i, EMPTY); } }
    else if (what === 'pup') { if (s !== PUP) this.tryPlacePup(i); }
    else if (what === 'clear') { if (s !== EMPTY) { this.pushHistory([{ i, from: s, to: EMPTY }]); this.set(i, EMPTY); } }
  }

  // ---------------------------------------------------------------- persistence

  serialize() {
    let s = '';
    for (let i = 0; i < this.N; i++) s += this.cells[i];
    return { cells: s, hearts: this.hearts, mistakes: this.mistakes, hints: this.hintsUsed, free: this.freeHintsUsed, fetched: this.fetched, elapsed: Math.round(this.time), savedAt: Date.now(),
      history: this.history.slice(-40).map(b => b.map(x => [x.i, x.from, x.to])) };
  }
  restore(st) {
    if (!st || !st.cells || st.cells.length !== this.N) return;
    for (let i = 0; i < this.N; i++) { const v = Number(st.cells[i]); if (!this.given[i]) this.cells[i] = v === PUP && !this.solution[i] ? MARK : v; }
    this.hearts = st.hearts ?? 3; this.mistakes = st.mistakes || 0; this.hintsUsed = st.hints || 0; this.freeHintsUsed = st.free || 0; this.fetched = st.fetched || 0;
    this.elapsed = st.elapsed || 0;
    this.history = (st.history || []).map(b => b.map(([i, from, to]) => ({ i, from, to })));
    if (this.hearts <= 0) this.failed = true;
  }
  isFresh() { return this.history.length === 0 && this.hintsUsed === 0 && this.mistakes === 0; }
}

export { EMPTY, MARK, PUP, FREE_HINTS, neighbours8 };

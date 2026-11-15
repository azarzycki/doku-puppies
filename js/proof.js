/*
 * No-guessing mode: every cross is proven, and a pup only sits where nothing else is possible.
 *
 * Two ways of giving the reason are on trial (settings.noGuessStyle); the same engine checks serve both:
 *   A  "point at what blocks it". Tap a square to cross it off. Unless a seated pup already blocks it, the square
 *      shows a "?" and waits while the player lights the squares that block it: every open square of some row,
 *      column or yard (one of them has to hold that pup), each of which a pup on the "?" square would clash with.
 *   B  "ghost pup". Tap a square to try a pup on it. Every square that pup would block goes dark, and the player
 *      taps the row, column or yard that is left with no room.
 * Both are one argument (engine.rulesOut): a pup on the square would leave those units with no way to seat their
 * pups. Squares a seated pup blocks may be crossed freely, and a pup sits where a unit has one open square left.
 *
 * A what-if (this.tests) is the board one level down: a pup on trial plus the proven moves made after it. The same
 * moves work inside it. When a row, column or yard has nowhere left (the player taps one of its squares, all dark by
 * then, or names it whole), the square on trial is crossed off one level up.
 * Style A starts one from the "What if…?" button after a refused pup; in style B every test of a square is one.
 */
import { proofState, forcedIn, stuck, rulesOut, unitsWithin, unitHas, unitsThrough } from './engine.js';
import { sfx, haptic } from './sound.js';

const EMPTY = 0, MARK = 1, PUP = 2;
const MAX_PICKS = 4; // rows / columns / yards that one reason may name whole
const MAX_DEPTH = 3; // style B: what-ifs inside what-ifs

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const same = (a, b) => a.type === b.type && a.idx === b.idx;
const plural = (k, one, many) => (k === 1 ? one : many);

export class Proof {
  constructor(game) {
    this.g = game;
    this.tests = [];      // what-ifs in progress, outermost first: { cell, steps: [{ t: 'pup' | 'x', i }] }
    this.ask = -1;        // style A: the square waiting for its reason
    this.lit = new Set(); // style A: squares lit one at a time
    this.picks = [];      // rows / columns / yards named whole (A: lit as a block, B: "these have no room")
    this.used = false;    // the reason on show has already proven something, so the next question starts afresh
    this.offer = -1;      // style A: the square the "What if…?" button would try
    this.msg = null;      // what the pup under the board says; null = the standing text for the current state
    this.shown = false;
  }
  get on() { return !!this.g.settings.noGuess; }
  get style() { return this.g.settings.noGuessStyle === 'B' ? 'B' : 'A'; }
  get top() { return this.tests[this.tests.length - 1] || null; }
  /** a question or a what-if is open: the real board holds still until it is settled */
  get busy() { return this.ask >= 0 || this.tests.length > 0; }
  name(u) { return this.g.unitName(u); }

  /** what is known right now: the real board, plus every what-if in progress */
  st() {
    const g = this.g, s = proofState(g.puzzle, g.board());
    for (const t of this.tests) { s.place(t.cell); for (const x of t.steps) { if (x.t === 'pup') s.place(x.i); else s.eliminate(x.i); } }
    return s;
  }
  /** what the what-ifs have put on square i: 'q' (the pup on trial), 'pup', 'x', or null */
  ghostAt(i) {
    for (const t of this.tests) { if (t.cell === i) return 'q'; for (const x of t.steps) if (x.i === i) return x.t; }
    return null;
  }
  /** style A: the lit squares, counting the open squares of anything named whole */
  litCells(st) {
    const cells = new Set();
    for (const i of this.lit) if (st.cand[i] && !st.pup[i]) cells.add(i);
    for (const u of this.picks) for (const i of st.unitCells(u.type, u.idx)) cells.add(i);
    return cells;
  }
  /** the rows, columns and yards the reason stands for: those named whole, plus (style A) every one whose open squares are all lit */
  reason(st) {
    const us = this.picks.slice();
    if (this.style === 'A') for (const u of unitsWithin(st, this.litCells(st))) if (!us.some(p => same(p, u))) us.push(u);
    return us;
  }
  /** the fewest of these units that still make the point, for saying why */
  minimal(us, test) {
    for (const u of us) if (test([u])) return [u];
    for (let a = 0; a < us.length; a++) for (let b = a + 1; b < us.length; b++) if (test([us[a], us[b]])) return [us[a], us[b]];
    for (let a = 0; a < us.length; a++) for (let b = a + 1; b < us.length; b++) for (let c = b + 1; c < us.length; c++) if (test([us[a], us[b], us[c]])) return [us[a], us[b], us[c]];
    return us.slice();
  }

  // ---------------------------------------------------------------- input

  /** every input runs through here: drop the last remark, act, then repaint and let the app show the new text */
  input(fn) {
    const g = this.g;
    if (!this.on || g.done || g.failed) return false;
    this.msg = null; this.offer = -1;
    const r = fn();
    this.paint(); this.notify();
    return r;
  }
  /** a tap on square i. Returns what it did, so a double-tap can take it back. */
  tap(i) { return this.input(() => (this.style === 'B' ? this.tapB(i) : this.tapA(i))); }
  /** the second tap of a double-tap: seat a pup, once the first tap is taken back */
  doubleTap(i, first) {
    if (first === 'picked' || first === 'stopped') return; // style B: the first tap already said it all
    if (first === 'lit' && this.ask < 0) return;           // style A: the first tap finished the proof
    this.input(() => {
      if (first === 'lit') { const st = this.st(); this.toggleLit(st, i); this.judgeA(st); return; } // two quick taps on a blocker: on, then off
      if (first === 'tested') { // style B: the first tap put a ghost here. Would the pup have to sit here anyway?
        const t = this.tests.pop(), u = forcedIn(this.st(), i);
        if (u) { this.seat(i, u); return; }
        this.tests.push(t); return;
      }
      if (first === 'crossed' || first === 'cleared') this.fold(i);
      this.trySeat(i);
    });
  }
  /** remote OK / Enter: seat a pup that has to sit here, otherwise the same as a tap */
  ok(i) {
    return this.input(() => {
      if (this.g.cells[i] === EMPTY && !this.ghostAt(i) && forcedIn(this.st(), i)) return this.trySeat(i);
      return this.style === 'B' ? this.tapB(i) : this.tapA(i);
    });
  }
  /** keyboard P, or anything else that asks outright for a pup on i */
  seatKey(i) { return this.input(() => this.trySeat(i)); }
  /** a long press: the whole yard of square i */
  hold(i) { this.input(() => { if (this.g.settings.haptics) haptic(12); const st = this.st(); this.unit(st, { type: 'reg', idx: st.reg[i] }); }); }
  /** a fence tab: a whole row or column */
  tab(u) { this.input(() => this.unit(this.st(), u)); }
  /** keyboard R / C / Y: the row, column or yard under the cursor */
  key(type) {
    const g = this.g, i = g.cursor; if (i < 0) return;
    this.tab({ type, idx: type === 'row' ? (i / g.n) | 0 : type === 'col' ? i % g.n : g.puzzle.regions[i] });
  }
  /** a button under the board */
  press(id) {
    const offer = this.offer;
    this.input(() => {
      if (id === 'cancel') this.back();
      else if (id === 'stop') this.stopAll();
      else if (id === 'clear') this.clearReason();
      else if (id === 'whatif') { if (offer >= 0) this.startTest(offer); }
      else if (id === 'style') { const g = this.g; g.settings.noGuessStyle = this.style === 'B' ? 'A' : 'B'; this.stopAll(); if (g.hooks.onSettings) g.hooks.onSettings(g); }
    });
  }
  /** Back / Escape: drop the question or leave the what-if. False when neither was open. */
  backOut() { if (!this.on || !this.busy) return false; this.input(() => this.back()); return true; }
  /** Undo: the question, then the last move inside the what-if, then the what-if itself. False = undo the real board. */
  undo() {
    if (!this.on) return false;
    if (!this.busy) { this.clearReason(); return false; }
    this.input(() => {
      const t = this.top;
      if (this.ask >= 0 || !t.steps.length) this.back();
      else { t.steps.pop(); this.clearReason(); sfx.clear(); }
    });
    return true;
  }
  /** may a drag cross square i? Only where no new reason is needed. */
  canDrag(i) {
    if (this.busy) return false;
    const st = this.st();
    if (!st.cand[i]) return true;
    const us = this.reason(st);
    if (!us.length || !rulesOut(st, us, i)) return false;
    this.used = true;
    return true;
  }

  // ---------------------------------------------------------------- style A: point at what blocks it

  tapA(i) {
    const g = this.g, s = g.cells[i], inTest = this.tests.length > 0;
    if (!inTest && s !== EMPTY) {
      if (this.ask >= 0 || g.given[i]) return false; // the real board holds still while a question is open
      g.clearCell(i);
      return 'cleared';
    }
    if (i === this.ask) { this.ask = -1; this.clearReason(); return 'unasked'; } // the "?" again: never mind
    const st = this.st();
    if (inTest && (s !== EMPTY || !st.cand[i] || st.pup[i])) {                   // inside a what-if a dark square says "nothing fits here any more"
      if (i !== this.top.cell) this.deadEnd(st, i);
      return 'picked';
    }
    if (!st.cand[i]) {                                                           // a seated pup already blocks it
      if (this.ask >= 0) return false;
      g.markCell(i);
      return 'crossed';
    }
    if (this.ask >= 0) { this.toggleLit(st, i); this.judgeA(st); return 'lit'; }
    const us = this.reason(st);
    if (us.length && rulesOut(st, us, i)) {                                      // the lit squares block this one too
      const why = this.whyOut(st, us, i);
      this.used = true; this.cross(i);
      this.say('Crossed off', `Same reason: ${g.unitList(why)} would have nowhere to go.`, 'happy');
      return 'crossed';
    }
    const only = forcedIn(st, i);
    if (only) { this.say('Only spot', `This is the only square left for ${this.name(only)}, so it cannot be ruled out. Double-tap to seat the pup.`); return false; }
    if (this.used) this.clearReason();
    this.ask = i; sfx.tap();
    this.judgeA(st); // squares lit beforehand may simply not reach this one
    return 'asked';
  }
  toggleLit(st, i) {
    const whole = this.picks.filter(u => unitHas(st, u, i));
    if (whole.length) { // lit as part of something named whole: keep the rest of it lit, square by square
      for (const u of whole) { this.picks.splice(this.picks.indexOf(u), 1); for (const c of st.unitCells(u.type, u.idx)) if (c !== i) this.lit.add(c); }
      this.lit.delete(i);
    } else if (this.lit.has(i)) this.lit.delete(i); else this.lit.add(i);
    this.used = false;
    sfx.tap();
  }
  /** the units among `us` that a pup on i would leave with no room */
  whyOut(st, us, i) { const t = st.clone(); t.place(i); return this.minimal(us, sub => stuck(t, sub)); }
  /** the lit squares changed: do they settle the question, or (inside a what-if) show a dead end? */
  judgeA(st) {
    const us = this.reason(st);
    if (!us.length) return;
    if (this.tests.length && stuck(st, us)) { this.refute(st, us); return; }
    if (this.ask < 0 || !rulesOut(st, us, this.ask)) return;
    const i = this.ask, why = this.whyOut(st, us, i);
    this.ask = -1; this.lit.clear(); this.picks = why; this.used = true;
    this.cross(i);
    this.say('Crossed off', `${cap(this.g.unitList(why))} would have nowhere to go. The lit squares stay lit: tap any other square they block.`, 'happy');
  }
  /** lit squares that a pup on the "?" square would not clash with: why a complete group still proves nothing */
  missCells(st, us) {
    const out = new Set();
    if (this.style !== 'A' || this.ask < 0 || us.length !== 1 || unitHas(st, us[0], this.ask)) return out;
    const sh = st.shadow(this.ask);
    for (const i of st.unitCells(us[0].type, us[0].idx)) if (!sh[i]) out.add(i);
    return out;
  }
  /** where the reason stands, in words */
  statusA(st) {
    const g = this.g, us = this.reason(st), cells = this.litCells(st), ask = this.ask;
    if (ask < 0) {
      if (us.length) return { title: `Lit: ${g.unitList(us)}`, text: `Now tap a square ${plural(us.length, 'it rules', 'they rule')} out.` };
      return { title: 'Squares lit', text: 'Tap the square they rule out. They have to be every open square of a row, column or yard.' };
    }
    const title = 'Why is this square out?';
    if (!cells.size) return { title, text: 'Tap the squares that block it. Hold a square to take its whole yard; a fence tab takes a row or column.' };
    if (!us.length) {
      let best = null; // the row, column or yard through every lit square that is closest to complete
      const all = [...cells];
      for (const u of unitsThrough(st, all[0])) {
        if (st.unitHasPup(u.type, u.idx) || !all.every(i => unitHas(st, u, i))) continue;
        const more = st.unitCells(u.type, u.idx).filter(i => !cells.has(i)).length;
        if (!best || more < best.more) best = { u, more };
      }
      if (best) return { title, text: `${cap(this.name(best.u))} has ${best.more} more open ${plural(best.more, 'square', 'squares')}. Light ${plural(best.more, 'it', 'them')} too: the lit squares must be all it has left.` };
      return { title, text: 'These are not yet every open square of a row, column or yard. Keep going, or clear and start again.' };
    }
    if (us.length === 1) {
      const u = us[0];
      if (st.unitHasPup(u.type, u.idx)) return { title, text: `${cap(this.name(u))} already has its pup, so it cannot be the reason.` };
      if (unitHas(st, u, ask)) return { title, text: `The ? square is one of ${this.name(u)}’s own open squares, so ${this.name(u)} cannot rule it out.` };
      const k = this.missCells(st, us).size;
      return { title, text: `${cap(this.name(u))}’s pup could still sit on the red-edged ${plural(k, 'square', 'squares')}: no clash with the ? square.` };
    }
    return { title, text: `${cap(g.unitList(us))} could still all be seated with a pup on the ? square.` };
  }

  // ---------------------------------------------------------------- style B: ghost pup

  tapB(i) {
    const g = this.g, s = g.cells[i], t = this.top;
    if (!t) {
      if (g.given[i]) return false;
      if (s !== EMPTY) { g.clearCell(i); return 'cleared'; }
    } else if (i === t.cell) { this.back(); return 'stopped'; }                                 // the ghost again: never mind
    const st = this.st();
    if (t && (s !== EMPTY || !st.cand[i] || st.pup[i])) { this.claim(st, i); return 'picked'; } // a dark square: "nothing fits here any more"
    if (!st.cand[i]) { g.markCell(i); return 'crossed'; }                                       // a seated pup already blocks it
    if (this.picks.length && rulesOut(st, this.picks, i)) {                                     // the same units as last time
      const why = this.whyOut(st, this.picks, i);
      this.used = true; this.cross(i);
      this.say('Crossed off', `Same reason: ${g.unitList(why)} would have nowhere to go.`, 'happy');
      return 'crossed';
    }
    const only = forcedIn(st, i);
    if (only) { this.say('Only spot', `This is the only square left for ${this.name(only)}. Double-tap to seat the pup.`); return false; }
    return this.startTest(i) ? 'tested' : false;
  }
  /** a dark square was tapped inside a what-if: its yard joins the picks unless something through it already has no room */
  claim(st, i) {
    const yard = unitsThrough(st, i)[2];
    if (this.deadEnd(st, i)) return;
    if (!this.picks.some(p => same(p, yard)) && !this.togglePick(yard)) return;
    if (this.picks.length > 1) { if (stuck(st, this.picks)) this.refute(st, this.picks); else this.msg = null; } // several picks: statusB says how they stand
  }
  judgeB(st) { if (this.tests.length && this.picks.length && stuck(st, this.picks)) this.refute(st, this.picks); }
  testTitle() { return this.tests.length > 1 ? 'And a pup here too?' : 'What if a pup sat here?'; }
  statusB(st) {
    const g = this.g, us = this.picks;
    if (!this.tests.length) return { title: `Picked: ${g.unitList(us)}`, text: `Tap a square that would leave ${plural(us.length, 'it', 'them')} no room.` };
    if (us.length > 1) return { title: this.testTitle(), text: `${cap(g.unitList(us))} can still all be seated.` };
    const u = us[0], k = st.unitCells(u.type, u.idx).length;
    const has = st.unitHasPup(u.type, u.idx) ? `${cap(this.name(u))} has its pup.` : `${cap(this.name(u))} still has ${k} lit ${plural(k, 'square', 'squares')}.`;
    return { title: this.testTitle(), text: `${has} Nobody stuck? Double-tap a lit square that is now someone’s only spot.` };
  }

  // ---------------------------------------------------------------- shared moves

  /** inside a what-if a dark square was tapped: if its yard, row or column has nowhere left, the what-if is settled */
  deadEnd(st, i) {
    const [row, col, yard] = unitsThrough(st, i);
    const hit = [yard, row, col].find(u => stuck(st, [u]));
    if (hit) { this.refute(st, [hit]); return true; }
    const room = u => (st.unitHasPup(u.type, u.idx) ? `${this.name(u)} has its pup` : `${this.name(u)} has ${st.unitCells(u.type, u.idx).length} lit`);
    this.say(this.testTitle(), `Nothing through that square is stuck: ${room(yard)}, ${room(row)}, ${room(col)}.`);
    return false;
  }
  /** a whole row, column or yard was named (hold, fence tab, R / C / Y) */
  unit(st, u) {
    if (!this.togglePick(u)) return;
    if (this.style === 'B') this.judgeB(st); else this.judgeA(st);
  }
  togglePick(u) {
    const k = this.picks.findIndex(p => same(p, u));
    if (k >= 0) this.picks.splice(k, 1);
    else if (this.picks.length >= MAX_PICKS) { this.say('That is plenty', `One reason can name up to ${MAX_PICKS} rows, columns or yards. Clear one first.`); return false; }
    else this.picks.push({ type: u.type, idx: u.idx });
    this.used = false;
    sfx.tap();
    return true;
  }
  clearReason() { this.lit.clear(); this.picks = []; this.used = false; }
  say(title, text, mood, extra) { this.msg = { title, text, mood: mood || 'think', extra: extra || [] }; }
  /** record a proven cross: on the real board, or inside the innermost what-if */
  cross(i) {
    const g = this.g, t = this.top;
    if (t) { t.steps.push({ t: 'x', i }); sfx.mark(); if (g.settings.haptics) haptic(8); }
    else g.markCell(i);
  }
  /** take back what the first tap of a double-tap did to square i */
  fold(i) {
    const t = this.top;
    if (!t) { this.g.foldLast(i); return; }
    const x = t.steps[t.steps.length - 1];
    if (x && x.i === i && x.t === 'x') t.steps.pop();
  }
  /** a pup is asked for on i: it sits only where a row, column or yard leaves no other square */
  trySeat(i) {
    const g = this.g, inTest = this.tests.length > 0, gh = this.ghostAt(i);
    this.ask = -1;
    if (g.given[i] || g.cells[i] === PUP || gh === 'q' || gh === 'pup') return false;
    if (g.cells[i] === MARK || gh === 'x') {
      this.say('Crossed off', inTest ? 'That square is ruled out here. Undo steps back inside a what-if.' : 'You crossed this square off. Clear the cross first if you have changed your mind.');
      return false;
    }
    const st = this.st();
    if (!st.cand[i]) { this.say('Not here', 'A pup already rules this square out: it shares its row, column or yard, or sits right next to it.', 'sad'); return false; }
    const u = forcedIn(st, i);
    if (u) return this.seat(i, u);
    if (this.style === 'B') { this.startTest(i); return false; }
    const rivals = new Set();
    for (const r of unitsThrough(st, i)) for (const c of st.unitCells(r.type, r.idx)) if (c !== i) rivals.add(c);
    this.flash(rivals, 'rival', 1700);
    if (inTest) { this.say('Not the only spot yet', 'The flashing squares could still take this pup. Rule them out first.'); return false; }
    this.offer = i;
    this.say('Not the only spot yet', 'The flashing squares could still take this pup. Rule them out first, or try the pup in a what-if.', 'think', [{ id: 'whatif', label: 'What if…?', primary: true }]);
    return false;
  }
  seat(i, u) {
    const g = this.g, t = this.top;
    this.ask = -1; this.clearReason();
    if (!t) return g.placePup(i);
    t.steps.push({ t: 'pup', i }); sfx.tap();
    this.say(this.testTitle(), `Then ${this.name(u)}’s pup has to sit there. ${this.style === 'B' ? 'Who has no room now?' : 'Keep going.'}`);
    return true;
  }
  /** put a pup on trial on square i */
  startTest(i) {
    const g = this.g, B = this.style === 'B';
    if (this.tests.length >= (B ? MAX_DEPTH : 1)) { this.say('One at a time', B ? `That is ${MAX_DEPTH} what-ifs deep. Settle one first.` : 'Finish this what-if first.'); return false; }
    g.clearHint(true);
    if (!B || this.used) this.clearReason(); // style B: units picked beforehand stay as the ones to watch
    this.ask = -1;
    this.tests.push({ cell: i, steps: [] });
    g.start(); sfx.hint();
    if (B) this.judgeB(this.st());
    return true;
  }
  /** the innermost what-if has run into a dead end: its square is crossed off one level up */
  refute(st, us) {
    const g = this.g, why = this.minimal(us, sub => stuck(st, sub));
    const t = this.tests.pop();
    this.ask = -1; this.lit.clear();
    if (this.style === 'B') { this.picks = why.slice(); this.used = true; } else { this.picks = []; this.used = false; }
    this.cross(t.cell);
    const cells = new Set(); for (const u of why) for (const c of g.unitCells(u)) cells.add(c);
    this.flash(cells, 'stuckflash', 1000);
    this.say('Ruled out', `${cap(g.unitList(why))} would have nowhere to go, so no pup on that square.${this.tests.length ? ' You are back in the what-if before it.' : ''}`, 'happy');
  }
  back() {
    if (this.ask >= 0) { this.ask = -1; this.clearReason(); return true; }
    if (this.tests.length) { this.tests.pop(); this.clearReason(); sfx.clear(); return true; }
    return false;
  }
  stopAll() { this.tests = []; this.ask = -1; this.clearReason(); }
  /** forget everything in progress (restart, a hint, the mode or its style switched, the board solved) */
  reset() { this.stopAll(); this.msg = null; this.offer = -1; this.paint(); this.notify(); }
  /** the real board changed underneath: keep what still makes sense */
  sync() {
    const g = this.g;
    if (this.ask >= 0 && g.cells[this.ask] !== EMPTY) this.ask = -1;
    this.paint();
    if ((this.on && !g.done && !g.failed) !== this.shown) this.notify();
  }
  refresh() { this.msg = null; this.paint(); this.notify(); }

  // ---------------------------------------------------------------- what the player sees

  standing() {
    const B = this.style === 'B';
    if (this.tests.length) {
      return B ? { title: this.testTitle(), text: 'Dark squares are blocked. Who has no room left? Tap any square of that row, column or yard.' }
        : { title: 'What if a pup sat here?', text: 'Dark squares are blocked. Play on as usual. When a row, column or yard has nowhere left, tap any square in it.' };
    }
    return B ? { title: 'No guessing · B', text: 'Tap a square to try a pup on it. Then tap the row, column or yard it leaves with no room.', mood: 'happy' }
      : { title: 'No guessing · A', text: 'Tap a square to cross it off. If it is not obvious why, you will be asked what blocks it.', mood: 'happy' };
  }
  buttons() {
    const out = [], B = this.style === 'B', hasReason = this.lit.size > 0 || this.picks.length > 0;
    if (this.ask >= 0) out.push({ id: 'cancel', label: 'Never mind' });
    else if (this.tests.length) out.push({ id: 'cancel', label: B ? 'Never mind' : 'Stop' });
    if (hasReason) out.push({ id: 'clear', label: 'Clear' });
    if (this.ask >= 0 && this.tests.length) out.push({ id: 'stop', label: 'Stop what-if' });
    if (!this.busy && !hasReason) out.push({ id: 'style', label: `Switch to ${B ? 'A' : 'B'}` });
    return out;
  }
  /** the text and buttons for the panel under the board, or null when the mode has nothing to say */
  view() {
    const g = this.g;
    if (!this.on || g.done || g.failed) return null;
    let m = this.msg;
    if (!m) {
      const A = this.style === 'A';
      if (A && (this.ask >= 0 || this.lit.size || this.picks.length)) m = this.statusA(this.st());
      else if (!A && this.picks.length) m = this.statusB(this.st());
      else m = this.standing();
    }
    const extra = m.extra || [];
    return { title: m.title, text: m.text, mood: m.mood || 'think', buttons: [...extra, ...this.buttons().filter(b => !(extra.length && b.id === 'style'))] };
  }
  notify() { const v = this.view(); this.shown = !!v; if (this.g.hooks.onProof) this.g.hooks.onProof(this.g, v); }
  flash(cells, cls, ms) {
    const g = this.g; if (!g.cellEls) return;
    for (const d of g.cellEls) d.classList.remove(cls);
    void g.el.offsetWidth;
    for (const i of cells) g.cellEls[i].classList.add(cls);
    clearTimeout(g.timers[cls]);
    g.timers[cls] = setTimeout(() => { g.timers[cls] = null; if (g.cellEls) for (const d of g.cellEls) d.classList.remove(cls); }, ms);
  }
  /** lit squares, the "?", fence tabs, and the what-if overlay with its faded pieces */
  paint() {
    const g = this.g; if (!g.cellEls) return;
    const on = this.on && !g.done, B = this.style === 'B';
    g.el.classList.toggle('proof', on);
    const st = on ? this.st() : null;
    if (on) for (const i of [...this.lit]) if (!st.cand[i] || st.pup[i]) this.lit.delete(i);
    const us = on ? this.reason(st) : [];
    const inTest = on && this.tests.length > 0, top = inTest ? this.top.cell : -1;
    const ev = new Set();
    if (on && B) { for (const u of this.picks) for (const i of g.unitCells(u)) ev.add(i); }
    else if (on) { for (const i of this.litCells(st)) ev.add(i); }
    const miss = on ? this.missCells(st, us) : new Set();
    for (let k = 0; k < g.N; k++) {
      const d = g.cellEls[k], c = d.classList, gh = inTest ? this.ghostAt(k) : null, ghost = gh === 'q' || gh === 'pup';
      c.toggle('ev', ev.has(k));
      c.toggle('miss', miss.has(k));
      c.toggle('ask', on && k === this.ask);
      c.toggle('wi', inTest && !!st.cand[k] && !st.pup[k]);
      c.toggle('tx', gh === 'x');
      c.toggle('ghost-q', gh === 'q');
      c.toggle('ghost-top', k === top);
      const tok = d.querySelector('.token');
      if (ghost) { if (!tok.firstChild) tok.innerHTML = g.tokenSvg; }
      else if (c.contains('ghost') && g.cells[k] !== PUP) tok.innerHTML = '';
      c.toggle('ghost', ghost);
    }
    g.el.classList.toggle('whatif', inTest);
    for (const t of (g.tabEls || [])) { const u = { type: t.dataset.type, idx: Number(t.dataset.idx) }; t.classList.toggle('on', us.some(p => same(p, u))); }
  }
}

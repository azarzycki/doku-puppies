/*
 * Pupdoku — app shell: screens, navigation, progression, prizes, dialogs, D-pad support.
 */
import { Store, todayKey, nextDayKey } from './store.js';
import { PUPS, PUP_BY_ID, EVENTS, activeEvent, eventKey, pupSvg, lockedPupSvg } from './pups.js';
import { getLevel, getEndlessLevel, getFreePuzzle, getDaily, getEventPuzzle, getWalks, levelCount, loadLevels, loadDaily, RANKS, WALKS_META } from './puzzles.js';
import { Game, FREE_HINTS, MARK_STYLES } from './game.js';
import { sfx, setSoundEnabled, haptic } from './sound.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COSTS = { hint: 1, fetch: 3, heart: 5 };
const REWARDS = { level: 2, stars3: 2, boss: 5, daily: 5, event: 3, eventDone: 20, endless: 3 };
const STREAK_BONUS = { 3: 5, 7: 10, 14: 20, 30: 50, 100: 100, 365: 500 };

const TRICKS = [
  { id: 'first-sit', name: 'First Sit', text: 'Solve your first puzzle', treats: 5, check: p => p.stats.solved >= 1, progress: p => [Math.min(1, p.stats.solved), 1] },
  { id: 'ten-pack', name: 'Ten Pack', text: 'Solve 10 puzzles', treats: 10, check: p => p.stats.solved >= 10, progress: p => [Math.min(10, p.stats.solved), 10] },
  { id: 'fifty', name: 'Fifty Fetches', text: 'Solve 50 puzzles', treats: 20, check: p => p.stats.solved >= 50, progress: p => [Math.min(50, p.stats.solved), 50] },
  { id: 'century', name: 'Century Hound', text: 'Solve 100 puzzles', treats: 50, check: p => p.stats.solved >= 100, progress: p => [Math.min(100, p.stats.solved), 100] },
  { id: 'clean-5', name: 'Good Dog', text: 'Five 3-star solves', treats: 10, check: p => p.stats.perfect >= 5, progress: p => [Math.min(5, p.stats.perfect), 5] },
  { id: 'clean-25', name: 'Best in Show', text: 'Twenty-five 3-star solves', treats: 30, check: p => p.stats.perfect >= 25, progress: p => [Math.min(25, p.stats.perfect), 25] },
  { id: 'no-sniff-10', name: 'Nose Knows', text: '10 solves without hints', treats: 10, check: p => p.stats.noHint >= 10, progress: p => [Math.min(10, p.stats.noHint), 10] },
  { id: 'speedy', name: 'Zoomies', text: 'Solve a 7×7 or bigger in under 60 s', treats: 15, check: p => p.stats.zoomies >= 1, progress: p => [Math.min(1, p.stats.zoomies || 0), 1] },
  { id: 'marksman', name: 'X Marks the Spot', text: 'Cross off 500 squares', treats: 10, check: p => p.stats.marks >= 500, progress: p => [Math.min(500, p.stats.marks), 500] },
  { id: 'big-board', name: 'Big Yard', text: 'Solve a 10×10 or bigger board', treats: 15, check: p => (p.stats.bySize[10] || 0) + (p.stats.bySize[11] || 0) + (p.stats.bySize[12] || 0) >= 1, progress: p => [Math.min(1, (p.stats.bySize[10] || 0) + (p.stats.bySize[11] || 0) + (p.stats.bySize[12] || 0)), 1] },
  { id: 'legend', name: 'Legend', text: 'Solve a Legend-rank puzzle', treats: 30, check: p => (p.stats.byRank[5] || 0) >= 1, progress: p => [Math.min(1, p.stats.byRank[5] || 0), 1] },
  { id: 'daily-10', name: 'Regular', text: 'Solve 10 daily puzzles', treats: 20, check: p => Object.keys(p.daily).length >= 10, progress: p => [Math.min(10, Object.keys(p.daily).length), 10] },
  { id: 'streak-7', name: 'Week of Walks', text: 'A 7-day daily streak', treats: 20, check: p => p.streak.best >= 7, progress: p => [Math.min(7, p.streak.best), 7] },
  { id: 'streak-30', name: 'Month of Walks', text: 'A 30-day daily streak', treats: 50, check: p => p.streak.best >= 30, progress: p => [Math.min(30, p.streak.best), 30] },
  { id: 'collector', name: 'Kennel Club', text: 'Adopt 8 pups', treats: 20, check: p => Object.keys(p.pups).length >= 8, progress: p => [Math.min(8, Object.keys(p.pups).length), 8] },
  { id: 'all-pups', name: 'Full House', text: 'Adopt every regular pup', treats: 100, check: p => PUPS.filter(x => x.unlock.type !== 'event').every(x => p.pups[x.id]), progress: p => [PUPS.filter(x => x.unlock.type !== 'event' && p.pups[x.id]).length, PUPS.filter(x => x.unlock.type !== 'event').length] },
];

const DAILY_TRICKS = [
  { id: 'solve2', name: 'Double fetch', text: 'Solve 2 puzzles', goal: 2, treats: 3, on: (e) => e.type === 'solve' ? 1 : 0 },
  { id: 'nohint', name: 'Nose work', text: 'Solve a puzzle without hints', goal: 1, treats: 3, on: e => e.type === 'solve' && e.hints === 0 ? 1 : 0 },
  { id: 'marks', name: 'Crossing guard', text: 'Cross off 30 squares', goal: 30, treats: 2, on: e => e.type === 'solve' ? e.marks : 0 },
  { id: 'big', name: 'Big yard day', text: 'Solve a 7×7 or bigger', goal: 1, treats: 3, on: e => e.type === 'solve' && e.n >= 7 ? 1 : 0 },
  { id: 'hearts', name: 'All hearts', text: 'Finish with all 3 hearts', goal: 1, treats: 3, on: e => e.type === 'solve' && e.mistakes === 0 ? 1 : 0 },
  { id: 'daily', name: 'Daily walk', text: 'Solve today’s daily', goal: 1, treats: 2, on: e => e.type === 'solve' && e.kind === 'daily' ? 1 : 0 },
  { id: 'three', name: 'Treble', text: 'Solve 3 puzzles', goal: 3, treats: 4, on: e => e.type === 'solve' ? 1 : 0 },
  { id: 'stars', name: 'Shiny', text: 'Earn 3 stars on a puzzle', goal: 1, treats: 3, on: e => e.type === 'solve' && e.stars === 3 ? 1 : 0 },
];

function fmtTime(ms) {
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
  return (m ? m + ':' : '0:') + String(s % 60).padStart(2, '0');
}
function paws(rank) { return '🐾'.repeat(rank) + '<span class="paw-dim">' + '🐾'.repeat(5 - rank) + '</span>'; }
function rankName(rank) { return RANKS[Math.max(1, Math.min(5, rank)) - 1].name; }
function starsHtml(n, big = false) { return `<span class="stars ${big ? 'big' : ''}">${[1, 2, 3].map(k => `<span class="star ${k <= n ? 'on' : ''}" style="--d:${k * 160}ms">★</span>`).join('')}</span>`; }

// ---------------------------------------------------------------- app

class App {
  constructor() {
    this.store = new Store();
    this.profile = this.store.profile;
    this.screens = $$('.screen');
    this.current = null;
    this.game = null;
    this.gameInfo = null;
    this.dialogStack = [];
    this.kb = false;
    this.deferredInstall = null;
    this.rewardQueue = [];
  }

  async init() {
    this.applySettings();
    this.store.on((what) => this.onStoreChange(what));
    this.bindGlobal();
    this.renderMascotEverywhere();
    await loadLevels().catch(e => { this.toast('Could not load levels — check your connection'); console.error(e); });
    this.rollDailyTricks();
    this.route(history.state || this.initialRoute(), true);
    this.store.connect();
    this.registerSW();
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.deferredInstall = e; $('#install-btn')?.classList.remove('hidden'); });
  }
  initialRoute() {
    const h = location.hash.replace('#', '');
    if (h === 'daily') return { s: 'daily' };
    return { s: 'home' };
  }

  // ---------------------------------------------------------------- settings / store

  applySettings() {
    const s = this.profile.settings;
    setSoundEnabled(s.sound !== false);
    document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
    document.body.classList.toggle('big-text', !!s.bigText);
  }
  onStoreChange(what) {
    this.profile = this.store.profile;
    if (what === 'merged' || what === 'reset') { this.applySettings(); if (this.current !== 'game') this.render(this.current); this.renderMascotEverywhere(); }
    if (what === 'sync') this.renderSync();
    this.renderTreats();
  }
  renderTreats() {
    for (const el of $$('.treats-count')) {
      const v = this.store.treats;
      if (el.textContent !== String(v)) { el.textContent = v; el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); }
    }
    for (const el of $$('.streak-count')) el.textContent = this.currentStreak();
  }
  currentStreak() {
    const st = this.profile.streak; const t = todayKey();
    if (st.last === t || nextDayKey(st.last || '1970-01-01') === t) return st.count || 0;
    return 0;
  }

  // ---------------------------------------------------------------- navigation

  bindGlobal() {
    window.addEventListener('popstate', e => this.route(e.state || { s: 'home' }, true));
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-go]');
      if (a) { e.preventDefault(); sfx.tap(); this.go(a.dataset.go, a.dataset.arg ? JSON.parse(a.dataset.arg) : undefined); }
      const b = e.target.closest('[data-back]');
      if (b) { e.preventDefault(); sfx.tap(); this.back(); }
    });
    document.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('pointerdown', () => { if (this.kb) { this.kb = false; document.body.classList.remove('kb'); } }, { capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.game?.pause(); this.saveGame(); this.store.flush(); } else this.game?.resume(); });
    window.addEventListener('pagehide', () => { this.saveGame(); this.store.flush(); });
    window.addEventListener('resize', () => this.layoutBoard());
  }
  go(screen, arg) {
    const state = { s: screen, a: arg };
    history.pushState(state, '', '#' + screen);
    this.route(state, false);
  }
  back() { if (this.dialogStack.length) { this.closeDialog(); return; } if (history.length > 1 && history.state && history.state.s !== 'home') history.back(); else this.go('home'); }
  /** Android wrapper asks the page first on the Back key: true = handled here (a dialog closed) */
  handleBack() {
    const top = this.dialogStack[this.dialogStack.length - 1];
    if (!top) return false;
    if (top.dataset.modal) return true; // win/fail cards stay until a button is pressed
    this.closeDialog(top);
    return true;
  }
  route(state, fromHistory) {
    if (this.dialogStack.length) this.closeAllDialogs();
    const s = state.s || 'home';
    if (this.current === 'game' && s !== 'game') { this.game?.pause(); this.saveGame(); }
    this.current = s;
    for (const el of this.screens) el.classList.toggle('active', el.id === 's-' + s);
    this.render(s, state.a);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => this.focusFirst());
  }
  render(s, arg) {
    switch (s) {
      case 'home': this.renderHome(); break;
      case 'walks': this.renderWalks(arg); break;
      case 'game': this.renderGameScreen(arg); break;
      case 'daily': this.renderDaily(arg); break;
      case 'free': this.renderFree(); break;
      case 'collection': this.renderCollection(); break;
      case 'trophies': this.renderTrophies(); break;
      case 'settings': this.renderSettings(); break;
      case 'help': this.renderHelp(); break;
      case 'event': this.renderEvent(); break;
    }
  }

  // ---------------------------------------------------------------- keyboard / D-pad

  onKey(e) {
    const k = e.key;
    const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (nav || k === 'Enter' || k === ' ' || k === 'Escape' || k === 'Backspace' || k === 'GoBack') {
      if (!this.kb) { this.kb = true; document.body.classList.add('kb'); }
    }
    const inInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (k === 'Escape' || k === 'GoBack' || (k === 'Backspace' && !inInput)) { e.preventDefault(); this.back(); return; }
    if (inInput) return;
    const game = this.current === 'game' && this.game;
    const onBoard = game && document.activeElement && document.activeElement.classList.contains('cell');
    if (nav) {
      e.preventDefault();
      if (onBoard && game.moveCursor(nav[0], nav[1])) return;
      if (onBoard) { if (!this.spatialMove(nav, document.activeElement)) return; return; }
      const from = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      if (!from) { this.focusFirst(); return; }
      this.spatialMove(nav, from);
      return;
    }
    if (game && onBoard) {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); game.act('cycle'); return; }
      if (k === 'x' || k === 'X') { game.act('mark'); return; }
      if (k === 'p' || k === 'P') { game.act('pup'); return; }
      if (k === 'Delete') { game.act('clear'); return; }
    }
    if (game) {
      if ((k === 'u' || k === 'U' || (k === 'z' && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); game.undo(); this.updateHud(); return; }
      if (k === 'h' || k === 'H') { this.sniff(); return; }
    }
  }
  /** move focus geometrically among focusable elements of the active layer */
  spatialMove([dr, dc], from) {
    const layer = this.dialogStack.length ? this.dialogStack[this.dialogStack.length - 1] : $('.screen.active');
    const cands = $$('button, [tabindex="0"], input, select, a[href], .cell', layer).filter(el => el !== from && !el.disabled && el.offsetParent !== null && !el.closest('.hidden'));
    const fr = from.getBoundingClientRect();
    const fx = fr.left + fr.width / 2, fy = fr.top + fr.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of cands) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // distance from the edge we leave to the nearest edge of the candidate, plus how far it sits off-axis
      let forward, side;
      if (dr) { forward = dr > 0 ? r.top - fr.bottom : fr.top - r.bottom; side = Math.max(0, r.left - fx, fx - r.right); }
      else { forward = dc > 0 ? r.left - fr.right : fr.left - r.right; side = Math.max(0, r.top - fy, fy - r.bottom); }
      if (forward < -8) continue;
      const score = Math.max(0, forward) + side * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) return false;
    if (best.classList.contains('cell') && this.game) { this.game.setCursor(Number(best.dataset.i)); }
    else best.focus();
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  focusFirst() {
    if (!this.kb) return;
    const layer = this.dialogStack.length ? this.dialogStack[this.dialogStack.length - 1] : $('.screen.active');
    const visible = el => el.offsetParent !== null && !el.disabled && !el.closest('.hidden');
    if (!this.dialogStack.length && this.current === 'game' && this.game && this.game.cellEls) {
      this.game.setCursor(this.game.cursor >= 0 ? this.game.cursor : Math.floor(this.game.N / 2));
      return;
    }
    const pref = $$('[autofocus], .primary', layer).find(visible) || $$('button, [tabindex="0"], input, .cell', layer).find(visible);
    if (pref) { if (pref.classList.contains('cell') && this.game) this.game.setCursor(Number(pref.dataset.i)); else pref.focus(); }
  }

  // ---------------------------------------------------------------- dialogs & toasts

  dialog({ title, html, buttons = [], cls = '', onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
      ${title ? `<h2>${title}</h2>` : ''}<div class="dialog-body">${html || ''}</div><div class="dialog-buttons"></div></div>`;
    const bb = $('.dialog-buttons', wrap);
    buttons.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.primary ? 'primary' : '') + ' ' + (b.cls || '');
      btn.innerHTML = b.label;
      if (b.primary) btn.setAttribute('autofocus', '');
      btn.addEventListener('click', () => { sfx.tap(); if (b.keep !== true) this.closeDialog(wrap); b.action && b.action(); });
      bb.appendChild(btn);
    });
    if (!buttons.length) bb.remove();
    wrap.addEventListener('click', e => { if (e.target === wrap && !wrap.dataset.modal) this.closeDialog(wrap); });
    wrap._onClose = onClose;
    $('#overlay').appendChild(wrap);
    this.dialogStack.push(wrap);
    document.body.classList.add('has-dialog');
    requestAnimationFrame(() => { wrap.classList.add('open'); this.focusFirst(); });
    return wrap;
  }
  closeDialog(wrap) {
    wrap = wrap || this.dialogStack[this.dialogStack.length - 1];
    if (!wrap) return;
    this.dialogStack = this.dialogStack.filter(w => w !== wrap);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    if (!this.dialogStack.length) document.body.classList.remove('has-dialog');
    wrap._onClose && wrap._onClose();
    this.focusFirst();
  }
  closeAllDialogs() { for (const w of [...this.dialogStack]) this.closeDialog(w); }
  toast(msg, ms = 2200) {
    const t = $('#toast');
    const item = document.createElement('div'); item.className = 'toast-item'; item.innerHTML = msg;
    t.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => { item.classList.remove('show'); setTimeout(() => item.remove(), 300); }, ms);
  }
  confetti(kind = 'party', count = 40) {
    if (this.profile.settings.reduceMotion) return;
    const fx = $('#fx');
    const glyphs = kind === 'party' ? ['🐾', '🦴', '💛', '🧡', '✨', '🐾'] : kind === 'treat' ? ['🦴'] : ['💔'];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'confetti'; s.textContent = glyphs[i % glyphs.length];
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      s.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      s.style.animationDelay = (Math.random() * 600) + 'ms';
      s.style.animationDuration = (1800 + Math.random() * 1400) + 'ms';
      s.style.fontSize = (14 + Math.random() * 18) + 'px';
      fx.appendChild(s);
      setTimeout(() => s.remove(), 3600);
    }
  }
  zoomies() {
    if (this.profile.settings.reduceMotion) return;
    const fx = $('#fx');
    const z = document.createElement('div'); z.className = 'zoomies';
    z.innerHTML = pupSvg(this.selectedPup(), { body: true, mood: 'excited' });
    fx.appendChild(z);
    setTimeout(() => z.remove(), 2600);
  }

  // ---------------------------------------------------------------- mascot

  selectedPup() { return PUP_BY_ID[this.profile.selectedPup] || PUPS[0]; }
  renderMascotEverywhere() {
    for (const el of $$('.mascot-slot')) el.innerHTML = pupSvg(this.selectedPup(), { body: true, mood: el.dataset.mood || 'happy' });
    for (const el of $$('.mascot-face')) el.innerHTML = pupSvg(this.selectedPup(), { mood: el.dataset.mood || 'happy' });
  }
  greet() {
    const p = this.selectedPup();
    const h = new Date().getHours();
    const lines = [
      `Woof! ${p.name} is ready for walkies.`, 'One pup per row, column and yard. No touching!', 'Stuck? Tap Sniff and I’ll explain the next move.',
      h < 11 ? 'Good morning! A puzzle with your coffee?' : h < 17 ? 'Afternoon! Fancy a quick board?' : 'Evening walkies? One more puzzle…',
      `Treats: ${this.store.treats}. Earn more by solving levels and dailies.`, 'Cross off squares first, place pups when you’re sure.',
      'Every board has exactly one solution — no guessing needed.', `${p.name} says: the smallest yard is usually the best place to start.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // ---------------------------------------------------------------- HOME

  async renderHome() {
    const p = this.profile;
    const next = this.nextLevelId();
    const walks = await getWalks();
    const walk = walks.find(w => next >= w.from && next <= w.to);
    $('#home-play').innerHTML = `<span class="big">Level ${next}</span><span class="small">${walk ? walk.name : 'Endless Walkies'}</span>`;
    $('#home-play').dataset.arg = JSON.stringify({ kind: 'level', id: next });
    const t = todayKey();
    const dailyDone = !!p.daily[t];
    $('#home-daily').innerHTML = `<span class="ico">📅</span><span class="lbl">Daily</span><span class="sub">${dailyDone ? 'Done ✓' : 'New puzzle'}</span>`;
    $('#home-greet').textContent = this.greet();
    const ev = activeEvent();
    const evEl = $('#home-event');
    if (ev) {
      const key = eventKey(ev); const prog = p.events[key]?.done || 0;
      evEl.classList.remove('hidden');
      evEl.innerHTML = `<span class="ev-emoji">${ev.emoji}</span><span class="ev-text"><b>${ev.name}</b><br><small>${prog}/${ev.sizes.length} solved · adopt ${PUP_BY_ID[ev.pup].name}</small></span><span class="ev-pup">${pupSvg(PUP_BY_ID[ev.pup])}</span>`;
      evEl.className = 'event-card theme-' + ev.theme;
    } else evEl.classList.add('hidden');
    this.renderDailyTricks($('#home-tricks'));
    this.renderTreats();
    this.renderSync();
  }
  nextLevelId() {
    let L = 1;
    while (this.profile.levels['L' + L]) L++;
    return L;
  }

  // ---------------------------------------------------------------- WALKS (level map)

  async renderWalks(arg) {
    const walks = await getWalks();
    const total = await levelCount();
    const p = this.profile;
    const openWalk = arg?.walk || walks.find(w => !this.walkDone(w)) ?.id || 7;
    const list = $('#walk-list');
    list.innerHTML = '';
    for (const w of walks) {
      const done = this.countDone(w.from, w.to), count = w.to - w.from + 1, stars = this.countStars(w.from, w.to);
      const unlocked = w.from === 1 || !!p.levels['L' + (w.from - 1)];
      const card = document.createElement('div');
      card.className = 'walk-card' + (openWalk === w.id ? ' open' : '') + (unlocked ? '' : ' locked');
      card.style.background = WALKS_META[w.id]?.sky || '';
      card.innerHTML = `<button class="walk-head" aria-expanded="${openWalk === w.id}">
          <span class="walk-emoji">${WALKS_META[w.id]?.emoji || '🐾'}</span>
          <span class="walk-title"><b>${w.name}</b><small>Levels ${w.from}–${w.to} · ${done}/${count} done · ★ ${stars}/${count * 3}</small></span>
          <span class="walk-prog"><i style="width:${(done / count * 100).toFixed(0)}%"></i></span>
          <span class="chev">${unlocked ? '▾' : '🔒'}</span></button>
        <div class="level-grid"></div>`;
      const grid = $('.level-grid', card);
      if (openWalk === w.id && unlocked) this.fillLevelGrid(grid, w.from, w.to);
      $('.walk-head', card).addEventListener('click', () => {
        if (!unlocked) { this.toast('Finish the previous walk first 🐾'); return; }
        sfx.tap();
        const wasOpen = card.classList.contains('open');
        for (const c of $$('.walk-card', list)) { c.classList.remove('open'); $('.walk-head', c).setAttribute('aria-expanded', 'false'); }
        if (!wasOpen) { card.classList.add('open'); $('.walk-head', card).setAttribute('aria-expanded', 'true'); if (!grid.children.length) this.fillLevelGrid(grid, w.from, w.to); }
      });
      list.appendChild(card);
    }
    // endless
    const endlessUnlocked = !!p.levels['L' + total];
    const card = document.createElement('div');
    card.className = 'walk-card endless' + (endlessUnlocked ? ' open' : ' locked');
    const endlessDone = Object.keys(p.levels).filter(k => Number(k.slice(1)) > total).length;
    card.innerHTML = `<button class="walk-head"><span class="walk-emoji">♾️</span><span class="walk-title"><b>Endless Walkies</b><small>${endlessUnlocked ? `New boards forever · ${endlessDone} done` : 'Finish City Lights to unlock'}</small></span><span class="chev">${endlessUnlocked ? '' : '🔒'}</span></button>
      <div class="level-grid"></div>`;
    if (endlessUnlocked) {
      const grid = $('.level-grid', card);
      const nextE = Math.max(total + 1, this.nextLevelId());
      this.fillLevelGrid(grid, total + 1, Math.max(nextE, total + 1) + 9, true);
    } else $('.walk-head', card).addEventListener('click', () => this.toast('Finish City Lights first 🐾'));
    list.appendChild(card);
  }
  walkDone(w) { for (let L = w.from; L <= w.to; L++) if (!this.profile.levels['L' + L]) return false; return true; }
  countDone(a, b) { let k = 0; for (let L = a; L <= b; L++) if (this.profile.levels['L' + L]) k++; return k; }
  countStars(a, b) { let k = 0; for (let L = a; L <= b; L++) k += this.profile.levels['L' + L]?.stars || 0; return k; }
  async fillLevelGrid(grid, from, to, endless = false) {
    const p = this.profile;
    const data = await loadLevels();
    grid.innerHTML = '';
    for (let L = from; L <= to; L++) {
      const rec = p.levels['L' + L];
      const unlocked = L === 1 || !!p.levels['L' + (L - 1)];
      const meta = data.levels.find(x => x.id === L);
      const walk = data.walks.find(w => w.to === L);
      const b = document.createElement('button');
      b.className = 'level-tile' + (rec ? ' done' : '') + (unlocked ? '' : ' locked') + (walk ? ' boss' : '') + (L === this.nextLevelId() ? ' next' : '');
      b.style.animationDelay = ((L - from) * 25) + 'ms';
      b.innerHTML = `<span class="lt-num">${L}</span>${meta ? `<span class="lt-size">${meta.n}×${meta.n}</span>` : endless ? '<span class="lt-size">∞</span>' : ''}${rec ? starsHtml(rec.stars) : unlocked ? `<span class="lt-rank" title="${meta ? rankName(meta.rank) : ''}">${meta ? '🐾'.repeat(meta.rank) : ''}</span>` : '<span class="lt-lock">🔒</span>'}${walk ? '<span class="lt-boss">🏆</span>' : ''}`;
      b.addEventListener('click', () => { if (!unlocked) { this.toast('Solve the previous level first 🐾'); return; } sfx.tap(); this.go('game', { kind: 'level', id: L }); });
      grid.appendChild(b);
    }
  }

  // ---------------------------------------------------------------- DAILY

  async renderDaily(arg) {
    const p = this.profile;
    const now = new Date();
    const view = arg?.month ? new Date(arg.month + '-01T12:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
    const t = todayKey();
    $('#daily-streak').innerHTML = `<b>${this.currentStreak()}</b> day streak · best ${p.streak.best || 0}`;
    const info = await getDaily(t).catch(() => null);
    const done = p.daily[t];
    $('#daily-today').innerHTML = `<div class="daily-hero">
        <div class="mascot-face" data-mood="${done ? 'excited' : 'happy'}">${pupSvg(this.selectedPup(), { mood: done ? 'excited' : 'happy' })}</div>
        <div><b>${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</b>
        <div class="muted">${info ? `${info.n}×${info.n} · ${rankName(info.rank)} ${paws(info.rank)}` : 'Loading…'}</div>
        ${done ? `<div class="muted">Solved in ${fmtTime(done.time)} ${starsHtml(done.stars)}</div>` : '<div class="muted">Everyone gets the same board today.</div>'}</div>
      </div>
      <button class="btn primary wide" id="daily-play" autofocus>${done ? 'Play again' : 'Play today’s puzzle'}</button>`;
    $('#daily-play').addEventListener('click', () => { sfx.tap(); this.go('game', { kind: 'daily', date: t }); });
    // calendar
    const cal = $('#daily-cal');
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    let html = `<div class="cal-head"><button class="btn small" data-cal="prev">‹</button><b>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button class="btn small" data-cal="next">›</button></div><div class="cal-grid">`;
    for (const d of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) html += `<span class="cal-dow">${d}</span>`;
    for (let i = 0; i < first.getDay(); i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const key = `${monthKey}-${String(d).padStart(2, '0')}`;
      const rec = p.daily[key];
      const future = key > t;
      html += `<button class="cal-day ${rec ? 'done' : ''} ${key === t ? 'today' : ''}" ${future ? 'disabled' : ''} data-date="${key}">${rec ? '🐾' : d}</button>`;
    }
    html += '</div><p class="muted small">Tap any past day to play its board. Only today counts for your streak.</p>';
    cal.innerHTML = html;
    $$('[data-cal]', cal).forEach(b => b.addEventListener('click', () => {
      const nm = new Date(y, m + (b.dataset.cal === 'next' ? 1 : -1), 1);
      this.renderDaily({ month: `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}` });
    }));
    $$('.cal-day', cal).forEach(b => b.addEventListener('click', () => { if (b.disabled) return; sfx.tap(); this.go('game', { kind: 'daily', date: b.dataset.date }); }));
    this.renderDailyTricks($('#daily-tricks'));
  }

  // ---------------------------------------------------------------- daily tricks (3 goals a day)

  rollDailyTricks() {
    const t = todayKey();
    const dt = this.profile.dailyTricks;
    if (dt.date === t && dt.ids) return;
    // pick 3 by date
    let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ids = [];
    const pool = DAILY_TRICKS.map(x => x.id);
    while (ids.length < 3) { const i = h % pool.length; h = (h * 1103515245 + 12345) >>> 0; const id = pool.splice(i, 1)[0]; if (!(id === 'three' && ids.includes('solve2')) && !(id === 'solve2' && ids.includes('three'))) ids.push(id); }
    this.profile.dailyTricks = { date: t, ids, progress: {}, claimed: {} };
    this.store.commit('tricks');
  }
  renderDailyTricks(el) {
    if (!el) return;
    this.rollDailyTricks();
    const dt = this.profile.dailyTricks;
    el.innerHTML = `<h3>Today’s tricks</h3>` + dt.ids.map(id => {
      const d = DAILY_TRICKS.find(x => x.id === id); const prog = Math.min(d.goal, dt.progress[id] || 0); const done = !!dt.claimed[id];
      return `<div class="trick ${done ? 'done' : ''}"><span class="trick-ico">${done ? '✅' : '🎯'}</span><span class="trick-text"><b>${d.name}</b><small>${d.text}</small></span><span class="trick-prog"><i style="width:${(prog / d.goal * 100).toFixed(0)}%"></i></span><span class="trick-reward">🦴 ${d.treats}</span></div>`;
    }).join('');
  }
  bumpDailyTricks(ev) {
    this.rollDailyTricks();
    const dt = this.profile.dailyTricks;
    let earned = 0; const names = [];
    for (const id of dt.ids) {
      if (dt.claimed[id]) continue;
      const d = DAILY_TRICKS.find(x => x.id === id);
      const add = d.on(ev); if (!add) continue;
      dt.progress[id] = (dt.progress[id] || 0) + add;
      if (dt.progress[id] >= d.goal) { dt.claimed[id] = true; earned += d.treats; names.push(d.name); }
    }
    if (earned) { this.store.earn(earned, 'trick'); this.rewardQueue.push({ type: 'trick', names, treats: earned }); }
    this.store.commit('tricks');
  }

  // ---------------------------------------------------------------- FREE PLAY

  renderFree() {
    const el = $('#free-form');
    const sizes = [5, 6, 7, 8, 9, 10, 11, 12];
    const sel = this.freeSel || (this.freeSel = { n: 7, rank: 2 });
    el.innerHTML = `<h3>Board size</h3><div class="chips" id="free-sizes">${sizes.map(n => `<button class="chip ${sel.n === n ? 'on' : ''}" data-n="${n}">${n}×${n}</button>`).join('')}</div>
      <h3>Difficulty</h3><div class="chips" id="free-ranks">${RANKS.map(r => `<button class="chip ${sel.rank === r.id ? 'on' : ''}" data-rank="${r.id}">${'🐾'.repeat(r.id)} ${r.name}</button>`).join('')}</div>
      <p class="muted small">Puzzles are ranked by the ideas needed to solve them, from Puppy (only-one-spot deductions) to Legend (what-if chains). Bigger boards take longer; the rank says how tricky.</p>
      <button class="btn primary wide" id="free-go" autofocus>🐾 Fetch a puzzle</button>
      <div class="muted small" id="free-stats"></div>`;
    $$('#free-sizes .chip').forEach(b => b.addEventListener('click', () => { sel.n = Number(b.dataset.n); sfx.tap(); this.renderFree(); }));
    $$('#free-ranks .chip').forEach(b => b.addEventListener('click', () => { sel.rank = Number(b.dataset.rank); sfx.tap(); this.renderFree(); }));
    $('#free-go').addEventListener('click', () => { sfx.tap(); this.go('game', { kind: 'free', n: sel.n, rank: sel.rank }); });
    const bt = this.profile.stats.bestTime[sel.n];
    $('#free-stats').textContent = bt ? `Your best ${sel.n}×${sel.n} time: ${fmtTime(bt)}` : '';
  }

  // ---------------------------------------------------------------- COLLECTION

  renderCollection() {
    const p = this.profile;
    const grid = $('#pup-grid');
    grid.innerHTML = '';
    const owned = Object.keys(p.pups).length;
    $('#collection-count').textContent = `${owned} / ${PUPS.length} pups adopted`;
    PUPS.forEach((pup, i) => {
      const have = !!p.pups[pup.id];
      const card = document.createElement('button');
      card.className = 'pup-card' + (have ? '' : ' locked') + (p.selectedPup === pup.id ? ' selected' : '');
      card.style.animationDelay = (i * 35) + 'ms';
      const ev = pup.unlock.type === 'event' ? EVENTS.find(e => e.id === pup.unlock.value) : null;
      card.innerHTML = `<div class="pup-art">${have ? pupSvg(pup) : lockedPupSvg()}</div><b>${have ? pup.name : '???'}</b><small>${have ? pup.breed : (ev ? `${ev.emoji} ${ev.name} event` : pup.unlock.text)}</small>${p.selectedPup === pup.id ? '<span class="sel-badge">Companion</span>' : ''}`;
      card.addEventListener('click', () => { sfx.tap(); this.showPup(pup, have); });
      grid.appendChild(card);
    });
  }
  showPup(pup, have) {
    const ev = pup.unlock.type === 'event' ? EVENTS.find(e => e.id === pup.unlock.value) : null;
    const isSel = this.profile.selectedPup === pup.id;
    this.dialog({
      title: have ? pup.name : 'Not adopted yet',
      cls: 'pup-dialog',
      html: `<div class="pup-show">${have ? pupSvg(pup, { body: true, mood: 'excited' }) : lockedPupSvg()}</div>
        <p class="center"><b>${have ? pup.breed : '???'}</b></p>
        <p class="center">${have ? pup.blurb : (ev ? `${ev.emoji} Adopt ${pup.name} during the <b>${ev.name}</b> event (${ev.from[0]}/${ev.from[1]} – ${ev.to[0]}/${ev.to[1]} every year).` : `How to adopt: ${pup.unlock.text}.`)}</p>`,
      buttons: have ? [{ label: isSel ? 'Already your companion' : 'Make my companion', primary: !isSel, action: () => { if (!isSel) { this.profile.selectedPup = pup.id; this.store.commit('pup'); this.renderMascotEverywhere(); this.renderCollection(); sfx.bark(); this.toast(`${pup.name} is your companion now! 🐾`); } } }, { label: 'Close' }] : [{ label: 'OK', primary: true }],
    });
  }

  // ---------------------------------------------------------------- TROPHIES / STATS

  renderTrophies() {
    const p = this.profile;
    const list = $('#trick-list');
    list.innerHTML = TRICKS.map(t => {
      const done = !!p.tricks[t.id]; const [a, b] = t.progress(p);
      return `<div class="trick ${done ? 'done' : ''}"><span class="trick-ico">${done ? '🏆' : '🎯'}</span><span class="trick-text"><b>${t.name}</b><small>${t.text}</small></span><span class="trick-prog"><i style="width:${Math.min(100, a / b * 100).toFixed(0)}%"></i></span><span class="trick-reward">${done ? '✓' : '🦴 ' + t.treats}</span></div>`;
    }).join('');
    const s = p.stats;
    const best = Object.entries(s.bestTime).sort((x, y) => Number(x[0]) - Number(y[0])).map(([n, ms]) => `<span class="stat"><b>${fmtTime(ms)}</b><small>${n}×${n} best</small></span>`).join('');
    $('#stats').innerHTML = `<div class="stat-grid">
      <span class="stat"><b>${s.solved}</b><small>puzzles solved</small></span>
      <span class="stat"><b>${s.perfect}</b><small>3-star solves</small></span>
      <span class="stat"><b>${Object.keys(p.daily).length}</b><small>dailies</small></span>
      <span class="stat"><b>${p.streak.best || 0}</b><small>best streak</small></span>
      <span class="stat"><b>${s.marks}</b><small>squares crossed</small></span>
      <span class="stat"><b>${s.hintsUsed}</b><small>sniffs used</small></span>
      <span class="stat"><b>${s.mistakes}</b><small>hearts lost</small></span>
      <span class="stat"><b>${fmtTime(s.timePlayed)}</b><small>time played</small></span>
      ${best}</div>`;
  }

  // ---------------------------------------------------------------- SETTINGS

  renderSettings() {
    const s = this.profile.settings;
    const el = $('#settings-form');
    const toggle = (id, label, sub) => `<label class="row-toggle"><span><b>${label}</b><small>${sub}</small></span><input type="checkbox" id="set-${id}" ${s[id] ? 'checked' : ''}><i class="switch"></i></label>`;
    el.innerHTML = `
      ${toggle('sound', 'Sound', 'Barks, pops and jingles')}
      ${toggle('haptics', 'Vibration', 'A little buzz on taps and mistakes')}
      ${toggle('autoMark', 'Auto-cross blocked squares', 'When a pup sits down, cross off everything it blocks')}
      ${toggle('showCoords', 'Show coordinates', 'Column,row in each square (handy with hints)')}
      ${toggle('bigText', 'Bigger text', 'For tablets and TVs across the room')}
      ${toggle('reduceMotion', 'Reduce motion', 'Fewer bouncy animations')}
      <h3>“No pup here” mark</h3>
      <div class="chips mark-chips">${[['bones', 'Crossed bones'], ['x', 'Classic ✕'], ['paw', 'No-paw sign']].map(([id, label]) => `<button class="chip ${(s.markStyle || 'bones') === id ? 'on' : ''}" data-mark="${id}"><span class="chip-mark">${MARK_STYLES[id]}</span>${label}</button>`).join('')}</div>
      <h3>Sync across devices</h3>
      <div class="sync-box"><div id="sync-status" class="muted"></div>
        <div class="row-buttons"><button class="btn" id="sync-link">Link another device</button><button class="btn" id="sync-enter">Enter a code</button></div>
        <p class="muted small">Your progress saves on this device and, when online, to the cloud. Link a phone, tablet or TV with a 6-letter code to share one kennel.</p></div>
      <h3>App</h3>
      <div class="row-buttons"><button class="btn hidden" id="install-btn">Install app</button><a class="btn" href="apk/" target="_blank" rel="noopener">Android APK</a><button class="btn" data-go="help">How to play</button></div>
      <h3>Danger zone</h3>
      <div class="row-buttons"><button class="btn danger" id="reset-btn">Reset progress on this device</button></div>
      <p class="muted small center">Pupdoku v1 · made with 🐾 · a puppy take on the "one per row, column and region" puzzle.</p>`;
    for (const id of ['sound', 'haptics', 'autoMark', 'showCoords', 'bigText', 'reduceMotion']) {
      $('#set-' + id).addEventListener('change', e => { this.profile.settings[id] = e.target.checked; this.store.commit('settings'); this.applySettings(); if (id === 'sound' && e.target.checked) sfx.bark(); if (this.game) { this.game.settings = this.profile.settings; this.game.el?.classList.toggle('coords', !!this.profile.settings.showCoords); } });
    }
    $$('.mark-chips .chip').forEach(b => b.addEventListener('click', () => { this.profile.settings.markStyle = b.dataset.mark; this.store.commit('settings'); sfx.tap(); if (this.game) this.game.setMarkStyle(b.dataset.mark); this.renderSettings(); }));
    $('#sync-link').addEventListener('click', () => this.linkDevice());
    $('#sync-enter').addEventListener('click', () => this.enterCode());
    $('#install-btn').addEventListener('click', async () => { if (!this.deferredInstall) return; this.deferredInstall.prompt(); await this.deferredInstall.userChoice; this.deferredInstall = null; $('#install-btn').classList.add('hidden'); });
    if (this.deferredInstall) $('#install-btn').classList.remove('hidden');
    $('#reset-btn').addEventListener('click', () => this.dialog({ title: 'Reset progress?', html: '<p>This clears levels, pups, treats and streaks <b>on this device</b>. Progress linked to other devices is not touched.</p>', buttons: [{ label: 'Cancel' }, { label: 'Reset', cls: 'danger', action: () => { this.store.resetLocal(); this.toast('Fresh start 🐾'); this.go('home'); } }] }));
    this.renderSync();
  }
  renderSync() {
    const st = this.store.sync.state;
    for (const dot of $$('.sync-dot')) { dot.className = 'sync-dot ' + st; dot.title = 'Cloud sync: ' + st; }
    const el = $('#sync-status'); if (!el) return;
    const txt = { off: '⚪ Not connected', offline: '⚪ Offline — saving on this device', connecting: '🟡 Connecting…', on: '🟢 Synced to the cloud', reconnecting: '🟡 Reconnecting…', error: '🔴 Cloud sync unavailable right now — progress is still saved on this device.' }[st] || st;
    el.textContent = txt;
    el.title = this.store.sync.error || '';
  }
  async linkDevice() {
    if (this.store.sync.state !== 'on') { this.toast('Cloud sync is not connected right now'); return; }
    try {
      const code = await this.store.createLinkCode();
      this.dialog({ title: 'Link another device', html: `<p>On the other device open <b>Settings → Enter a code</b> and type:</p><div class="link-code">${code.split('').join(' ')}</div><p class="muted small">Valid for 10 minutes. Both devices will share the same progress from then on.</p>`, buttons: [{ label: 'Done', primary: true }] });
    } catch (e) { this.toast('Could not make a code: ' + e.message); }
  }
  enterCode() {
    if (this.store.sync.state !== 'on') { this.toast('Cloud sync is not connected right now'); return; }
    const w = this.dialog({ title: 'Enter a link code', html: `<p>Type the 6-letter code shown on your other device.</p><input class="code-input" id="code-input" maxlength="7" autocomplete="off" autocapitalize="characters" placeholder="ABC123" autofocus><div class="muted small" id="code-msg"></div>`,
      buttons: [{ label: 'Cancel' }, { label: 'Link', primary: true, keep: true, action: async () => {
        const inp = $('#code-input', w); const msg = $('#code-msg', w);
        msg.textContent = 'Linking…';
        try { const r = await this.store.redeemLinkCode(inp.value); this.closeDialog(w); this.toast(r === 'same' ? 'That is already this device’s kennel' : 'Linked! Progress merged 🐾'); this.renderMascotEverywhere(); this.render(this.current); }
        catch (e) { msg.textContent = e.message; }
      } }] });
    setTimeout(() => $('#code-input', w)?.focus(), 50);
  }

  // ---------------------------------------------------------------- HELP

  renderHelp() {
    const el = $('#help-body');
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const demo = (n, regions, pups, marks, cls = '') => {
      let html = `<div class="mini-board ${cls}" style="--n:${n}">`;
      const pal = ['#8be070', '#6fc9ff', '#ffe16e', '#ffb0c6', '#dde3f0', '#ffb169'];
      for (let i = 0; i < n * n; i++) {
        const r = (i / n) | 0, c = i % n, reg = regions[i];
        const b = (r === 0 || regions[i - n] !== reg ? ' bt' : '') + (c === 0 || regions[i - 1] !== reg ? ' bl' : '') + (r === n - 1 ? ' bb' : '') + (c === n - 1 ? ' br' : '');
        html += `<span class="mini-cell${b}" style="background:${pal[reg]}">${pups.includes(i) ? '🐶' : marks.includes(i) ? '✕' : ''}</span>`;
      }
      return html + '</div>';
    };
    el.innerHTML = `
      <div class="help-card"><h3>The three rules</h3>
        <ol><li>Every <b>row</b> gets exactly one pup.</li><li>Every <b>column</b> gets exactly one pup.</li><li>Every coloured <b>yard</b> gets exactly one pup.</li></ol>
        <p>And the one that bites: <b>pups never touch</b> — not even at the corners. Every pup needs a full ring of empty squares.</p>
        ${demo(5, [0,0,1,1,1, 0,0,1,2,1, 3,0,2,2,2, 3,3,3,4,4, 3,3,4,4,4], [1, 8, 10, 19, 22], [])}
        <p class="muted small">A finished 5×5: one pup per row, column and yard, nobody touching.</p></div>
      <div class="help-card"><h3>Controls</h3>
        <ul><li><b>Tap</b> an empty square to cross it off ✕ (a pup can’t go there).</li><li><b>Tap again</b> to seat a pup. Tap a pup to clear it. <b>Hold</b> an empty square to seat a pup straight away.</li>
        <li><b>Drag</b> across empty squares to cross off a bunch at once.</li><li><b>Remote / keyboard:</b> arrows move, OK/Enter cycles ✕ → 🐶 → empty. X crosses off, P seats a pup, U undoes, H sniffs.</li></ul></div>
      <div class="help-card"><h3>Hearts, Sniff & Fetch</h3>
        <ul><li>You have <b>3 hearts</b>. Seating a pup on a wrong square costs one. Lose all three and the board resets (or spend 🦴 ${COSTS.heart} treats for one more).</li>
        <li><b>Sniff 🐽</b> explains the next deduction and highlights the squares involved; tap again to apply it. The first ${FREE_HINTS} sniffs per puzzle are free, then 🦴 ${COSTS.hint} each.</li>
        <li><b>Fetch 🦴</b> reveals one correct pup for 🦴 ${COSTS.fetch}.</li><li>Using hints or losing hearts costs stars: ★★★ for a clean solve.</li></ul></div>
      <div class="help-card"><h3>Treats & prizes</h3>
        <ul><li>Solving levels, dailies and today’s tricks earns <b>🦴 treats</b>.</li><li>New <b>pups</b> join your kennel for finishing walks, streaks and special feats. Pick any adopted pup as your companion — they sit on the board with you.</li>
        <li><b>Seasonal events</b> bring limited-time pups: solve the event boards to adopt them.</li></ul></div>
      <div class="help-card"><h3>Ways to think</h3>
        <p><b>Only one spot.</b> A yard with a single open square? That’s the pup.</p>
        ${demo(4, [0,0,1,1, 0,2,2,1, 3,3,2,1, 3,3,3,1], [], [5, 6, 9, 10], 'small')}
        <p class="muted small">The mint yard (squares 2,2 · 3,2 · 3,3) is almost all crossed off — its pup must take the last open square.</p>
        <p><b>Yard lock.</b> If all of a yard’s open squares sit in one row, that row belongs to that yard: cross off the rest of the row.</p>
        <p><b>Line lock.</b> If a row’s open squares all belong to one yard, that yard’s pup lives in this row: cross off the yard’s squares in other rows.</p>
        <p><b>Too crowded.</b> If seating a pup somewhere would block every open square of another yard, it can’t go there.</p>
        <p><b>Paired yards.</b> Two yards squeezed into the same two rows take both rows between them.</p>
        <p><b>What if…</b> Pretend a pup sits on a square; if that forces some yard, row or column to run out of room, cross the square off.</p></div>`;
  }

  // ---------------------------------------------------------------- EVENT

  async renderEvent() {
    const ev = activeEvent();
    const el = $('#event-body');
    if (!ev) { el.innerHTML = '<p class="center muted">No event is running right now. Check back on holidays! 🐾</p>'; return; }
    const key = eventKey(ev); const rec = this.profile.events[key] || { done: 0 };
    const pup = PUP_BY_ID[ev.pup]; const have = !!this.profile.pups[pup.id];
    el.innerHTML = `<div class="event-hero theme-${ev.theme}"><div class="ev-big">${ev.emoji}</div><div><h2>${ev.name}</h2><p>${ev.text}</p></div><div class="ev-pup-big">${pupSvg(pup, { body: true, mood: have ? 'excited' : 'happy' })}</div></div>
      <div class="event-tiles">${ev.sizes.map((n, i) => `<button class="level-tile ${i < rec.done ? 'done' : ''} ${i > rec.done ? 'locked' : ''} ${i === rec.done ? 'next' : ''}" data-i="${i}"><span class="lt-num">${i + 1}</span><span class="lt-size">${n}×${n}</span>${i < rec.done ? '<span class="stars"><span class="star on">★</span></span>' : i > rec.done ? '<span class="lt-lock">🔒</span>' : '<span class="lt-rank">🐾🐾🐾</span>'}</button>`).join('')}</div>
      <p class="center muted">${rec.done >= ev.sizes.length ? (have ? `${pup.name} has joined your kennel! 🎉` : '') : `${rec.done}/${ev.sizes.length} solved · reward: adopt ${pup.name} + 🦴 ${REWARDS.eventDone}`}</p>`;
    $$('.event-tiles .level-tile', el).forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.i); if (i > rec.done) { this.toast('Solve the previous event puzzle first'); return; } sfx.tap(); this.go('game', { kind: 'event', id: ev.id, index: i }); }));
  }

  // ---------------------------------------------------------------- GAME

  async renderGameScreen(arg) {
    if (!arg) { this.go('home'); return; }
    const screen = $('#s-game');
    this.game = null; this.lastCell = 0;
    screen.classList.add('loading');
    $('#board').innerHTML = '';
    $('#game-title').textContent = 'Fetching…';
    $('#game-sub').textContent = '';
    this.hideHint();
    let info = null;
    try {
      if (arg.kind === 'level') info = arg.id <= await levelCount() ? await getLevel(arg.id) : await getEndlessLevel(arg.id);
      else if (arg.kind === 'daily') info = await getDaily(arg.date);
      else if (arg.kind === 'free') info = await getFreePuzzle(arg.n, arg.rank, this.freeSeen || (this.freeSeen = new Set()));
      else if (arg.kind === 'event') { const ev = EVENTS.find(e => e.id === arg.id); const year = Number(eventKey(ev).split('-')[1]); info = await getEventPuzzle(ev, year, arg.index); }
    } catch (e) { console.error(e); }
    screen.classList.remove('loading');
    if (!info) { this.toast('Could not fetch that puzzle 🐾'); this.go('home'); return; }
    if (info.bankId) this.freeSeen.add(info.bankId);
    if (this.current !== 'game') return; // navigated away while loading
    this.startGame(info, arg);
  }

  startGame(info, arg) {
    this.gameInfo = info; this.gameArg = arg;
    const resume = info.kind !== 'free' ? this.profile.progress[info.key] : null;
    const game = new Game(info, {
      pupSpec: this.selectedPup(), settings: this.profile.settings, resume,
      hooks: {
        onChange: () => this.updateHud(),
        onWin: (g, res) => this.onWin(g, res),
        onFail: (g) => this.onFail(g),
        onMistake: () => this.flashHearts(),
        onHint: (g, step, text) => step ? this.showHintBubble(step, text) : this.hideHint(),
        spend: (n, why) => this.trySpend(n, why),
      },
    });
    this.game = game;
    game.mount($('#board'), $('#board-frame'));
    $('#game-title').textContent = info.title;
    $('#game-sub').innerHTML = `${esc(info.subtitle || '')} · ${info.n}×${info.n} · <span title="${rankName(info.rank)}">${paws(info.rank)}</span>`;
    $('#game-sub').title = `${rankName(info.rank)} rank`;
    $('#game-rank').innerHTML = '';
    this.layoutBoard();
    this.updateHud();
    const mf = $('#hint-face'); mf.innerHTML = pupSvg(this.selectedPup(), { mood: 'think' });
    if (resume && !game.isFresh()) this.toast('Welcome back — your board was saved 🐾');
    if (game.failed) this.onFail(game);
    if (info.kind === 'level' && info.id === 1 && game.isFresh() && !this.profile.stats.solved) this.showTutorial();
    this.startTicker();
  }
  layoutBoard() {
    const wrap = $('#board-wrap'); const board = $('#board');
    if (!board || !this.game || this.current !== 'game') return;
    const r = wrap.getBoundingClientRect();
    const n = this.game.n;
    const size = Math.max(120, Math.min(r.width, r.height) - 8);
    // the picket fence takes 0.45 of a cell on each side, but never less than 16px or more than 30px
    let cell = size / (n + 0.9);
    if (cell * 0.45 > 30) cell = (size - 60) / n;
    else if (cell * 0.45 < 16) cell = (size - 32) / n;
    cell = Math.max(16, Math.floor(cell));
    if (cell !== this.lastCell) {
      this.lastCell = cell;
      board.style.setProperty('--cell', cell + 'px');
      this.game.drawTerrain();
    }
  }
  startTicker() {
    clearInterval(this.ticker);
    this.ticker = setInterval(() => { if (this.game && this.current === 'game') $('#game-time').textContent = fmtTime(this.game.time); }, 250);
  }
  updateHud() {
    const g = this.game; if (!g) return;
    const hearts = $('#hearts');
    hearts.innerHTML = [1, 2, 3].map(k => `<span class="heart ${k <= g.hearts ? 'on' : 'off'}">${k <= g.hearts ? '❤️' : '🤍'}</span>`).join('');
    $('#btn-undo').disabled = !g.history.length || g.done || g.failed;
    $('#btn-sniff').disabled = g.done || g.failed;
    $('#btn-fetch').disabled = g.done || g.failed;
    const left = g.hintsLeftFree();
    $('#sniff-cost').textContent = g.hint ? 'show me' : left > 0 ? `${left} free` : `🦴 ${COSTS.hint}`;
    $('#fetch-cost').textContent = `🦴 ${COSTS.fetch}`;
    this.renderTreats();
    this.saveGameSoon();
  }
  flashHearts() { const h = $('#hearts'); h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake'); $('#s-game').classList.add('shake'); setTimeout(() => $('#s-game').classList.remove('shake'), 500); this.updateHud(); }
  saveGameSoon() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveGame(), 800); }
  saveGame() {
    const g = this.game, info = this.gameInfo; if (!g || !info || info.kind === 'free') return;
    if (g.done || g.isFresh()) { if (this.profile.progress[info.key]) { delete this.profile.progress[info.key]; this.store.commit('progress'); } return; }
    const st = g.serialize();
    const prog = this.profile.progress;
    prog[info.key] = st;
    // keep the in-progress list short
    const keys = Object.keys(prog).sort((a, b) => (prog[b].savedAt || 0) - (prog[a].savedAt || 0));
    for (const k of keys.slice(6)) delete prog[k];
    this.store.commit('progress');
  }

  trySpend(n, why) {
    if (this.store.spend(n)) { this.toast(`🦴 −${n}`, 1200); return true; }
    this.dialog({ title: 'Not enough treats', html: `<p>You need 🦴 ${n} for that and have 🦴 ${this.store.treats}.</p><p class="muted">Earn treats by solving levels (🦴 ${REWARDS.level}, +${REWARDS.stars3} for three stars), the daily puzzle (🦴 ${REWARDS.daily}) and today’s tricks.</p>`, buttons: [{ label: 'OK', primary: true }] });
    return false;
  }
  sniff() {
    const g = this.game; if (!g) return;
    const r = g.requestHint();
    if (!r.ok && r.reason === 'solved') this.toast('All pups are home!');
    this.updateHud();
  }
  fetch() {
    const g = this.game; if (!g || g.done || g.failed) return;
    this.dialog({ title: 'Fetch a pup?', html: `<p>${this.selectedPup().name} will run and sit on one correct square for 🦴 ${COSTS.fetch}.</p><p class="muted small">Counts as a hint for your star rating.</p>`,
      buttons: [{ label: 'Not now' }, { label: `Fetch! 🦴 ${COSTS.fetch}`, primary: true, action: () => { if (this.trySpend(COSTS.fetch, 'fetch')) { g.fetchPup(); this.profile.stats.fetched++; this.store.commit('stats'); this.updateHud(); } } }] });
  }
  restart() {
    const g = this.game; if (!g) return;
    if (g.isFresh()) return;
    this.dialog({ title: 'Start over?', html: '<p>Clear the board and reset hearts. Your hints and mistakes are forgotten too.</p>', buttons: [{ label: 'Keep going' }, { label: 'Start over', primary: true, action: () => { g.restart(); this.updateHud(); sfx.swoosh(); } }] });
  }
  showHintBubble(step, text) {
    const b = $('#hint-bubble');
    b.classList.remove('hidden');
    $('#hint-title').textContent = text.title;
    $('#hint-text').textContent = text.text;
    const mech = step.tech && (step.tech.id === 'basic' || step.tech.id === 'mistake');
    $('#hint-apply').textContent = step.why.kind === 'badMark' ? 'Clear it' : step.place.length ? 'Seat the pup' : 'Cross them off';
    $('#hint-apply').classList.toggle('hidden', step.why.kind === 'stuck');
    const face = $('#hint-face svg'); if (face) face.dataset.mood = step.why.kind === 'badMark' ? 'sad' : mech ? 'happy' : 'think';
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    this.updateHud();
  }
  hideHint() { $('#hint-bubble')?.classList.add('hidden'); }

  showTutorial() {
    this.dialog({ title: 'Welcome to Pupdoku! 🐾', cls: 'tutorial',
      html: `<div class="tut"><div class="mascot-face">${pupSvg(this.selectedPup(), { mood: 'excited' })}</div>
        <p>Seat one pup in every <b>row</b>, every <b>column</b> and every coloured <b>yard</b>. Pups never touch — not even corners.</p>
        <p><b>Tap</b> a square to cross it off, <b>tap again</b> to seat a pup. One pup is already home to get you started.</p>
        <p>Stuck? <b>Sniff 🐽</b> explains the next move.</p></div>`,
      buttons: [{ label: 'Let’s go!', primary: true }] });
  }

  // ---------------------------------------------------------------- results

  onWin(g, res) {
    const info = this.gameInfo; const p = this.profile; const s = p.stats;
    const t = todayKey();
    sfx.win();
    this.confetti('party', 60);
    this.zoomies();
    if (this.profile.settings.haptics) haptic([30, 60, 30, 60, 80]);
    delete p.progress[info.key];
    // stats
    s.solved++; s.marks += g.marksMade; s.pupsPlaced += info.n; s.mistakes += res.mistakes; s.hintsUsed += res.hints; s.timePlayed += Math.round(res.time);
    if (res.stars === 3) s.perfect++;
    if (res.hints === 0) s.noHint++;
    s.byRank[info.rank] = (s.byRank[info.rank] || 0) + 1;
    s.bySize[info.n] = (s.bySize[info.n] || 0) + 1;
    if (!s.bestTime[info.n] || res.time < s.bestTime[info.n]) s.bestTime[info.n] = Math.round(res.time);
    if (info.n >= 7 && res.time < 60000) s.zoomies = (s.zoomies || 0) + 1;
    // rewards
    let treats = 0; const lines = [];
    if (info.kind === 'level') {
      const prev = p.levels[info.key];
      const first = !prev;
      p.levels[info.key] = { stars: Math.max(prev?.stars || 0, res.stars), best: Math.min(prev?.best || Infinity, Math.round(res.time)), plays: (prev?.plays || 0) + 1, at: Date.now() };
      if (first) { treats += info.id > 160 ? REWARDS.endless : REWARDS.level; lines.push(`Level complete 🦴 ${info.id > 160 ? REWARDS.endless : REWARDS.level}`); }
      if (res.stars === 3 && (!prev || prev.stars < 3)) { treats += REWARDS.stars3; lines.push(`Three stars 🦴 ${REWARDS.stars3}`); }
      if (first && info.boss) { treats += REWARDS.boss; lines.push(`${info.walk.name} finished 🦴 ${REWARDS.boss}`); }
      if (!first) lines.push('Already solved — thanks for the walk!');
    } else if (info.kind === 'daily') {
      const first = !p.daily[info.date];
      if (first || res.stars > (p.daily[info.date]?.stars || 0)) p.daily[info.date] = { stars: res.stars, time: Math.round(res.time), at: Date.now() };
      if (first) { treats += REWARDS.daily; lines.push(`Daily solved 🦴 ${REWARDS.daily}`); }
      if (info.date === t && first) {
        const st = p.streak;
        if (st.last === t) {} else if (nextDayKey(st.last || '1970-01-01') === t) st.count = (st.count || 0) + 1; else st.count = 1;
        st.last = t; st.best = Math.max(st.best || 0, st.count);
        lines.push(`🔥 ${st.count}-day streak`);
        if (STREAK_BONUS[st.count]) { treats += STREAK_BONUS[st.count]; lines.push(`Streak bonus 🦴 ${STREAK_BONUS[st.count]}`); }
      } else if (!first) lines.push('Replayed — no extra treats, but nice!');
    } else if (info.kind === 'event') {
      const ev = EVENTS.find(e => e.id === info.eventId); const key = `${ev.id}-${info.year}`;
      const rec = p.events[key] || { done: 0, claimed: false };
      if (info.index === rec.done) { rec.done++; treats += REWARDS.event; lines.push(`Event puzzle 🦴 ${REWARDS.event}`); }
      if (rec.done >= ev.sizes.length && !rec.claimed) { rec.claimed = true; treats += REWARDS.eventDone; lines.push(`${ev.name} complete 🦴 ${REWARDS.eventDone}`); if (!p.pups[ev.pup]) { p.pups[ev.pup] = Date.now(); this.rewardQueue.push({ type: 'pup', id: ev.pup }); } }
      p.events[key] = rec;
    } else {
      treats += 1; lines.push('Free play 🦴 1');
    }
    if (treats) p.treatsEarned += treats;
    this.store.commit('solve');
    this.bumpDailyTricks({ type: 'solve', kind: info.kind, n: info.n, hints: res.hints, mistakes: res.mistakes, stars: res.stars, marks: g.marksMade });
    this.checkUnlocks();
    // dialog
    const after = fn => () => this.drainRewards(fn); // pups and trophies earned are shown before moving on
    const next = info.kind === 'level' ? { label: 'Next level ▶', primary: true, action: after(() => this.go('game', { kind: 'level', id: info.id + 1 })) }
      : info.kind === 'daily' ? { label: 'Daily calendar', primary: true, action: after(() => this.go('daily')) }
      : info.kind === 'event' ? { label: 'Event', primary: true, action: after(() => this.go('event')) }
      : { label: 'Another one ▶', primary: true, action: after(() => this.go('game', this.gameArg)) };
    const w = this.dialog({ title: res.stars === 3 ? 'Purr-fect… er, paw-fect!' : res.stars === 2 ? 'Good dog!' : 'Solved!', cls: 'win',
      html: `<div class="win-pup">${pupSvg(this.selectedPup(), { body: true, mood: 'excited' })}</div>${starsHtml(res.stars, true)}
        <div class="win-stats"><span>⏱ ${fmtTime(res.time)}</span><span>❤️ ${g.hearts}/3</span><span>🐽 ${res.hints}</span></div>
        <ul class="win-lines">${lines.map(l => `<li>${l}</li>`).join('')}</ul>${treats ? `<div class="win-treats">+🦴 ${treats}</div>` : ''}`,
      buttons: [{ label: 'Menu', action: after(() => this.go('home')) }, { label: 'Replay', action: after(() => { g.restart(); this.updateHud(); }) }, next],
    });
    w.dataset.modal = '1';
  }
  onFail(g) {
    sfx.lose();
    const face = pupSvg(this.selectedPup(), { body: true, mood: 'sad' });
    const w = this.dialog({ title: 'Out of hearts', cls: 'fail',
      html: `<div class="win-pup">${face}</div><p class="center">Three wrong squares. No shame — every board has one logical answer, so cross off first and seat pups when you’re sure.</p>`,
      buttons: [{ label: 'Menu', action: () => this.go('home') },
        { label: `One more heart 🦴 ${COSTS.heart}`, keep: true, cls: this.store.treats < COSTS.heart ? 'dim' : '', action: () => {
          if (this.store.treats < COSTS.heart) { this.toast(`Not enough treats — you have 🦴 ${this.store.treats}`); return; }
          this.closeDialog(w); this.store.spend(COSTS.heart); g.revive(); this.updateHud(); sfx.treat(); this.toast(`🦴 −${COSTS.heart}`, 1200);
        } },
        { label: 'Try again', primary: true, action: () => { g.restart(); this.updateHud(); } }] });
    w.dataset.modal = '1';
  }

  /** pups and trophies earned by the latest results; dialogs are queued and shown after the win card */
  checkUnlocks() {
    const p = this.profile;
    for (const t of TRICKS) if (!p.tricks[t.id] && t.check(p)) { p.tricks[t.id] = Date.now(); p.treatsEarned += t.treats; this.rewardQueue.push({ type: 'trophy', trick: t }); }
    const walksDone = w => this.walkDoneById(w);
    for (const pup of PUPS) {
      if (p.pups[pup.id]) continue;
      const u = pup.unlock; let ok = false;
      if (u.type === 'level') ok = !!p.levels['L' + u.value];
      else if (u.type === 'walk') ok = walksDone(u.value);
      else if (u.type === 'stars3') ok = Object.values(p.levels).filter(l => l.stars === 3).length >= u.value;
      else if (u.type === 'streak') ok = (p.streak.best || 0) >= u.value;
      else if (u.type === 'nohint') ok = p.stats.noHint >= u.value;
      else if (u.type === 'levels') ok = p.stats.solved >= u.value;
      else if (u.type === 'rank') ok = (p.stats.byRank[4] || 0) + (p.stats.byRank[5] || 0) >= u.value;
      else if (u.type === 'speed') ok = (p.stats.zoomies || 0) >= 1;
      if (ok) { p.pups[pup.id] = Date.now(); this.rewardQueue.push({ type: 'pup', id: pup.id }); }
    }
    this.store.commit('unlocks');
  }
  walkDoneById(id) { const data = this.levelsCache; if (!data) return false; const w = data.walks.find(x => x.id === id); return w ? this.walkDone(w) : false; }
  /** show queued reward dialogs one after another, then run `then` */
  drainRewards(then) {
    const r = this.rewardQueue.shift();
    if (!r) { then && then(); return; }
    const next = () => this.drainRewards(then);
    if (r.type === 'pup') {
      const pup = PUP_BY_ID[r.id]; sfx.unlock(); this.confetti('party', 30);
      this.dialog({ title: 'New pup adopted!', cls: 'pup-dialog unlock', html: `<div class="pup-show reveal">${pupSvg(pup, { body: true, mood: 'excited' })}</div><p class="center"><b>${pup.name}</b> the ${pup.breed}</p><p class="center">${pup.blurb}</p>`,
        buttons: [{ label: 'Make my companion', primary: true, action: () => { this.profile.selectedPup = pup.id; this.store.commit('pup'); this.renderMascotEverywhere(); sfx.bark(); next(); } }, { label: 'Keep current', action: next }] });
    } else if (r.type === 'trophy') {
      sfx.treat();
      this.dialog({ title: '🏆 Trick learned!', html: `<p class="center"><b>${r.trick.name}</b><br>${r.trick.text}</p><div class="win-treats">+🦴 ${r.trick.treats}</div>`, buttons: [{ label: 'Nice!', primary: true, action: next }] });
    } else if (r.type === 'trick') {
      sfx.treat();
      this.toast(`🎯 ${r.names.join(' & ')} done! +🦴 ${r.treats}`, 3000);
      next();
    }
  }

  // ---------------------------------------------------------------- PWA

  registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  }
}

// ---------------------------------------------------------------- boot

const app = new App();
window.pupdoku = app;
loadLevels().then(d => { app.levelsCache = d; }).catch(() => {});
app.init();

// game toolbar
$('#btn-undo').addEventListener('click', () => { sfx.tap(); app.game?.undo(); app.updateHud(); });
$('#btn-sniff').addEventListener('click', () => app.sniff());
$('#btn-fetch').addEventListener('click', () => { sfx.tap(); app.fetch(); });
$('#btn-restart').addEventListener('click', () => { sfx.tap(); app.restart(); });
$('#hint-apply').addEventListener('click', () => { sfx.tap(); app.game?.applyHint(); app.updateHud(); });
$('#hint-close').addEventListener('click', () => { sfx.tap(); app.game?.clearHint(true); app.updateHud(); });
$('#home-mascot').addEventListener('click', () => { sfx.bark(); const m = $('#home-mascot svg'); if (m) { m.classList.remove('wiggle'); void m.offsetWidth; m.classList.add('wiggle'); } $('#home-greet').textContent = app.greet(); });

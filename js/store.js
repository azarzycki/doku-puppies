/*
 * Player profile: localStorage first (the game is fully playable offline), mirrored to a
 * Firebase Realtime Database path so progress survives reinstalls and can be shared between a
 * phone, a tablet and a TV through a short link code.
 *
 * Firebase layout (rules in database.rules.json):
 *   dokupuppies/profiles/<key>   the whole profile, key = 128-bit random hex (unguessable)
 *   dokupuppies/links/<CODE>     { key, exp }  six-character pairing codes, valid for ten minutes
 */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA-SnfxmXkksrwPJZJY8-GTFLQGLmGkc10",
  authDomain: "to-trivia.firebaseapp.com",
  databaseURL: "https://to-trivia-default-rtdb.firebaseio.com",
  projectId: "to-trivia",
  storageBucket: "to-trivia.firebasestorage.app",
  messagingSenderId: "80104918216",
  appId: "1:80104918216:web:dc89dd9e9118139f3b29fd",
};
export const RECAPTCHA_SITE_KEY = ""; // App Check: reCAPTCHA Enterprise key ID; empty = App Check off
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js',
];

const LS_PROFILE = 'dokupuppies.profile.v1';
const LS_KEY = 'dokupuppies.key';
export const START_TREATS = 10;

export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  (crypto.getRandomValues ? crypto : null)?.getRandomValues(a);
  if (!crypto.getRandomValues) for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

export function blankProfile() {
  const now = Date.now();
  return {
    v: 1, createdAt: now, updatedAt: now,
    treatsEarned: START_TREATS, treatsSpent: 0,
    selectedPup: 'biscuit',
    pups: { biscuit: now },
    levels: {}, daily: {}, streak: { count: 0, last: '', best: 0 },
    events: {}, tricks: {}, dailyTricks: { date: '', progress: {}, claimed: {} },
    stats: { solved: 0, marks: 0, pupsPlaced: 0, mistakes: 0, hintsUsed: 0, perfect: 0, noHint: 0, byRank: {}, bySize: {}, bestTime: {}, timePlayed: 0, fetched: 0, zoomies: 0 },
    settings: { sound: true, haptics: true, autoMark: false, reduceMotion: false, bigText: false, showCoords: false },
    progress: {},
  };
}

function maxNum(a, b) { return Math.max(Number(a) || 0, Number(b) || 0); }
function minPos(a, b) { const x = Number(a) || 0, y = Number(b) || 0; return x && y ? Math.min(x, y) : (x || y); }

/** Fill in anything a stored profile is missing (older versions, partial remote records). */
export function normalizeProfile(p) {
  const b = blankProfile();
  if (!p || typeof p !== 'object') return b;
  const out = { ...b, ...p };
  for (const k of ['pups', 'levels', 'daily', 'events', 'tricks', 'progress']) out[k] = { ...(p[k] || {}) };
  out.streak = { ...b.streak, ...(p.streak || {}) };
  out.dailyTricks = { ...b.dailyTricks, ...(p.dailyTricks || {}) };
  out.stats = { ...b.stats, ...(p.stats || {}) };
  for (const k of ['byRank', 'bySize', 'bestTime']) out.stats[k] = { ...(p.stats?.[k] || {}) };
  out.settings = { ...b.settings, ...(p.settings || {}) };
  out.createdAt = p.createdAt || b.createdAt;
  out.updatedAt = p.updatedAt || 0;
  if (!out.pups.biscuit) out.pups.biscuit = out.createdAt;
  return out;
}

export function nextDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + 1));
}

/** Two streak records from different devices: continue the streak if they chain, else keep the newer. */
function mergeStreak(x, y) {
  const [older, newer] = (x.last || '') <= (y.last || '') ? [x, y] : [y, x];
  let out;
  if (!older.last) out = { ...newer };
  else if (older.last === newer.last) out = { count: maxNum(older.count, newer.count), last: newer.last };
  else if (nextDayKey(older.last) === newer.last) out = { count: Math.max(Number(newer.count) || 0, (Number(older.count) || 0) + 1), last: newer.last };
  else out = { ...newer };
  out.count = Number(out.count) || 0; out.last = out.last || '';
  out.best = Math.max(maxNum(x.best, y.best), out.count);
  return out;
}

/** Merge two profiles without losing anything that was earned on either device. */
export function mergeProfiles(a, b) {
  if (!a) return b; if (!b) return a;
  const newer = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  const out = blankProfile();
  out.createdAt = Math.min(a.createdAt || Date.now(), b.createdAt || Date.now());
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  out.treatsEarned = maxNum(a.treatsEarned, b.treatsEarned);
  out.treatsSpent = maxNum(a.treatsSpent, b.treatsSpent);
  out.selectedPup = newer.selectedPup || 'biscuit';
  out.pups = { ...(b.pups || {}), ...(a.pups || {}) };
  out.levels = {};
  for (const k of new Set([...Object.keys(a.levels || {}), ...Object.keys(b.levels || {})])) {
    const x = a.levels?.[k], y = b.levels?.[k];
    if (!x || !y) { out.levels[k] = x || y; continue; }
    out.levels[k] = { stars: maxNum(x.stars, y.stars), best: minPos(x.best, y.best), plays: maxNum(x.plays, y.plays), at: maxNum(x.at, y.at) };
  }
  out.daily = { ...(b.daily || {}), ...(a.daily || {}) };
  out.streak = mergeStreak(a.streak || {}, b.streak || {});
  out.events = {};
  for (const k of new Set([...Object.keys(a.events || {}), ...Object.keys(b.events || {})])) {
    const x = a.events?.[k] || {}, y = b.events?.[k] || {};
    out.events[k] = { done: maxNum(x.done, y.done), claimed: !!(x.claimed || y.claimed) };
  }
  out.tricks = { ...(b.tricks || {}), ...(a.tricks || {}) };
  out.dailyTricks = (a.dailyTricks?.date || '') >= (b.dailyTricks?.date || '') ? (a.dailyTricks || out.dailyTricks) : b.dailyTricks;
  const st = out.stats;
  for (const k of Object.keys(st)) {
    const x = a.stats?.[k], y = b.stats?.[k];
    if (typeof st[k] === 'number') st[k] = maxNum(x, y);
  }
  for (const k of ['byRank', 'bySize']) {
    st[k] = {};
    for (const q of new Set([...Object.keys(a.stats?.[k] || {}), ...Object.keys(b.stats?.[k] || {})])) st[k][q] = maxNum(a.stats?.[k]?.[q], b.stats?.[k]?.[q]);
  }
  st.bestTime = {};
  for (const q of new Set([...Object.keys(a.stats?.bestTime || {}), ...Object.keys(b.stats?.bestTime || {})])) {
    const x = a.stats?.bestTime?.[q], y = b.stats?.bestTime?.[q];
    st.bestTime[q] = Math.min(x || Infinity, y || Infinity);
  }
  out.settings = { ...out.settings, ...(newer.settings || {}) };
  out.progress = {};
  for (const k of new Set([...Object.keys(a.progress || {}), ...Object.keys(b.progress || {})])) {
    const x = a.progress?.[k], y = b.progress?.[k];
    out.progress[k] = (x?.savedAt || 0) >= (y?.savedAt || 0) ? x : y;
  }
  return out;
}

export class Store {
  constructor() {
    this.key = localStorage.getItem(LS_KEY) || null;
    if (!this.key) { this.key = randomHex(16); localStorage.setItem(LS_KEY, this.key); }
    let p = null;
    try { p = JSON.parse(localStorage.getItem(LS_PROFILE) || 'null'); } catch {}
    this.profile = p ? normalizeProfile(p) : blankProfile();
    if (!p) this.saveLocal();
    this.listeners = new Set();
    this.sync = { state: 'off', error: null, ref: null, lastWritten: 0, timer: null, firebase: null };
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) { try { fn(what, this.profile); } catch (e) { console.error(e); } } }

  get treats() { return Math.max(0, (this.profile.treatsEarned || 0) - (this.profile.treatsSpent || 0)); }
  earn(n, why) { if (n <= 0) return; this.profile.treatsEarned += n; this.commit('treats', { delta: n, why }); }
  spend(n) { if (n > this.treats) return false; this.profile.treatsSpent += n; this.commit('treats', { delta: -n }); return true; }

  /** call after mutating this.profile */
  commit(what, detail) {
    this.profile.updatedAt = Date.now();
    this.saveLocal();
    this.scheduleWrite();
    this.emit(what || 'change', detail);
  }
  saveLocal() {
    try { localStorage.setItem(LS_PROFILE, JSON.stringify(this.profile)); } catch (e) { console.warn('localStorage full?', e); }
  }
  resetLocal() {
    this.profile = blankProfile();
    this.key = randomHex(16); localStorage.setItem(LS_KEY, this.key);
    this.saveLocal();
    this.detachSync();
    this.emit('reset');
    this.connect();
  }

  // ---------------------------------------------------------------- firebase

  async loadFirebase() {
    if (window.firebase?.database) return window.firebase;
    for (const src of FIREBASE_SCRIPTS) {
      await new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script'); s.src = src; s.async = true;
        const t = setTimeout(() => reject(new Error('timeout ' + src)), 10000);
        s.onload = () => { clearTimeout(t); resolve(); };
        s.onerror = () => { clearTimeout(t); reject(new Error('failed ' + src)); };
        document.head.appendChild(s);
      });
    }
    return window.firebase;
  }

  async connect() {
    if (!navigator.onLine && this.sync.state === 'off') { this.sync.state = 'offline'; this.emit('sync'); window.addEventListener('online', () => this.connect(), { once: true }); return; }
    this.sync.state = 'connecting'; this.emit('sync');
    try {
      const fb = await this.loadFirebase();
      if (!fb) throw new Error('no firebase');
      if (!fb.apps.length) {
        fb.initializeApp(FIREBASE_CONFIG);
        if (RECAPTCHA_SITE_KEY && fb.appCheck) { try { fb.appCheck().activate(new fb.appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), true); } catch {} }
      }
      this.sync.firebase = fb;
      this.db = fb.database();
      await this.attach();
    } catch (e) {
      console.warn('sync unavailable', e);
      this.sync.state = 'error'; this.sync.error = String(e.message || e); this.emit('sync');
    }
  }

  async attach() {
    this.detachSync();
    const ref = this.db.ref('dokupuppies/profiles/' + this.key);
    const snap = await ref.once('value');
    this.sync.ref = ref;
    const remote = snap.val();
    if (remote) {
      const merged = mergeProfiles(this.profile, normalizeProfile(remote));
      this.profile = merged; this.saveLocal(); this.emit('merged');
    }
    this.sync.state = 'on'; this.sync.error = null; this.emit('sync');
    await this.writeNow();
    this.onValue = snapshot => {
      const v = snapshot.val();
      if (!v || v.updatedAt === this.sync.lastWritten) return;
      if ((v.updatedAt || 0) <= (this.profile.updatedAt || 0)) return;
      this.profile = mergeProfiles(this.profile, normalizeProfile(v)); this.saveLocal(); this.emit('merged');
    };
    ref.on('value', this.onValue);
    this.db.ref('.info/connected').on('value', s => { const c = !!s.val(); if (this.sync.state === 'on' || this.sync.state === 'reconnecting') { this.sync.state = c ? 'on' : 'reconnecting'; this.emit('sync'); } });
  }
  detachSync() {
    if (this.sync.ref && this.onValue) { try { this.sync.ref.off('value', this.onValue); } catch {} }
    this.sync.ref = null; this.onValue = null;
  }
  scheduleWrite() {
    if (!this.sync.ref) return;
    clearTimeout(this.sync.timer);
    this.sync.timer = setTimeout(() => this.writeNow(), 1200);
  }
  async writeNow() {
    if (!this.sync.ref) return;
    clearTimeout(this.sync.timer);
    try {
      this.sync.lastWritten = this.profile.updatedAt;
      await this.sync.ref.set(stripUndefined(this.profile));
    } catch (e) { console.warn('write failed', e); this.sync.state = 'error'; this.sync.error = String(e.message || e); this.emit('sync'); }
  }
  flush() { if (this.sync.ref && this.sync.timer) this.writeNow(); }

  /** Pairing: show this code on one device, type it on another. */
  async createLinkCode() {
    if (!this.db) throw new Error('Sync is not connected');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    for (const b of a) code += alphabet[b % alphabet.length];
    await this.writeNow();
    await this.db.ref('dokupuppies/links/' + code).set({ key: this.key, exp: Date.now() + 10 * 60 * 1000 });
    return code;
  }
  async redeemLinkCode(code) {
    if (!this.db) throw new Error('Sync is not connected');
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) throw new Error('Codes are 6 characters');
    const snap = await this.db.ref('dokupuppies/links/' + code).once('value');
    const link = snap.val();
    if (!link || !link.key || !/^[a-f0-9]{32}$/.test(link.key)) throw new Error('That code was not found');
    if ((link.exp || 0) < Date.now()) throw new Error('That code has expired — make a new one');
    if (link.key === this.key) return 'same';
    const remoteSnap = await this.db.ref('dokupuppies/profiles/' + link.key).once('value');
    const remote = remoteSnap.val();
    const merged = remote ? mergeProfiles(this.profile, normalizeProfile(remote)) : this.profile;
    this.detachSync();
    this.key = link.key; localStorage.setItem(LS_KEY, this.key);
    this.profile = merged; this.profile.updatedAt = Date.now(); this.saveLocal();
    try { await this.db.ref('dokupuppies/links/' + code).remove(); } catch {}
    await this.attach();
    this.emit('merged');
    return 'linked';
  }
}

function stripUndefined(o) { return JSON.parse(JSON.stringify(o)); }

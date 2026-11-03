/* Tiny synthesised sound effects (no audio files). Everything is built from oscillators and
 * noise bursts on first user gesture, so it works offline and inside the Android WebView. */

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = !!on; }
export function soundEnabled() { return enabled; }

function ac() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, { type = 'sine', dur = 0.15, gain = 0.2, at = 0, slide = 0, attack = 0.005 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.08, gain = 0.15, at = 0, freq = 1200 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t0);
}

export const sfx = {
  /** soft pop when an X mark lands */
  mark() { tone(660, { type: 'triangle', dur: 0.07, gain: 0.08, slide: 200 }); },
  /** clearing a mark */
  clear() { tone(420, { type: 'triangle', dur: 0.06, gain: 0.06, slide: -120 }); },
  /** pup sits down: a little "boing" + happy yip */
  place() { tone(300, { type: 'sine', dur: 0.14, gain: 0.18, slide: 260 }); tone(900, { type: 'square', dur: 0.07, gain: 0.05, at: 0.1, slide: 300 }); },
  /** wrong square: sad whine, descending */
  wrong() { tone(520, { type: 'sawtooth', dur: 0.35, gain: 0.12, slide: -300 }); noise({ dur: 0.12, gain: 0.08, freq: 500 }); },
  /** hint: curious "hm?" */
  hint() { tone(520, { type: 'sine', dur: 0.12, gain: 0.12, slide: 180 }); tone(780, { type: 'sine', dur: 0.14, gain: 0.1, at: 0.12, slide: 120 }); },
  /** button tap */
  tap() { tone(500, { type: 'triangle', dur: 0.04, gain: 0.05 }); },
  /** treats collected */
  treat() { tone(880, { type: 'triangle', dur: 0.08, gain: 0.1 }); tone(1320, { type: 'triangle', dur: 0.12, gain: 0.1, at: 0.08 }); },
  /** happy bark pair */
  bark() { for (const at of [0, 0.16]) { noise({ dur: 0.05, gain: 0.12, at, freq: 900 }); tone(240, { type: 'sawtooth', dur: 0.11, gain: 0.12, at, slide: -80 }); tone(480, { type: 'square', dur: 0.09, gain: 0.04, at: at + 0.01, slide: -120 }); } },
  /** level complete fanfare */
  win() { const notes = [523, 659, 784, 1047]; notes.forEach((f, i) => tone(f, { type: 'triangle', dur: 0.22, gain: 0.14, at: i * 0.11 })); tone(1319, { type: 'triangle', dur: 0.5, gain: 0.12, at: 0.46 }); setTimeout(() => sfx.bark(), 650); },
  /** lost the level */
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, { type: 'sine', dur: 0.3, gain: 0.12, at: i * 0.18 })); },
  /** unlock jingle */
  unlock() { [659, 784, 988, 1319, 1568].forEach((f, i) => tone(f, { type: 'sine', dur: 0.25, gain: 0.12, at: i * 0.09 })); },
  /** page swoosh */
  swoosh() { noise({ dur: 0.18, gain: 0.05, freq: 1800 }); },
};

export function haptic(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

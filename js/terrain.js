/*
 * Yard terrain: every region of the board is a kind of ground a dog would walk on, drawn as a
 * tiling SVG pattern (1 unit = 1 cell, tiles are 2×2 cells so repetition is less obvious), plus a
 * low picket fence around the board and a handful of small, occasional idle animations placed on
 * specific cells (sway, ripple, frog hop, duck bob, butterflies, drifting leaves, a bird on the fence).
 *
 * Everything is sized in cell units so it scales from 5×5 to 12×12 boards without any bitmaps.
 */
import { Rng } from './engine.js';

let uid = 0;

// hue/sat/light are only used to keep neighbouring yards visually distinct
export const TERRAINS = [
  { id: 'grass',     name: 'grass',     label: 'grass yard',   fill: '#8be070', deep: '#4fb94a', hue: 108, sat: .7, light: .7 },
  { id: 'pond',      name: 'pond',      label: 'pond',         fill: '#6fc9ff', deep: '#2f8fe0', hue: 205, sat: .9, light: .7 },
  { id: 'sand',      name: 'sand',      label: 'sandpit',      fill: '#ffe16e', deep: '#e0b53a', hue: 48,  sat: .9, light: .75 },
  { id: 'roses',     name: 'rose',      label: 'rose bed',     fill: '#ffb0c6', deep: '#ff5e8a', hue: 345, sat: .8, light: .78 },
  { id: 'pavers',    name: 'stone',     label: 'stone path',   fill: '#dde3f0', deep: '#9aa5c0', hue: 225, sat: .15, light: .9 },
  { id: 'leaves',    name: 'leaf',      label: 'leaf pile',    fill: '#ffb169', deep: '#e8503a', hue: 22,  sat: .9, light: .68 },
  { id: 'clover',    name: 'clover',    label: 'clover patch', fill: '#5fd8a3', deep: '#1f9f6a', hue: 160, sat: .7, light: .62 },
  { id: 'lavender',  name: 'lavender',  label: 'lavender bed', fill: '#cdb4ff', deep: '#8a5cf0', hue: 262, sat: .8, light: .8 },
  { id: 'boardwalk', name: 'boardwalk', label: 'boardwalk',    fill: '#f4ae62', deep: '#b86a2c', hue: 30,  sat: .85, light: .65 },
  { id: 'pool',      name: 'pool',      label: 'splash pool',  fill: '#8df1ea', deep: '#2fb8c8', hue: 178, sat: .8, light: .78 },
  { id: 'trail',     name: 'trail',     label: 'dirt trail',   fill: '#e9cfa2', deep: '#b58a55', hue: 36,  sat: .45, light: .8 },
  { id: 'meadow',    name: 'meadow',    label: 'meadow',       fill: '#cbee66', deep: '#8cc63f', hue: 78,  sat: .8, light: .72 },
];

export function terrainDistance(a, b) {
  const dh = Math.abs(a.hue - b.hue); const hue = Math.min(dh, 360 - dh);
  return hue * Math.min(a.sat, b.sat) + 90 * Math.abs(a.sat - b.sat) + 120 * Math.abs(a.light - b.light);
}

// ---------------------------------------------------------------- patterns (2×2 cell tiles)

const tuft = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${c}" stroke-width=".05" stroke-linecap="round" fill="none"><path d="M0 0 q-.02 -.1 -.08 -.17"/><path d="M0 0 q0 -.12 0 -.2"/><path d="M0 0 q.02 -.1 .08 -.16"/></g>`;
const daisy = (x, y, c = '#fff', s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r=".07" fill="${c}"/><circle r=".028" fill="#ffd54a"/></g>`;
const flower5 = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(Math.cos(a * Math.PI / 180) * .07).toFixed(3)}" cy="${(Math.sin(a * Math.PI / 180) * .07).toFixed(3)}" r=".05"/>`).join('')}<circle r=".035" fill="#ffd54a"/></g>`;
const clover = (x, y, c, s = 1, four = false) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><circle cx="-.07" cy="-.04" r=".065"/><circle cx=".07" cy="-.04" r=".065"/><circle cy=".06" r=".065"/>${four ? '<circle cy="-.12" r=".06"/>' : ''}<path d="M0 .06 L.04 .2" stroke="${c}" stroke-width=".03" fill="none"/></g>`;
const leaf = (x, y, rot, c, s = 1) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 -.16 C.12 -.1 .14 .06 0 .16 C-.14 .06 -.12 -.1 0 -.16 Z M0 -.12 L0 .12" fill="${c}" stroke="${c}" stroke-width=".015"/>`;
const paw = (x, y, rot, c, s = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="${c}"><ellipse cy=".05" rx=".07" ry=".06"/><circle cx="-.075" cy="-.04" r=".03"/><circle cx="-.028" cy="-.08" r=".03"/><circle cx=".028" cy="-.08" r=".03"/><circle cx=".075" cy="-.04" r=".03"/></g>`;
const pebble = (x, y, c, rx = .06, ry = .045, rot = 0) => `<ellipse transform="translate(${x} ${y}) rotate(${rot})" rx="${rx}" ry="${ry}" fill="${c}"/>`;
const lily = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 L.2 -.08 A.21 .21 0 1 1 .2 .08 Z" fill="#59cf79" transform="rotate(-20)"/><path d="M0 0 L.2 -.08 A.21 .21 0 1 1 .2 .08 Z" fill="none" stroke="#3aa75a" stroke-width=".02" transform="rotate(-20)"/></g>`;
const ripple = (x, y, r, c = '#fff') => `<path d="M${x - r} ${y} a${r} ${r * .55} 0 0 0 ${2 * r} 0" fill="none" stroke="${c}" stroke-width=".03" opacity=".6"/>`;
const sprig = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 .2 L0 -.22" stroke="#6f9f4a" stroke-width=".03" fill="none"/>${[-.2, -.13, -.06, .01].map(dy => `<circle cx="-.04" cy="${dy}" r=".035" fill="#8f5bff"/><circle cx=".04" cy="${dy + .035}" r=".035" fill="#a57cff"/>`).join('')}</g>`;
const rose = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx=".12" cy=".1" r=".06" fill="#67c26e" transform="rotate(30)"/><circle cx="-.13" cy=".06" r=".06" fill="#67c26e" transform="rotate(-20)"/><circle r=".12" fill="#ff5e8a"/><path d="M-.06 -.02 a.07 .07 0 1 1 .09 .06 a.04 .04 0 1 0 -.03 -.04" fill="none" stroke="#ffb3c8" stroke-width=".025"/></g>`;
const shell = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-.1 .06 Q0 -.16 .1 .06 Z" fill="#fff5d6" stroke="#d9b56a" stroke-width=".015"/><path d="M0 .06 L-.04 -.06 M0 .06 L0 -.09 M0 .06 L.04 -.06" stroke="#d9b56a" stroke-width=".012" fill="none"/></g>`;
const stone = (pts, c = '#eef1f8', sc = '#b2bbd1') => `<path d="M${pts}Z" fill="${c}" stroke="${sc}" stroke-width=".025" stroke-linejoin="round"/>`;

const PATTERNS = {
  grass: t => `<rect width="2" height="2" fill="${t.fill}"/>${[[.25, .8], [.78, .32], [1.3, .72], [1.78, .22], [.52, 1.48], [1.22, 1.86], [1.72, 1.32], [.14, 1.2], [1.05, 1.1], [1.55, .95]].map(([x, y], i) => tuft(x, y, i % 3 ? '#57bd4f' : '#3fa23e', i % 2 ? 1 : .8)).join('')}${daisy(.95, .55, '#fff', .8)}${daisy(1.62, 1.68, '#fff', .9)}${daisy(.3, 1.72, '#ffe8f3', .7)}`,
  clover: t => `<rect width="2" height="2" fill="${t.fill}"/>${[[.3, .3], [.9, .7], [1.5, .25], [.4, 1.3], [1.1, 1.6], [1.75, 1.05], [1.8, 1.75], [.85, 1.05]].map(([x, y], i) => clover(x, y, i % 2 ? '#1f9f6a' : '#2cb77c', .9, i === 4)).join('')}`,
  meadow: t => `<rect width="2" height="2" fill="${t.fill}"/>${[[.2, .7], [1.1, .3], [1.7, .8], [.6, 1.4], [1.45, 1.6], [.95, 1.95]].map(([x, y], i) => tuft(x, y, '#7cbf3a', .8)).join('')}${flower5(.42, .36, '#ff8fb0')}${flower5(1.35, .55, '#fff')}${flower5(.85, 1.1, '#ffd54a')}${flower5(1.65, 1.3, '#ff8fb0', .85)}${flower5(.35, 1.75, '#fff', .9)}${flower5(1.2, 1.78, '#9ad3ff', .8)}`,
  sand: t => `<rect width="2" height="2" fill="${t.fill}"/><g fill="#e0b53a" opacity=".55">${Array.from({ length: 22 }, (_, i) => `<circle cx="${((i * 37) % 200 / 100).toFixed(2)}" cy="${((i * 61 + 17) % 200 / 100).toFixed(2)}" r=".022"/>`).join('')}</g>${shell(.5, .55)}${shell(1.5, 1.45, .8)}${pebble(1.3, .4, '#e6c67a', .06, .045, 20)}${pebble(.35, 1.4, '#dcb565', .05, .04, -15)}${pebble(1.75, 1.0, '#e6c67a', .045, .035, 40)}`,
  trail: t => `<rect width="2" height="2" fill="${t.fill}"/><g fill="#d4b27f" opacity=".7">${pebble(.2, .25, '#cfae7b', .05, .04, 10)}${pebble(1.65, .4, '#c9a46f', .06, .045, -25)}${pebble(.8, 1.7, '#cfae7b', .045, .035, 30)}${pebble(1.9, 1.5, '#c9a46f', .05, .04, 0)}</g>${paw(.55, .55, 20, '#c29a6a', .9)}${paw(1.05, 1.0, 25, '#c29a6a', .9)}${paw(1.55, 1.45, 20, '#c29a6a', .9)}${tuft(.15, 1.1, '#9ccf6a', .8)}${tuft(1.85, .95, '#9ccf6a', .8)}${tuft(.95, 1.95, '#9ccf6a', .7)}`,
  boardwalk: t => `<rect width="2" height="2" fill="${t.fill}"/>${[0, .5, 1, 1.5].map((y, i) => `<rect x="0" y="${y + .03}" width="2" height=".44" rx=".03" fill="${i % 2 ? '#f6bb75' : '#efa75c'}"/><path d="M.15 ${y + .17} q.6 .04 1.2 0 M.4 ${y + .31} q.5 -.03 1.3 .02" stroke="#d98e47" stroke-width=".018" fill="none" opacity=".55"/>`).join('')}<g fill="#8f4f22" opacity=".8">${[.25, 1.25].map(x => [.25, .75, 1.25, 1.75].map(y => `<circle cx="${x}" cy="${y}" r=".025"/>`).join('')).join('')}</g><path d="M0 .5 H2 M0 1 H2 M0 1.5 H2 M0 0 H2 M0 2 H2" stroke="#b86a2c" stroke-width=".035"/>`,
  pavers: t => `<rect width="2" height="2" fill="${t.fill}"/>${stone('.06 .08 L.72 .05 L.78 .55 L.3 .62 L.05 .45')}${stone('.84 .08 L1.55 .12 L1.5 .5 L.86 .58')}${stone('1.62 .04 L1.98 .1 L1.95 .55 L1.6 .5')}${stone('.08 .7 L.6 .66 L.7 1.15 L.1 1.2')}${stone('.78 .66 L1.42 .62 L1.46 1.18 L.8 1.22')}${stone('1.55 .62 L1.96 .65 L1.94 1.2 L1.52 1.25')}${stone('.05 1.3 L.5 1.28 L.55 1.9 L.08 1.94')}${stone('.62 1.3 L1.25 1.32 L1.2 1.94 L.65 1.92')}${stone('1.35 1.34 L1.95 1.3 L1.96 1.95 L1.3 1.92')}${tuft(.75, .64, '#8ad17a', .55)}${tuft(1.5, 1.28, '#8ad17a', .55)}${tuft(.56, 1.28, '#8ad17a', .5)}`,
  pond: t => `<rect width="2" height="2" fill="${t.fill}"/>${ripple(.5, .4, .18)}${ripple(1.5, .25, .14)}${ripple(.3, 1.3, .15)}${ripple(1.35, 1.1, .2)}${ripple(.9, 1.85, .16)}${ripple(1.8, 1.7, .12)}${lily(1.1, .55)}${lily(.45, 1.65, .85)}${lily(1.75, 1.35, .7)}<circle cx="1.26" cy=".42" r=".035" fill="#ff8fb0"/>`,
  pool: t => `<rect width="2" height="2" fill="${t.fill}"/><g fill="none" stroke="#fff" stroke-width=".035" opacity=".75">${[.2, .55, .9, 1.25, 1.6, 1.95].map((y, i) => `<path d="M${i % 2 ? .1 : -.1} ${y} q.2 -.14 .4 0 t.4 0 t.4 0 t.4 0 t.4 0 t.4 0"/>`).join('')}</g><g fill="#fff" opacity=".85"><path d="M1.5 .33 l.03 .07 l.07 .03 l-.07 .03 l-.03 .07 l-.03 -.07 l-.07 -.03 l.07 -.03z"/><path d="M.42 1.45 l.03 .07 l.07 .03 l-.07 .03 l-.03 .07 l-.03 -.07 l-.07 -.03 l.07 -.03z"/></g>`,
  leaves: t => `<rect width="2" height="2" fill="${t.fill}"/>${[[.3, .3, 20, '#e8503a'], [.85, .2, -40, '#ffd166'], [1.4, .45, 70, '#f28c3b'], [1.85, .15, -10, '#c9553d'], [.2, .95, 110, '#ffd166'], [.7, .75, -70, '#c9553d'], [1.15, 1.05, 30, '#e8503a'], [1.7, .95, -30, '#f7a24a'], [.45, 1.5, 60, '#f28c3b'], [1.0, 1.6, -20, '#ffd166'], [1.5, 1.6, 100, '#e8503a'], [1.9, 1.85, 10, '#f7a24a'], [.1, 1.85, -60, '#c9553d']].map(([x, y, r, c]) => leaf(x, y, r, c, .85)).join('')}`,
  lavender: t => `<rect width="2" height="2" fill="${t.fill}"/>${[[.3, .5], [.85, .3], [1.4, .55], [1.85, .35], [.55, 1.3], [1.1, 1.15], [1.65, 1.4], [.2, 1.8], [1.0, 1.85], [1.9, 1.9]].map(([x, y], i) => sprig(x, y, i % 3 === 0 ? 1 : .85)).join('')}${tuft(.65, .95, '#7fa05a', .6)}${tuft(1.45, 1.0, '#7fa05a', .6)}`,
  roses: t => `<rect width="2" height="2" fill="${t.fill}"/>${rose(.4, .4)}${rose(1.4, .6, .9)}${rose(.8, 1.3, .95)}${rose(1.7, 1.55, .85)}${rose(.25, 1.7, .75)}<g fill="#ff8fb0" opacity=".8"><ellipse cx="1.05" cy=".25" rx=".05" ry=".03" transform="rotate(30 1.05 .25)"/><ellipse cx="1.85" cy="1.05" rx=".05" ry=".03" transform="rotate(-20 1.85 1.05)"/><ellipse cx=".75" cy=".85" rx=".045" ry=".028" transform="rotate(60 .75 .85)"/><ellipse cx="1.3" cy="1.85" rx=".05" ry=".03"/></g>`,
};

// ---------------------------------------------------------------- idle sprites (drawn in a -0.5..0.5 box)

const SPRITES = {
  sway: () => `<g class="an an-sway">${tuft(0, .25, '#2f9a3a', 1.6)}</g>`,
  butterfly: (rng) => { const c = rng.pick(['#ffd54a', '#ff8fb0', '#9ad3ff', '#fff']); return `<g class="an an-butterfly"><g class="an-flap"><ellipse cx="-.11" cy="-.02" rx=".11" ry=".08" fill="${c}" transform="rotate(-20)"/><ellipse cx=".11" cy="-.02" rx=".11" ry=".08" fill="${c}" transform="rotate(20)"/><circle cx="-.1" cy="0" r=".03" fill="#fff" opacity=".7"/><circle cx=".1" cy="0" r=".03" fill="#fff" opacity=".7"/></g><ellipse rx=".025" ry=".09" fill="#4a3a30"/></g>`; },
  ladybug: () => `<g class="an an-crawl"><ellipse rx=".1" ry=".08" fill="#e8322f"/><path d="M0 -.08 L0 .08" stroke="#222" stroke-width=".018"/><circle cx="-.045" cy="-.02" r=".02" fill="#222"/><circle cx=".045" cy=".02" r=".02" fill="#222"/><circle cx="-.1" cy="0" r=".04" fill="#222"/></g>`,
  bee: () => `<g class="an an-bee"><ellipse rx=".09" ry=".065" fill="#ffd54a"/><path d="M-.03 -.06 L-.03 .06 M.02 -.06 L.02 .06" stroke="#333" stroke-width=".022"/><circle cx=".09" cy="-.01" r=".035" fill="#333"/><g class="an-flap"><ellipse cx="-.02" cy="-.07" rx=".05" ry=".03" fill="#fff" opacity=".85"/></g></g>`,
  ripple: () => `<g class="an an-ripple"><circle r=".3" fill="none" stroke="#fff" stroke-width=".04"/><circle r=".3" fill="none" stroke="#fff" stroke-width=".03" style="animation-delay:-3.5s"/></g>`,
  frog: () => `<g class="an an-frog">${lily(-.18, .12, 1.1)}<g class="an-hop"><ellipse cy=".02" rx=".14" ry=".1" fill="#58c85a"/><circle cx="-.07" cy="-.08" r=".05" fill="#58c85a"/><circle cx=".07" cy="-.08" r=".05" fill="#58c85a"/><circle cx="-.07" cy="-.09" r=".022" fill="#222"/><circle cx=".07" cy="-.09" r=".022" fill="#222"/><path d="M-.05 .04 q.05 .04 .1 0" stroke="#2f7f30" stroke-width=".018" fill="none"/></g></g>`,
  duck: () => `<g class="an an-duck"><ellipse cy=".03" rx=".16" ry=".1" fill="#ffd54a"/><circle cx=".09" cy="-.08" r=".08" fill="#ffd54a"/><path d="M.16 -.07 L.25 -.05 L.16 -.02 Z" fill="#ff8a3d"/><circle cx=".11" cy="-.1" r=".018" fill="#222"/><path d="M-.18 .0 q-.06 -.06 -.03 -.12" stroke="#ffd54a" stroke-width=".04" fill="none" stroke-linecap="round"/></g>`,
  leafFall: (rng) => `<g class="an an-fall">${leaf(0, 0, 30, rng.pick(['#e8503a', '#ffd166', '#f28c3b']), .9)}</g>`,
  petalFall: () => `<g class="an an-fall an-petal"><ellipse rx=".07" ry=".045" fill="#ff8fb0"/></g>`,
  sparkle: () => `<g class="an an-sparkle"><path d="M0 -.12 l.03 .09 l.09 .03 l-.09 .03 l-.03 .09 l-.03 -.09 l-.09 -.03 l.09 -.03z" fill="#fff"/></g>`,
  dust: () => `<g class="an an-dust" fill="#cdb48e" opacity=".8"><circle cx="-.08" cy=".02" r=".06"/><circle cx=".02" cy="-.04" r=".075"/><circle cx=".1" cy=".03" r=".05"/></g>`,
  crab: () => `<g class="an an-crab"><ellipse rx=".12" ry=".08" fill="#ff7a59"/><circle cx="-.05" cy="-.07" r=".025" fill="#222"/><circle cx=".05" cy="-.07" r=".025" fill="#222"/><path d="M-.12 0 l-.07 -.06 M.12 0 l.07 -.06 M-.1 .05 l-.06 .05 M.1 .05 l.06 .05" stroke="#ff7a59" stroke-width=".03" stroke-linecap="round"/><circle cx="-.2" cy="-.07" r=".035" fill="#ff7a59"/><circle cx=".2" cy="-.07" r=".035" fill="#ff7a59"/></g>`,
  dandelion: () => `<g class="an an-sway"><path d="M0 .3 L0 -.05" stroke="#7fa05a" stroke-width=".03"/><circle cy="-.1" r=".11" fill="#fff" opacity=".85"/><circle cy="-.1" r=".05" fill="#f1efe4"/></g>`,
  flowerBob: () => `<g class="an an-bob">${flower5(0, 0, '#ff8fb0', 1.5)}</g>`,
};

/** sprites per terrain: [main, optional second] */
const TERRAIN_SPRITES = {
  grass: ['sway', 'butterfly'], clover: ['ladybug', 'sway'], meadow: ['butterfly', 'flowerBob'], sand: ['crab', 'sparkle'],
  trail: ['dust', 'sway'], boardwalk: ['sparkle'], pavers: ['dandelion'], pond: ['frog', 'ripple'], pool: ['duck', 'sparkle'],
  leaves: ['leafFall', 'leafFall'], lavender: ['butterfly', 'sway'], roses: ['bee', 'petalFall'],
};

// ---------------------------------------------------------------- fence

function fence(n, m) {
  // pickets around the board; m = fence depth in cell units; drawn in the margin area
  const h = m * .92, w = Math.min(.3, m * .55), gap = Math.max(.03, m * .1);
  const post = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M${-w / 2} 0 L${-w / 2} ${-h * .78} L0 ${-h} L${w / 2} ${-h * .78} L${w / 2} 0 Z" fill="#fde7b8" stroke="#a9733a" stroke-width="${m * .07}" stroke-linejoin="round"/></g>`;
  const rail = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#d9a35c" stroke-width="${m * .16}" stroke-linecap="round"/>`;
  const run = (len, step) => { const out = []; for (let s = step / 2; s < len; s += step) out.push(s); return out; };
  const step = w + gap;
  let s = '';
  // rails first (behind pickets)
  s += rail(-m * .1, -m * .3, n + m * .1, -m * .3) + rail(-m * .1, -m * .62, n + m * .1, -m * .62);
  s += rail(-m * .1, n + m * .3, n + m * .1, n + m * .3) + rail(-m * .1, n + m * .62, n + m * .1, n + m * .62);
  s += rail(-m * .3, -m * .1, -m * .3, n + m * .1) + rail(-m * .62, -m * .1, -m * .62, n + m * .1);
  s += rail(n + m * .3, -m * .1, n + m * .3, n + m * .1) + rail(n + m * .62, -m * .1, n + m * .62, n + m * .1);
  for (const x of run(n, step)) { s += post(x, -m * .04, 0) + post(x, n + m * .96, 0); }
  for (const y of run(n, step)) { s += post(-m * .04, y, -90) + post(n + m * .04, y, 90); }
  // corner posts
  for (const [x, y] of [[-m * .5, -m * .5], [n + m * .5, -m * .5], [-m * .5, n + m * .5], [n + m * .5, n + m * .5]]) {
    s += `<rect x="${x - m * .22}" y="${y - m * .22}" width="${m * .44}" height="${m * .44}" rx="${m * .1}" fill="#c98a4b" stroke="#8b5a2b" stroke-width="${m * .06}"/>`;
  }
  // a little gate in the middle of the bottom run
  const gx = n / 2;
  s += `<g transform="translate(${gx} ${n + m * .96})"><rect x="${-step * 1.5}" y="${-h * .9}" width="${step * 3}" height="${h * .9}" rx="${m * .05}" fill="#f7cf8c" stroke="#a9733a" stroke-width="${m * .06}"/><path d="M${-step * 1.4} ${-h * .15} L${step * 1.4} ${-h * .8}" stroke="#a9733a" stroke-width="${m * .06}"/><circle cx="${step * 1.1}" cy="${-h * .45}" r="${m * .07}" fill="#6b4a2b"/></g>`;
  return `<g class="fence">${s}</g>`;
}

function bird(n, m, rng) {
  const x = .5 + rng.int(Math.max(1, Math.floor(n - 1)));
  return `<g class="an an-bird" transform="translate(${x} ${-m * .98})"><g transform="scale(${Math.min(.9, m * 1.8)})">
    <ellipse cy="-.08" rx=".12" ry=".085" fill="#6fb6ff"/><circle cx=".1" cy="-.16" r=".07" fill="#6fb6ff"/><path d="M.16 -.16 L.24 -.14 L.16 -.12 Z" fill="#ff9a3d"/><circle cx=".12" cy="-.18" r=".016" fill="#222"/>
    <path d="M-.16 -.1 l-.08 -.05" stroke="#4a90d9" stroke-width=".03" stroke-linecap="round"/><path d="M-.03 0 l0 .05 M.03 0 l0 .05" stroke="#ff9a3d" stroke-width=".018"/></g></g>`;
}

// ---------------------------------------------------------------- board terrain

/**
 * Build the terrain SVG for a puzzle.
 * colors: array (per region) of TERRAINS entries; m: fence depth in cell units.
 */
export function buildTerrainSvg(puzzle, colors, m = .45) {
  const { n, regions } = puzzle;
  const rng = new Rng('terrain-' + n + '-' + Array.from(regions).join(''));
  const id = 't' + (++uid) + '-';
  const used = new Set(colors.map(c => c.id));
  let defs = '';
  for (const t of TERRAINS) if (used.has(t.id)) defs += `<pattern id="${id}${t.id}" patternUnits="userSpaceOnUse" width="2" height="2">${PATTERNS[t.id](t)}</pattern>`;
  // region fills: one rect per cell, grouped per region
  let fills = '';
  for (let k = 0; k < n; k++) {
    const t = colors[k];
    let rects = '';
    for (let i = 0; i < n * n; i++) if (regions[i] === k) rects += `<rect x="${i % n}" y="${(i / n) | 0}" width="1.01" height="1.01"/>`;
    fills += `<g fill="url(#${id}${t.id})">${rects}</g>`;
  }
  // sprites: one per region (two for big regions), placed in a corner of a random cell
  let sprites = '';
  const corners = [[.24, .24], [.76, .24], [.24, .76], [.76, .76]];
  for (let k = 0; k < n; k++) {
    const cells = []; for (let i = 0; i < n * n; i++) if (regions[i] === k) cells.push(i);
    const list = TERRAIN_SPRITES[colors[k].id] || [];
    const count = cells.length >= 5 && list.length > 1 ? 2 : 1;
    const picked = rng.shuffle(cells.slice()).slice(0, count);
    picked.forEach((cell, j) => {
      const kind = list[j] || list[0]; if (!kind) return;
      const [cx, cy] = corners[rng.int(4)];
      const x = (cell % n) + cx, y = ((cell / n) | 0) + cy;
      const delay = -(rng.next() * 14).toFixed(1);
      sprites += `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(.5)" style="--d:${delay}s;--p:${(9 + rng.int(8))}s">${SPRITES[kind](rng)}</g>`;
    });
  }
  const vb = `${-m} ${-m} ${n + 2 * m} ${n + 2 * m}`;
  return `<svg class="terrain" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="none">
    <defs>${defs}</defs>
    <rect x="${-m}" y="${-m}" width="${n + 2 * m}" height="${n + 2 * m}" rx="${m * .6}" fill="#9fd66e"/>
    <g class="yards">${fills}</g>
    <g class="sprites">${sprites}</g>
    ${fence(n, m)}${bird(n, m, rng)}
  </svg>`;
}

/*
 * Puppy roster + SVG art + seasonal events.
 * Every pup is drawn procedurally from a small spec so the whole kennel costs no image files.
 * pupSvg(spec, { body:false, mood:'happy', size }) returns an inline SVG string.
 */

export const PUPS = [
  { id: 'biscuit', name: 'Biscuit', breed: 'Golden Retriever', ears: 'floppy', fur: '#e9b96e', ear: '#d79e4e', muzzle: '#f6dcaa', nose: '#5a3a2a', accessory: 'collar', acc: '#4fa3e0',
    blurb: 'Your first best friend. Loves belly rubs and long deductions.', unlock: { type: 'start' } },
  { id: 'pepper', name: 'Pepper', breed: 'Dalmatian', ears: 'floppy', fur: '#f7f4ee', ear: '#2b2b2b', muzzle: '#fbf9f5', nose: '#222', spots: true, accessory: 'collar', acc: '#e74c3c',
    blurb: 'Counts her spots when she gets bored. Never bored on a puzzle.', unlock: { type: 'level', value: 5, text: 'Finish level 5' } },
  { id: 'maple', name: 'Maple', breed: 'Shiba Inu', ears: 'pointy', fur: '#e9893a', ear: '#d6752a', muzzle: '#fff1dc', nose: '#3b2a22', mask: 'cream', accessory: 'bandana', acc: '#d33b2f',
    blurb: 'Smug, fluffy, always right about where the pup goes.', unlock: { type: 'walk', value: 1, text: 'Finish Puppy Park' } },
  { id: 'mochi', name: 'Mochi', breed: 'Pug', ears: 'folded', fur: '#d9b98a', ear: '#3a2c25', muzzle: '#4a3a30', nose: '#201815', wrinkle: true, accessory: 'bow', acc: '#ff7eb6',
    blurb: 'Snorts when she laughs. Laughs at every solved row.', unlock: { type: 'stars3', value: 10, text: 'Earn 3 stars on 10 levels' } },
  { id: 'luna', name: 'Luna', breed: 'Husky', ears: 'pointy', fur: '#8d99a6', ear: '#6b7682', muzzle: '#f4f6f8', nose: '#222', eyes: '#5ab3ff', mask: 'husky', accessory: 'collar', acc: '#2e4a7d',
    blurb: 'Talks back. Mostly to say "that square is obviously wrong".', unlock: { type: 'walk', value: 2, text: 'Finish Backyard' } },
  { id: 'sunny', name: 'Sunny', breed: 'Corgi', ears: 'bigpointy', fur: '#f0a04b', ear: '#e08e3c', muzzle: '#fff5e6', nose: '#3b2a22', blaze: true, accessory: 'bandana', acc: '#f4c20d',
    blurb: 'Short legs, long streaks. Shows up every single day.', unlock: { type: 'streak', value: 3, text: 'Keep a 3-day daily streak' } },
  { id: 'coco', name: 'Coco', breed: 'Chocolate Lab', ears: 'floppy', fur: '#6b4423', ear: '#5a3719', muzzle: '#7d5230', nose: '#2b1a10', accessory: 'collar', acc: '#58c27d',
    blurb: 'Would fetch the moon if you pointed at it.', unlock: { type: 'walk', value: 3, text: 'Finish Beach Day' } },
  { id: 'pixel', name: 'Pixel', breed: 'Border Collie', ears: 'semi', fur: '#2d2d2d', ear: '#222', muzzle: '#fafafa', nose: '#111', blaze: true, accessory: 'bandana', acc: '#7c5cff',
    blurb: 'Herds X marks into tidy rows. Thinks three moves ahead.', unlock: { type: 'streak', value: 7, text: 'Keep a 7-day daily streak' } },
  { id: 'waffles', name: 'Waffles', breed: 'Beagle', ears: 'long', fur: '#d9a066', ear: '#8a5a2b', muzzle: '#fff3e0', nose: '#2b1a10', patch: true, accessory: 'collar', acc: '#ff9f43',
    blurb: 'Nose to the ground, sniffing out the last pup.', unlock: { type: 'nohint', value: 25, text: 'Solve 25 puzzles without hints' } },
  { id: 'olive', name: 'Olive', breed: 'French Bulldog', ears: 'bat', fur: '#9aa0a6', ear: '#8a9096', muzzle: '#c9ced3', nose: '#222', wrinkle: true, accessory: 'bow', acc: '#9ad66b',
    blurb: 'Ears like satellite dishes. Picks up every clue.', unlock: { type: 'walk', value: 4, text: 'Finish Forest Trail' } },
  { id: 'nova', name: 'Nova', breed: 'Samoyed', ears: 'pointy', fur: '#fbfbfb', ear: '#eceae6', muzzle: '#ffffff', nose: '#222', fluffy: true, accessory: 'collar', acc: '#6ec6ff',
    blurb: 'A cloud that smiles. Famous for the Sammy smile.', unlock: { type: 'streak', value: 30, text: 'Keep a 30-day daily streak' } },
  { id: 'bruno', name: 'Bruno', breed: 'Bernese Mountain Dog', ears: 'floppy', fur: '#2b2b2b', ear: '#222', muzzle: '#f6f1ea', nose: '#111', blaze: true, brows: '#b5651d', accessory: 'bandana', acc: '#c0392b',
    blurb: 'Big, gentle, and surprisingly good at the hard ones.', unlock: { type: 'walk', value: 5, text: 'Finish Snowy Hills' } },
  { id: 'ziggy', name: 'Ziggy', breed: 'Dachshund', ears: 'long', fur: '#a0522d', ear: '#7a3b1e', muzzle: '#c47a4a', nose: '#2b1a10', accessory: 'collar', acc: '#ffd166',
    blurb: 'Long dog, long memory. Has solved a hundred of these.', unlock: { type: 'levels', value: 100, text: 'Solve 100 puzzles' } },
  { id: 'sage', name: 'Sage', breed: 'Poodle', ears: 'floppy', fur: '#f0c9a0', ear: '#e4b586', muzzle: '#f7dcc0', nose: '#4a3a30', fluffy: true, accessory: 'bow', acc: '#ff6fa5',
    blurb: 'Fancy hair, sharper mind. The city is her runway.', unlock: { type: 'walk', value: 6, text: 'Finish City Lights' } },
  { id: 'rex', name: 'Rex', breed: 'German Shepherd', ears: 'pointy', fur: '#c89a5b', ear: '#4a3524', muzzle: '#3b2a22', nose: '#111', mask: 'dark', accessory: 'collar', acc: '#34495e',
    blurb: 'Top dog. Took on the biggest yards and won.', unlock: { type: 'rank', value: 10, text: 'Solve 10 Top Dog or Legend puzzles' } },
  { id: 'patch', name: 'Patch', breed: 'Jack Russell', ears: 'semi', fur: '#fbf7f0', ear: '#c9733b', muzzle: '#fff', nose: '#222', patch: true, accessory: 'bandana', acc: '#2ecc71',
    blurb: 'Zoomies incarnate. Solves fast, celebrates faster.', unlock: { type: 'speed', value: 60, text: 'Solve a 7×7 or bigger in under 60 seconds' } },
  // seasonal event pups
  { id: 'boo', name: 'Boo', breed: 'Ghost pup', ears: 'floppy', fur: '#f3f0ff', ear: '#e3deff', muzzle: '#fff', nose: '#333', accessory: 'ghost', acc: '#fff',
    blurb: 'Boo! Only a little spooky. Mostly just wants treats.', unlock: { type: 'event', value: 'howloween', text: 'Howl-o-ween event' } },
  { id: 'nick', name: 'Nick', breed: 'Santa Paws', ears: 'floppy', fur: '#d8c3a5', ear: '#c0a884', muzzle: '#f7eedd', nose: '#3b2a22', accessory: 'santa', acc: '#d7263d',
    blurb: 'Checks his list twice. Every pup is on the nice list.', unlock: { type: 'event', value: 'santapaws', text: 'Santa Paws event' } },
  { id: 'cupid', name: 'Cupid', breed: 'Cavalier', ears: 'long', fur: '#fff5ef', ear: '#c0392b', muzzle: '#fff', nose: '#3b2a22', patch: true, accessory: 'heart', acc: '#ff4d6d',
    blurb: 'Falls in love with every puzzle. Very loyal.', unlock: { type: 'event', value: 'puppylove', text: 'Puppy Love event' } },
  { id: 'clover', name: 'Clover', breed: 'Irish Setter', ears: 'long', fur: '#b5422a', ear: '#9a3620', muzzle: '#c95a3e', nose: '#2b1a10', accessory: 'clover', acc: '#2ecc71',
    blurb: 'Lucky by name, logical by nature.', unlock: { type: 'event', value: 'luckypup', text: 'Lucky Pup event' } },
  { id: 'hops', name: 'Hops', breed: 'Spaniel', ears: 'bunny', fur: '#e8d5c0', ear: '#ffc4d6', muzzle: '#fff5ec', nose: '#3b2a22', accessory: 'none', acc: '#fff',
    blurb: 'Wears bunny ears every spring. Nobody has told him.', unlock: { type: 'event', value: 'springhop', text: 'Spring Hop event' } },
  { id: 'sandy', name: 'Sandy', breed: 'Labrador', ears: 'floppy', fur: '#f2d39b', ear: '#e0bd7d', muzzle: '#fbeccc', nose: '#3b2a22', accessory: 'shades', acc: '#222',
    blurb: 'Beach bum. Digs holes, finds pups.', unlock: { type: 'event', value: 'beachdays', text: 'Beach Days event' } },
  { id: 'rusty', name: 'Rusty', breed: 'Nova Scotia Duck Toller', ears: 'floppy', fur: '#c9602a', ear: '#b24f1f', muzzle: '#f6e7d2', nose: '#3b2a22', blaze: true, accessory: 'leaf', acc: '#e0582b',
    blurb: 'Crunchy leaves, crisp logic. Canada\'s own.', unlock: { type: 'event', value: 'fallwalkies', text: 'Fall Walkies event' } },
];

export const PUP_BY_ID = Object.fromEntries(PUPS.map(p => [p.id, p]));

/** Seasonal events: month/day windows that repeat every year. 5 puzzles each. */
export const EVENTS = [
  { id: 'howloween', name: 'Howl-o-ween', emoji: '🎃', pup: 'boo', from: [10, 20], to: [11, 7], theme: 'spooky', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'Ghost pups are haunting the yards. Settle five spooky boards to adopt Boo.' },
  { id: 'santapaws', name: 'Santa Paws', emoji: '🎄', pup: 'nick', from: [12, 10], to: [12, 26], theme: 'winter', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'Five snowy puzzles under the tree. Solve them all and Nick joins the kennel.' },
  { id: 'puppylove', name: 'Puppy Love', emoji: '💝', pup: 'cupid', from: [2, 7], to: [2, 14], theme: 'love', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'Five puzzles with heart. Cupid is waiting at the end.' },
  { id: 'luckypup', name: 'Lucky Pup', emoji: '🍀', pup: 'clover', from: [3, 14], to: [3, 17], theme: 'lucky', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'No luck needed, only logic. Five boards to win Clover.' },
  { id: 'springhop', name: 'Spring Hop', emoji: '🐣', pup: 'hops', from: [4, 1], to: [4, 20], theme: 'spring', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'Hop through five springtime puzzles and Hops hops home with you.' },
  { id: 'beachdays', name: 'Beach Days', emoji: '🏖️', pup: 'sandy', from: [7, 1], to: [7, 31], theme: 'beach', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'Five sunny boards. Sandy brings the shades.' },
  { id: 'fallwalkies', name: 'Fall Walkies', emoji: '🍁', pup: 'rusty', from: [9, 22], to: [10, 15], theme: 'fall', sizes: [7, 8, 8, 9, 9], rank: 3,
    text: 'Crunch through five autumn puzzles to adopt Rusty.' },
];

export function activeEvent(date = new Date()) {
  const m = date.getMonth() + 1, d = date.getDate();
  const after = (md) => m > md[0] || (m === md[0] && d >= md[1]);
  const before = (md) => m < md[0] || (m === md[0] && d <= md[1]);
  return EVENTS.find(e => after(e.from) && before(e.to)) || null;
}

/** The event key for progress tracking: id + the year the event (started) in. */
export function eventKey(ev, date = new Date()) {
  let y = date.getFullYear();
  if (ev.from[0] > ev.to[0] && date.getMonth() + 1 <= ev.to[0]) y -= 1; // window wraps the new year
  return ev.id + '-' + y;
}

// ---------------------------------------------------------------- art

const esc = s => String(s);

function earShapes(spec, side) {
  // side: -1 left, +1 right. Shapes are authored for the left ear and mirrored.
  const m = side < 0 ? '' : 'transform="translate(100 0) scale(-1 1)"';
  const c = spec.ear, inner = spec.earInner || '#f7b4c2';
  switch (spec.ears) {
    case 'pointy':
      return `<g ${m}><path d="M22 44 L26 8 L50 30 Z" fill="${c}"/><path d="M27 38 L29 18 L43 30 Z" fill="${inner}" opacity=".75"/></g>`;
    case 'bigpointy':
      return `<g ${m}><path d="M18 46 L20 2 L52 28 Z" fill="${c}"/><path d="M25 40 L26 14 L45 30 Z" fill="${inner}" opacity=".75"/></g>`;
    case 'bat':
      return `<g ${m}><ellipse cx="22" cy="24" rx="13" ry="21" fill="${c}"/><ellipse cx="23" cy="26" rx="7" ry="13" fill="${inner}" opacity=".7"/></g>`;
    case 'folded':
      return `<g ${m}><path d="M22 34 Q14 44 22 58 L38 44 Z" fill="${c}"/></g>`;
    case 'semi':
      return `<g ${m}><path d="M20 40 L24 10 L48 26 Q40 38 30 44 Z" fill="${c}"/><path d="M26 32 L28 20 L40 28 Z" fill="${inner}" opacity=".6"/></g>`;
    case 'long':
      return `<g ${m}><path d="M26 34 Q4 48 10 82 Q16 96 28 88 Q38 70 34 44 Z" fill="${c}"/></g>`;
    case 'bunny':
      return `<g ${m}><path d="M30 44 Q10 10 28 -4 Q40 2 42 40 Z" fill="${spec.fur}"/><path d="M32 38 Q22 14 30 4 Q36 8 38 36 Z" fill="${c}"/></g>`;
    case 'floppy':
    default:
      return `<g ${m}><path d="M27 32 Q6 42 12 72 Q18 86 30 78 Q40 64 36 40 Z" fill="${c}"/></g>`;
  }
}

function markings(spec) {
  let s = '';
  if (spec.mask === 'cream') s += `<path d="M24 52 Q50 36 76 52 Q78 78 50 88 Q22 78 24 52 Z" fill="${spec.muzzle}"/>`;
  if (spec.mask === 'husky') s += `<path d="M28 44 Q50 30 72 44 L76 70 Q50 92 24 70 Z" fill="${spec.muzzle}"/><path d="M40 24 Q50 40 60 24 Q50 30 40 24Z" fill="${spec.muzzle}" opacity=".9"/>`;
  if (spec.mask === 'dark') s += `<path d="M30 60 Q50 44 70 60 Q72 80 50 86 Q28 80 30 60 Z" fill="${spec.muzzle}"/>`;
  if (spec.blaze) s += `<path d="M44 20 Q50 60 56 20 Q50 24 44 20 Z M38 56 Q50 66 62 56 Q66 80 50 88 Q34 80 38 56 Z" fill="${spec.muzzle}"/>`;
  if (spec.patch) s += `<ellipse cx="63" cy="46" rx="11" ry="12" fill="${spec.ear}" opacity=".9"/>`;
  if (spec.spots) s += `<g fill="${spec.ear}"><circle cx="30" cy="38" r="3.5"/><circle cx="70" cy="34" r="3"/><circle cx="60" cy="82" r="2.5"/><circle cx="36" cy="76" r="3"/><circle cx="52" cy="26" r="2.2"/><circle cx="74" cy="60" r="2.4"/></g>`;
  if (spec.wrinkle) s += `<path d="M40 36 Q50 32 60 36" stroke="${spec.ear}" stroke-width="2" fill="none" opacity=".5" stroke-linecap="round"/>`;
  if (spec.fluffy) s += `<g fill="${spec.fur}"><circle cx="34" cy="22" r="10"/><circle cx="50" cy="16" r="11"/><circle cx="66" cy="22" r="10"/></g>`;
  return s;
}

function accessory(spec) {
  const a = spec.acc;
  switch (spec.accessory) {
    case 'collar': return `<path d="M20 84 Q50 100 80 84 L80 90 Q50 106 20 90 Z" fill="${a}"/><circle cx="50" cy="96" r="4" fill="#ffd166" stroke="#c9a227" stroke-width="1"/>`;
    case 'bandana': return `<path d="M22 82 Q50 96 78 82 L50 108 Z" fill="${a}"/><path d="M34 90 L50 104 L66 90" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6"/>`;
    case 'bow': return `<g transform="translate(71 31) scale(.9)"><path d="M0 0 L-14 -8 L-14 8 Z" fill="${a}"/><path d="M0 0 L14 -8 L14 8 Z" fill="${a}"/><circle r="3.5" fill="#fff" opacity=".9"/></g>`;
    case 'santa': return `<path d="M20 34 Q46 -8 80 26 L84 38 Q50 30 16 42 Z" fill="${a}"/><path d="M14 40 Q50 26 86 36 Q88 46 84 48 Q50 36 16 50 Q10 46 14 40Z" fill="#fff"/><circle cx="82" cy="22" r="7" fill="#fff"/>`;
    case 'ghost': return `<path d="M14 54 Q14 10 50 10 Q86 10 86 54 L86 92 Q80 86 74 94 Q68 86 62 94 Q56 86 50 94 Q44 86 38 94 Q32 86 26 94 Q20 86 14 92 Z" fill="#fff" stroke="#e6e1ff" stroke-width="2"/><ellipse cx="38" cy="46" rx="6" ry="8" fill="#333"/><ellipse cx="62" cy="46" rx="6" ry="8" fill="#333"/><circle cx="40" cy="43" r="2" fill="#fff"/><circle cx="64" cy="43" r="2" fill="#fff"/><path d="M42 66 Q50 74 58 66" stroke="#333" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    case 'heart': return `<path d="M22 82 Q50 96 78 82 L50 108 Z" fill="${a}"/><path d="M50 100 l-6 -6 a3.5 3.5 0 0 1 6 -4 a3.5 3.5 0 0 1 6 4 z" fill="#fff"/>`;
    case 'clover': return `<g transform="translate(76 22) scale(1.1)"><circle cx="-4" cy="-4" r="4.5" fill="${a}"/><circle cx="4" cy="-4" r="4.5" fill="${a}"/><circle cx="-4" cy="4" r="4.5" fill="${a}"/><circle cx="4" cy="4" r="4.5" fill="${a}"/><path d="M0 2 L2 12" stroke="${a}" stroke-width="2" stroke-linecap="round"/></g>`;
    case 'shades': return `<g><rect x="25" y="41" width="22" height="13" rx="5" fill="#222"/><rect x="53" y="41" width="22" height="13" rx="5" fill="#222"/><path d="M47 46 L53 46" stroke="#222" stroke-width="3"/><path d="M28 44 L40 44" stroke="#fff" stroke-width="1.5" opacity=".5"/></g>`;
    case 'leaf': return `<path d="M20 84 Q50 100 80 84 L80 90 Q50 106 20 90 Z" fill="#6b4423"/><g transform="translate(50 96) scale(.5)"><path d="M0 -14 L4 -6 L12 -8 L8 0 L14 6 L4 6 L0 16 L-4 6 L-14 6 L-8 0 L-12 -8 L-4 -6 Z" fill="${a}"/></g>`;
    default: return '';
  }
}

/**
 * Draw a pup. opts.body = full sitting body (mascot/collection); otherwise just the face token.
 * opts.mood: 'happy' | 'excited' | 'sad' | 'sleepy' | 'think'. opts.cls extra classes.
 */
export function pupSvg(spec, opts = {}) {
  const mood = opts.mood || 'happy';
  const eye = spec.eyes || '#2b2118';
  const ghost = spec.accessory === 'ghost';
  const face = `
    <g class="pup-ears">${earShapes(spec, -1)}${earShapes(spec, 1)}</g>
    <circle class="pup-head" cx="50" cy="52" r="35" fill="${spec.fur}"/>
    ${spec.mask || spec.blaze ? '' : `<ellipse cx="50" cy="66" rx="19" ry="15" fill="${spec.muzzle}"/>`}
    ${markings(spec)}
    <g class="pup-cheeks" fill="#ff8da1" opacity=".35"><circle cx="30" cy="62" r="6"/><circle cx="70" cy="62" r="6"/></g>
    <g class="pup-eyes">
      <g class="pup-eye"><circle cx="38" cy="48" r="5.2" fill="${eye}"/><circle cx="40" cy="46" r="1.8" fill="#fff"/></g>
      <g class="pup-eye"><circle cx="62" cy="48" r="5.2" fill="${eye}"/><circle cx="64" cy="46" r="1.8" fill="#fff"/></g>
    </g>
    <g class="pup-brows" stroke="${spec.brows || spec.ear}" stroke-width="2.5" stroke-linecap="round" fill="none">
      <path class="brow-l" d="M31 38 Q37 35 43 38"/><path class="brow-r" d="M57 38 Q63 35 69 38"/>
    </g>
    <path class="pup-nose" d="M43 60 Q50 55 57 60 Q55 68 50 69 Q45 68 43 60 Z" fill="${spec.nose}"/>
    <circle cx="47" cy="60" r="1.5" fill="#fff" opacity=".6"/>
    <g class="pup-mouth">
      <path class="m-happy" d="M42 70 Q46 76 50 71 Q54 76 58 70" stroke="${spec.nose}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <g class="m-excited"><path d="M40 70 Q50 86 60 70 Z" fill="#5a2a2a"/><ellipse cx="50" cy="78" rx="5" ry="5" fill="#ff7b9c"/></g>
      <path class="m-sad" d="M43 76 Q50 70 57 76" stroke="${spec.nose}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path class="m-think" d="M44 73 Q50 71 56 74" stroke="${spec.nose}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>
    ${accessory(spec)}
    ${ghost ? '' : ''}`;
  if (!opts.body) {
    return `<svg class="pup ${opts.cls || ''}" data-mood="${mood}" viewBox="0 -10 100 122" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(spec.name)}" role="img">${face}</svg>`;
  }
  // sitting body: tail, body, paws, then the face on top
  return `<svg class="pup pup-body ${opts.cls || ''}" data-mood="${mood}" viewBox="0 -10 120 160" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(spec.name)}" role="img">
    <g class="pup-tail"><path d="M92 112 q20 -4 16 -30" stroke="${spec.fur}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M92 112 q20 -4 16 -30" stroke="${spec.muzzle}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/></g>
    <ellipse cx="60" cy="118" rx="32" ry="24" fill="${spec.fur}"/>
    <ellipse cx="60" cy="124" rx="18" ry="14" fill="${spec.muzzle}" opacity=".9"/>
    <g class="pup-paws" fill="${spec.fur}"><ellipse cx="42" cy="140" rx="10" ry="6"/><ellipse cx="78" cy="140" rx="10" ry="6"/></g>
    <g class="pup-toes" fill="${spec.nose}" opacity=".35"><circle cx="38" cy="141" r="1.6"/><circle cx="43" cy="142" r="1.6"/><circle cx="48" cy="141" r="1.6"/><circle cx="72" cy="141" r="1.6"/><circle cx="77" cy="142" r="1.6"/><circle cx="82" cy="141" r="1.6"/></g>
    <g class="pup-face" transform="translate(10 0) scale(1)">${face}</g>
  </svg>`;
}

/** A silhouette card for locked pups. */
export function lockedPupSvg() {
  return `<svg class="pup pup-locked" viewBox="0 -10 100 122" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M27 32 Q6 42 12 72 Q18 86 30 78 Q40 64 36 40 Z" fill="#b9b2c8"/><g transform="translate(100 0) scale(-1 1)"><path d="M27 32 Q6 42 12 72 Q18 86 30 78 Q40 64 36 40 Z" fill="#b9b2c8"/></g>
    <circle cx="50" cy="52" r="35" fill="#cbc4d9"/><text x="50" y="62" text-anchor="middle" font-size="30" fill="#8d85a3">?</text></svg>`;
}

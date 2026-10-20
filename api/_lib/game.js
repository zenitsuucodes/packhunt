// Hunt rules: what the player can see, unlocked clues, and card rolls.
import crypto from 'node:crypto';
import { dist, bearing, compass, SEE_RANGE, NEAR_RANGE, HINT_EVERY, MAX_HINTS } from '../../js/geo.js';

export const HUNT_TTL = 3 * 60 * 60 * 1000;

const RARITIES = [
  { rarity: 'COMMON', pts: 10, weight: 60 },
  { rarity: 'UNCOMMON', pts: 25, weight: 25 },
  { rarity: 'RARE', pts: 60, weight: 11 },
  { rarity: 'HOLO', pts: 150, weight: 4 },
];
const TYPES = ['FIRE', 'WATER', 'GRASS', 'SPARK', 'SHADE', 'STONE'];
const NAMES = ['Blazepup', 'Voltoad', 'Mossling', 'Aquafin', 'Rockmole', 'Zephkit', 'Frostail', 'Gloomoth',
  'Sparrowl', 'Thornox', 'Puddlex', 'Cindereel', 'Boulderbun', 'Mistwing', 'Pebblepaw', 'Fizzlynx',
  'Embercub', 'Driftkoi', 'Sproutle', 'Shadowisp', 'Quartzle', 'Gustling', 'Lumoth', 'Brambear'];

const pick = (a) => a[crypto.randomInt(a.length)];

export function rollCard(golden) {
  const seed = crypto.randomInt(2 ** 31);
  if (golden) return { name: pick(NAMES), type: 'LEGEND', rarity: 'GOLDEN', pts: 500, seed };
  let r = crypto.randomInt(100);
  const tier = RARITIES.find((x) => (r -= x.weight) < 0) || RARITIES[0];
  return { name: pick(NAMES), type: pick(TYPES), rarity: tier.rarity, pts: tier.pts, seed };
}

export function validPos(b) {
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Street View click-to-go can jump far, so only reject clearly impossible moves.
export function tooFast(st, pos, now) {
  const dt = Math.max(0, (now - st.lp.t) / 1000);
  return dist(st.lp, pos) > 150 + 30 * dt;
}

// Everything the client is allowed to know right now.
export function view(st, pos, now) {
  const elapsed = Math.floor((now - st.t0) / 1000);
  const level = Math.min(MAX_HINTS, 1 + Math.floor(elapsed / HINT_EVERY) + st.hb);
  const nextIn = level >= MAX_HINTS ? null : HINT_EVERY - (elapsed % HINT_EVERY);
  const gold = st.p.find((p) => p.g);
  const gd = Math.round(dist(pos, gold));

  const visible = [];
  let near = false;
  for (const p of st.p) {
    if (p.o) continue;
    const d = dist(pos, p);
    if (d < SEE_RANGE) visible.push({ id: p.id, lat: p.lat, lng: p.lng, gold: Boolean(p.g) });
    else if (d < NEAR_RANGE) near = true;
  }

  const hints = [];
  const band = Math.max(50, Math.round(dist(st.s, gold) / 50) * 50);
  hints.push({ icon: 'compass', text: `The Golden pack hides ${compass(bearing(st.s, gold))} of where you landed, about ${band}m away.` });
  if (level >= 2) {
    hints.push({
      icon: 'pin',
      text: !st.lm ? 'No famous landmarks around it. Keep your eyes peeled!'
        : st.lm.kind ? `It's within 100m of a ${st.lm.kind} called "${st.lm.name}".`
          : `It's within 150m of "${st.lm.name}".`,
    });
  }
  if (level >= 3) {
    const trend = st.gd == null || Math.abs(gd - st.gd) < 2 ? '' : gd < st.gd ? 'warmer' : 'colder';
    hints.push({ icon: 'radar', radar: { metres: gd, trend } });
  }
  if (level >= 4) hints.push({ icon: 'photo', photo: st.ph ? `/api/photo?p=${st.ph}` : null });
  if (level >= 5) hints.push({ icon: 'sign', text: st.sn ? `It's on ${st.sn}.` : 'This street has no name. Trust the radar!' });

  return {
    visible, near, hints, level, nextIn, elapsed,
    found: st.p.filter((p) => p.o).length, total: st.p.length, score: st.sc, done: Boolean(st.done),
    goldDist: gd,
  };
}

// Hunt rules: what the player can see, unlocked clues, timers and card rolls.
import crypto from 'node:crypto';
import { dist, bearing, compass, NEAR_RANGE, MAX_HINTS } from '../../js/geo.js';
// Real card pool built by scripts/build-cards.mjs.
import cards from '../../data/cards.json' with { type: 'json' };
import sets from '../../data/sets.json' with { type: 'json' };

export const HUNT_TTL = 3 * 60 * 60 * 1000;

// POOL[set][tier] -> cards
const POOL = {};
for (const c of cards) ((POOL[c.set] ||= {})[c.t] ||= []).push(c);
const SET_IDS = sets.map((s) => s.id);
const GOLDEN_SETS = sets.filter((s) => s.golden).map((s) => s.id);

// Normal packs: weighted tiers, with a tiny chance of a golden-tier pull.
const TIERS = [
  { tier: 'COMMON', pts: 10, weight: 55 },
  { tier: 'UNCOMMON', pts: 25, weight: 25 },
  { tier: 'RARE', pts: 60, weight: 13 },
  { tier: 'HOLO', pts: 150, weight: 6 },
  { tier: 'GOLDEN', pts: 500, weight: 1 },
];

const pick = (a) => a[crypto.randomInt(a.length)];

export const pickSet = (golden) => pick(golden ? GOLDEN_SETS : SET_IDS);

// A card of this tier from this set, stepping down a tier if the set has none (old sets have no golden tier).
export function cardOfTier(name, setId = pickSet(name === 'GOLDEN')) {
  let i = Math.max(0, TIERS.findIndex((t) => t.tier === name));
  const set = POOL[setId] ? setId : pickSet(false);
  while (i > 0 && !POOL[set][TIERS[i].tier]) i--;
  const tier = TIERS[i];
  const c = pick(POOL[set][tier.tier]);
  return {
    id: c.id, name: c.n, set: c.s, rarity: c.r, tier: tier.tier, img: c.i, pts: tier.pts,
    foil: tier.tier === 'HOLO' || tier.tier === 'GOLDEN',
  };
}

export function rollCard(setId, golden) {
  if (golden) return cardOfTier('GOLDEN', setId);
  let r = crypto.randomInt(100);
  return cardOfTier((TIERS.find((x) => (r -= x.weight) < 0) || TIERS[0]).tier, setId);
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

export const expired = (st, now) => Boolean(st.r.limit && !st.done && now - st.t0 > st.r.limit * 1000);

// Everything the client is allowed to know right now.
export function view(st, pos, now) {
  const r = st.r;
  const elapsed = Math.floor((now - st.t0) / 1000);
  const level = Math.min(MAX_HINTS, 1 + Math.floor(elapsed / r.hint) + st.hb);
  const nextIn = level >= MAX_HINTS ? null : r.hint - (elapsed % r.hint);
  const gold = st.p.find((p) => p.g);
  const gd = Math.round(dist(pos, gold));

  const visible = [];
  let near = false;
  for (const p of st.p) {
    if (p.o) continue;
    const d = dist(pos, p);
    if (d < (p.g ? r.gsee : r.see)) visible.push({ id: p.id, lat: p.lat, lng: p.lng, gold: Boolean(p.g), set: p.set });
    else if (d < NEAR_RANGE && !p.g) near = true;
  }

  const hints = [];
  const band = Math.max(100, Math.round(dist(st.s, gold) / 100) * 100);
  hints.push({ icon: 'compass', text: `The Golden pack hides roughly ${compass(bearing(st.s, gold))} of where you landed, about ${band}m away.` });
  if (level >= 2) {
    hints.push({
      icon: 'pin',
      text: !r.landmark ? 'The locals keep quiet here. No landmark clue in this challenge.'
        : !st.lm ? 'No famous landmarks around it. Keep your eyes peeled!'
          : st.lm.d ? `It's about ${st.lm.d}m from ${st.lm.kind === 'place' ? '' : `the ${st.lm.kind} `}"${st.lm.name}".`
          : st.lm.kind ? `It's within 100m of a ${st.lm.kind} called "${st.lm.name}".`
            : `It's within 150m of "${st.lm.name}".`,
    });
  }
  if (level >= 3) {
    const trend = st.gd == null || Math.abs(gd - st.gd) < 2 ? '' : gd < st.gd ? 'warmer' : 'colder';
    hints.push({ icon: 'radar', radar: { metres: level >= 5 ? gd : null, trend } });
  }
  if (level >= 4) {
    hints.push(r.photo
      ? { icon: 'photo', photo: st.ph ? `/api/photo?p=${st.ph}` : null }
      : { icon: 'photo', text: 'No photo clue in this challenge.' });
  }
  if (level >= 5) hints.push({ icon: 'sign', text: st.sn ? `It's on ${st.sn}.` : 'This street has no name. Trust the radar!' });

  return {
    visible, near, hints, level, nextIn, elapsed,
    timeLeft: r.limit ? Math.max(0, r.limit - elapsed) : null,
    expired: expired(st, now),
    found: st.p.filter((p) => p.o).length, total: st.p.length, score: st.sc, done: Boolean(st.done),
    goldDist: gd,
  };
}

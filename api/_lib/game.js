// Hunt rules: what the player can see, unlocked clues, and card rolls.
import crypto from 'node:crypto';
import { dist, bearing, compass, SEE_RANGE, NEAR_RANGE, HINT_EVERY, MAX_HINTS } from '../../js/geo.js';

export const HUNT_TTL = 3 * 60 * 60 * 1000;

// Real card pool built by scripts/build-cards.mjs.
import cards from '../../data/cards.json' with { type: 'json' };

const POOL = {};
for (const c of cards) (POOL[c.t] ||= []).push(c);

// Normal packs: weighted tiers, with a tiny chance of a golden-tier pull.
const TIERS = [
  { tier: 'COMMON', pts: 10, weight: 55 },
  { tier: 'UNCOMMON', pts: 25, weight: 25 },
  { tier: 'RARE', pts: 60, weight: 13 },
  { tier: 'HOLO', pts: 150, weight: 6 },
  { tier: 'GOLDEN', pts: 500, weight: 1 },
];

const pick = (a) => a[crypto.randomInt(a.length)];

export function cardOfTier(name) {
  const tier = TIERS.find((t) => t.tier === name) || TIERS[0];
  const c = pick(POOL[tier.tier]);
  return {
    id: c.id, name: c.n, set: c.s, rarity: c.r, tier: tier.tier, img: c.i, pts: tier.pts,
    foil: tier.tier === 'HOLO' || tier.tier === 'GOLDEN',
  };
}

export function rollCard(golden) {
  if (golden) return cardOfTier('GOLDEN');
  let r = crypto.randomInt(100);
  return cardOfTier((TIERS.find((x) => (r -= x.weight) < 0) || TIERS[0]).tier);
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

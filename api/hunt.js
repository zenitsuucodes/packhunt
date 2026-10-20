// POST /api/hunt {challenge} or {lat, lng} (+ optional wallet session) -> start a new solo hunt.
import { dist, offset } from '../js/geo.js';
import { CHALLENGES, WILD_RULES, rulesFor } from '../js/challenges.js';
import { seal, unseal, snap, admit, clientIp, landmarks } from './_lib/server.js';
import { view, validPos, pickSet } from './_lib/game.js';

// Up to `count` Street View spots between min and max metres from start.
async function findSpots(start, count, min, max, avoid) {
  const found = [];
  for (let round = 0; round < 4 && found.length < count; round++) {
    const tries = Array.from({ length: 10 }, () => offset(start, min + Math.random() * (max - min), Math.random() * 360));
    for (const s of await Promise.all(tries.map((p) => snap(p, 40)))) {
      if (!s || found.length >= count) continue;
      const d = dist(s, start);
      if (d < min * 0.85 || d > max * 1.15) continue;
      if ([...avoid, ...found].some((f) => dist(f, s) < 40 || (s.pano && f.pano === s.pano))) continue;
      found.push(s);
    }
  }
  return found;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const challenge = req.body?.challenge ? CHALLENGES.find((c) => c.id === req.body.challenge) : null;
  if (req.body?.challenge && !challenge) return res.status(400).json({ error: 'Unknown challenge.' });
  const at = challenge ? { lat: challenge.lat, lng: challenge.lng } : validPos(req.body);
  if (!at) return res.status(400).json({ error: 'Bad location.' });
  const rules = challenge ? rulesFor(challenge.id) : WILD_RULES;

  const gate = await admit(clientIp(req));
  if (!gate.ok) return res.status(429).json({ error: gate.reason });

  const start = await snap(at, challenge ? 300 : 3000);
  if (!start) return res.status(404).json({ error: 'No Street View near there. Try closer to a road!' });

  const [goldSpot] = await findSpots(start, 1, rules.gmin, rules.gmax, [start]);
  if (!goldSpot) return res.status(422).json({ error: 'Not enough streets here to hide packs. Try somewhere busier!' });
  const normals = await findSpots(start, rules.normals, 60, rules.gmax * 0.8, [start, goldSpot]);
  const spots = [goldSpot, ...normals];
  const { street, landmark } = await landmarks(goldSpot);

  const now = Date.now();
  const packs = spots.map((s, i) => {
    // Nudge each pack a few metres off the camera spot so it is visible from the street.
    const side = offset(s, 3.5, Math.random() * 360);
    // pn/sl/sg: the panorama the pack is seen from, for the "found at" photo.
    return { id: i, g: i === 0 ? 1 : 0, set: pickSet(i === 0), lat: side.lat, lng: side.lng, o: 0, pn: s.pano, sl: s.lat, sg: s.lng };
  });
  const gold = packs[0];
  const wallet = unseal(req.body?.wallet);
  const st = {
    c: challenge?.id || null,
    r: rules,
    w: wallet && wallet.exp > now ? wallet.w : null,
    s: { lat: start.lat, lng: start.lng },
    p: packs,
    t0: now,
    lp: { lat: start.lat, lng: start.lng, t: now },
    hb: 0,
    gd: null,
    sc: 0,
    lm: landmark,
    sn: street,
    ph: goldSpot.pano ? seal({ pano: goldSpot.pano, from: goldSpot, to: { lat: gold.lat, lng: gold.lng } }) : null,
    done: 0,
  };
  const v = view(st, start, now);
  st.gd = v.goldDist;
  return res.status(200).json({
    token: seal(st), start: { ...st.s, pano: start.pano }, challenge: challenge?.id || null, wallet: st.w, ...v,
  });
}

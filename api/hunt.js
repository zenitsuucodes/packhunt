// POST /api/hunt {lat, lng} -> start a new solo hunt near that point.
import { dist, offset } from '../js/geo.js';
import { seal, snap, admit, clientIp, landmarks } from './_lib/server.js';
import { view, validPos } from './_lib/game.js';

async function findSpots(start) {
  const found = [];
  for (let round = 0; round < 3 && found.length < 5; round++) {
    const tries = Array.from({ length: 10 }, () =>
      offset(start, 60 + Math.random() * (160 + round * 90), Math.random() * 360));
    const snaps = await Promise.all(tries.map((p) => snap(p, 40)));
    for (const s of snaps) {
      if (!s || found.length >= 5 || dist(s, start) < 45) continue;
      if (found.some((f) => dist(f, s) < 40 || (s.pano && f.pano === s.pano))) continue;
      found.push(s);
    }
  }
  return found;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const at = validPos(req.body);
  if (!at) return res.status(400).json({ error: 'Bad location.' });

  const gate = await admit(clientIp(req));
  if (!gate.ok) return res.status(429).json({ error: gate.reason });

  const start = await snap(at, 3000);
  if (!start) return res.status(404).json({ error: 'No Street View near there. Try closer to a road!' });

  const spots = await findSpots(start);
  if (spots.length < 3) return res.status(422).json({ error: 'Not enough streets here to hide packs. Try somewhere busier!' });

  // The furthest spot holds the Golden pack.
  spots.sort((a, b) => dist(b, start) - dist(a, start));
  const goldSpot = spots[0];
  const { street, landmark } = await landmarks(goldSpot);

  const now = Date.now();
  const packs = spots.map((s, i) => {
    // Nudge each pack a few metres off the camera spot so it is visible from the street.
    const side = offset(s, 3.5, Math.random() * 360);
    return { id: i, g: i === 0 ? 1 : 0, lat: side.lat, lng: side.lng, o: 0 };
  });
  const gold = packs[0];
  const st = {
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
  return res.status(200).json({ token: seal(st), start: { ...st.s, pano: start.pano }, ...v });
}

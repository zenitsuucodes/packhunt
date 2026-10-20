// POST /api/open {token, packId, lat, lng} -> rip a nearby pack; the card is rolled here.
import { dist, SEE_RANGE } from '../js/geo.js';
import { seal, unseal } from './_lib/server.js';
import { view, validPos, tooFast, rollCard, HUNT_TTL } from './_lib/game.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const st = unseal(req.body?.token);
  const now = Date.now();
  if (!st || now - st.t0 > HUNT_TTL) return res.status(410).json({ error: 'This hunt has expired. Start a new one!' });
  const pos = validPos(req.body);
  if (!pos || tooFast(st, pos, now)) return res.status(400).json({ error: 'Bad location.' });

  const pack = st.p.find((p) => p.id === Number(req.body.packId));
  if (!pack) return res.status(404).json({ error: 'That pack does not exist.' });
  if (pack.o) return res.status(409).json({ error: 'Already opened!' });
  if (dist(pos, pack) > SEE_RANGE + 10) return res.status(403).json({ error: 'Get closer to the pack!' });

  pack.o = 1;
  const card = rollCard(Boolean(pack.g));
  st.sc += card.pts;
  if (pack.g) {
    st.done = 1;
    st.ft = Math.floor((now - st.t0) / 1000);
  } else {
    st.hb += 1; // normal packs unlock the next clue early
  }
  st.lp = { ...pos, t: now };
  const v = view(st, pos, now);
  st.gd = v.goldDist;
  return res.status(200).json({ token: seal(st), card, bonusHint: !pack.g, finishTime: st.ft ?? null, ...v });
}

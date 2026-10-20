// POST /api/move {token, lat, lng} -> what's visible from the player's Street View spot.
import { seal, unseal } from './_lib/server.js';
import { view, validPos, tooFast, expired, HUNT_TTL } from './_lib/game.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const st = unseal(req.body?.token);
  const now = Date.now();
  if (!st || now - st.t0 > HUNT_TTL) return res.status(410).json({ error: 'This hunt has expired. Start a new one!' });
  const pos = validPos(req.body);
  if (!pos) return res.status(400).json({ error: 'Bad location.' });
  if (expired(st, now)) return res.status(200).json({ token: req.body.token, ...view(st, st.lp, now) });

  if (tooFast(st, pos, now)) {
    return res.status(409).json({ error: 'Whoa, too fast! Walk there instead.', token: req.body.token, ...view(st, st.lp, now) });
  }
  const v = view(st, pos, now);
  st.lp = { ...pos, t: now };
  st.gd = v.goldDist;
  return res.status(200).json({ token: seal(st), ...v });
}

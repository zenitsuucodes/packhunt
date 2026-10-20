// GET /api/card?tier=HOLO -> a random card, used by the ?demo pack opening.
import { cardOfTier } from './_lib/game.js';

export default function handler(req, res) {
  const tier = String(req.query?.tier || 'COMMON').toUpperCase();
  return res.status(200).json({ card: cardOfTier(tier) });
}

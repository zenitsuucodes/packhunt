// GET /api/leaderboard -> this week's top wallets by total score.
import { HAS_REDIS, weekKey, topScores } from './_lib/server.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  const week = weekKey();
  if (!HAS_REDIS) return res.status(200).json({ enabled: false, week, top: [] });
  try {
    return res.status(200).json({ enabled: true, week, top: await topScores(`lb:${week}`) });
  } catch {
    return res.status(200).json({ enabled: false, week, top: [] });
  }
}

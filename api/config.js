// GET /api/config -> public settings for the browser.
import { MOCK, HAS_REDIS } from './_lib/server.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    browserKey: process.env.MAPS_BROWSER_KEY || '',
    mock: MOCK,
    limits: HAS_REDIS,
  });
}

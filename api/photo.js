// GET /api/photo?p=<sealed> -> Street View photo of the Golden pack's hiding spot.
// Proxied so the server key never reaches the browser.
import { bearing } from '../js/geo.js';
import { unseal, MOCK, SERVER_KEY, googleHeaders } from './_lib/server.js';

export default async function handler(req, res) {
  const spot = unseal(req.query?.p);
  if (!spot || MOCK) return res.status(404).json({ error: 'No photo' });
  const u = new URL('https://maps.googleapis.com/maps/api/streetview');
  u.search = new URLSearchParams({
    size: spot.big ? '640x400' : '480x300', pano: spot.pano, heading: String(Math.round(bearing(spot.from, spot.to))),
    fov: '75', pitch: '-8', key: SERVER_KEY,
  });
  try {
    const r = await fetch(u, { headers: googleHeaders, signal: AbortSignal.timeout(6000) });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
  } catch {
    return res.status(502).json({ error: 'Photo unavailable' });
  }
}

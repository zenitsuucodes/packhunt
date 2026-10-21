// GET /api/hero -> Google Street View panoramas at famous spots for the title-screen loop.
import { metadata, MOCK } from './_lib/server.js';

const SPOTS = [
  { name: 'TIMES SQUARE, NEW YORK', lat: 40.7580, lng: -73.9855, heading: 20 },
  { name: 'SHIBUYA CROSSING, TOKYO', lat: 35.6593, lng: 139.7008, heading: 330 },
  { name: 'EIFFEL TOWER, PARIS', lat: 48.8565, lng: 2.2968, heading: 315 },
  { name: 'COLOSSEUM, ROME', lat: 41.8910, lng: 12.4905, heading: 120 },
  { name: 'WESTMINSTER, LONDON', lat: 51.5008, lng: -0.1219, heading: 290 },
  { name: 'NYHAVN, COPENHAGEN', lat: 55.6798, lng: 12.5904, heading: 90 },
];

export default async function handler(req, res) {
  if (MOCK) return res.status(200).json([]);
  // Any outdoor panorama works here (including fan photo spheres): nobody walks around in it.
  const found = await Promise.all(SPOTS.map(async (s) => {
    const j = (await metadata(s, 30, 'outdoor')) || (await metadata(s, 80, 'outdoor'));
    return j ? { name: s.name, heading: s.heading, pano: j.pano_id, lat: j.location.lat, lng: j.location.lng } : null;
  }));
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(found.filter(Boolean));
}

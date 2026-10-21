// GET /api/search?q=eiffel tower -> up to 5 matching places (OpenStreetMap Nominatim, free).
export default async function handler(req, res) {
  const q = String(req.query?.q || '').trim().slice(0, 120);
  if (q.length < 2) return res.status(200).json([]);
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Packhunt/0.1 (personal game; github.com/zenitsuucodes/packhunt)' },
      signal: AbortSignal.timeout(5000),
    });
    const list = await r.json();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(list.map((p) => ({ name: p.display_name, lat: Number(p.lat), lng: Number(p.lon) })));
  } catch {
    return res.status(200).json([]);
  }
}

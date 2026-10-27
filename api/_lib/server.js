// Shared server helpers: sealed hunt tokens, Google Street View metadata,
// Upstash Redis admission limits and OpenStreetMap landmark lookups.
import crypto from 'node:crypto';

// ---------- sealed tokens (AES-256-GCM) ----------
const KEY = crypto.createHash('sha256').update(process.env.TOKEN_SECRET || 'packhunt-dev-secret').digest();

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

export function unseal(token) {
  try {
    const b = Buffer.from(String(token), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

// ---------- Google Street View metadata (free, unlimited) ----------
// One website-restricted key can do everything: the server sends the site's URL as the
// Referer so Google accepts it. A separate unrestricted server key is optional.
export const SERVER_KEY = process.env.MAPS_SERVER_KEY || process.env.MAPS_BROWSER_KEY || '';
export const MOCK = !SERVER_KEY;
export const googleHeaders = { Referer: process.env.SITE_URL || 'http://localhost:5200/' };

export async function metadata(p, radius, source) {
  const u = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
  u.search = new URLSearchParams({ location: `${p.lat},${p.lng}`, radius: String(radius), source, key: SERVER_KEY });
  try {
    const r = await fetch(u, { headers: googleHeaders, signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j.status === 'OK' && j.location ? j : null;
  } catch {
    return null;
  }
}

// Snap a point to the nearest outdoor, Google-made Street View panorama.
// "outdoor" skips indoor spots like stations but can return fan photo spheres;
// "google" skips fan photos but can return indoor spots. Prefer a result that is both.
export async function snap(p, radius) {
  if (MOCK) return { lat: p.lat, lng: p.lng, pano: null };
  const isGoogle = (j) => j && (!j.copyright || /google/i.test(j.copyright));
  let j = await metadata(p, radius, 'outdoor');
  if (!isGoogle(j)) j = await metadata(p, radius, 'google');
  if (!isGoogle(j)) return null;
  return { lat: j.location.lat, lng: j.location.lng, pano: j.pano_id };
}

// ---------- Upstash Redis (REST) ----------
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
export const HAS_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

async function redis(...cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(4000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// Every new hunt creates one billed Street View load, so cap hunts per IP per day
// and per month overall. Fails closed when Redis is configured but unreachable.
export async function admit(ip) {
  if (!HAS_REDIS) return { ok: true };
  try {
    const day = new Date().toISOString().slice(0, 10);
    const ipKey = `ip:${day}:${ip}`;
    const n = await redis('INCR', ipKey);
    if (n === 1) await redis('EXPIRE', ipKey, 90000);
    if (n > Number(process.env.DAILY_HUNTS_PER_IP || 10)) {
      return { ok: false, reason: "You've hit today's hunt limit. Come back tomorrow!" };
    }
    const m = await redis('INCR', `cap:${day.slice(0, 7)}`);
    if (m > Number(process.env.MONTHLY_HUNT_CAP || 4500)) {
      return { ok: false, reason: 'All expeditions are full this month. Check back soon!' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'The server is busy. Try again in a minute.' };
  }
}

// ---------- weekly leaderboard (wallet -> total score from finished hunts) ----------
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function recordScore(wallet, score) {
  if (!HAS_REDIS) return false;
  try {
    await redis('ZINCRBY', `lb:${weekKey()}`, score, wallet);
    await redis('ZINCRBY', 'lb:all', score, wallet);
    await redis('HINCRBY', `hunts:${weekKey()}`, wallet, 1);
    return true;
  } catch {
    return false;
  }
}

// Every card a wallet pulls, newest last (kept to the latest 2,000).
export async function recordCard(wallet, card, place, at) {
  if (!HAS_REDIS) return false;
  try {
    const entry = JSON.stringify({ id: card.id, name: card.name, set: card.set, rarity: card.rarity, tier: card.tier, place, at });
    await redis('RPUSH', `cards:${wallet}`, entry);
    await redis('LTRIM', `cards:${wallet}`, -2000, -1);
    return true;
  } catch {
    return false;
  }
}

export async function walletCards(wallet, n = 200) {
  const list = await redis('LRANGE', `cards:${wallet}`, -n, -1);
  return list.map((x) => JSON.parse(x)).reverse();
}

export async function topScores(key, n = 25) {
  const flat = await redis('ZREVRANGE', key, 0, n - 1, 'WITHSCORES');
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ wallet: flat[i], score: Number(flat[i + 1]) });
  return out;
}

// ---------- Solana wallet sign-in (ed25519 signature over a short message) ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(str) {
  let n = 0n;
  for (const ch of String(str)) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of String(str)) { if (ch !== '1') break; bytes.unshift(0); }
  return Buffer.from(bytes);
}

export function verifySolana(address, message, signatureB64) {
  try {
    const pub = base58(address);
    if (!pub || pub.length !== 32) return false;
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: pub.toString('base64url') }, format: 'jwk' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket?.remoteAddress || 'local').trim();
}

// ---------- Google Places nearby search (used to theme drop-anywhere challenges) ----------
export async function placesNearby(p, radius, max = 20) {
  if (MOCK) return [];
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        ...googleHeaders,
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': SERVER_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.primaryTypeDisplayName,places.location,places.userRatingCount',
      },
      body: JSON.stringify({
        maxResultCount: max,
        rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    return ((await r.json()).places || []).map((x) => ({
      name: x.displayName?.text,
      type: x.primaryType || '',
      kind: (x.primaryTypeDisplayName?.text || '').toLowerCase(),
      lat: x.location?.latitude,
      lng: x.location?.longitude,
      reviews: x.userRatingCount || 0,
    })).filter((x) => x.name && x.lat != null);
  } catch {
    return [];
  }
}

// ---------- "found at" place names (one lookup per opened pack) ----------
export async function placeName(p) {
  const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17&accept-language=en`;
  try {
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Packhunt/0.1 (personal game; github.com/zenitsuucodes/packhunt)' },
      signal: AbortSignal.timeout(3500),
    });
    const a = (await r.json()).address || {};
    const parts = [
      a.road || a.pedestrian || a.footway || a.square,
      a.neighbourhood || a.suburb || a.quarter,
      a.city || a.town || a.village || a.municipality || a.county,
      a.country,
    ].filter(Boolean);
    return [...new Set(parts)].join(', ') || null;
  } catch {
    return null;
  }
}

// ---------- landmarks for clues (one lookup per hunt) ----------
// The public Overpass server is often overloaded, so Wikipedia's geosearch backs it up.
export async function landmarks(p) {
  const [osm, wiki] = await Promise.all([osmLandmarks(p), wikiLandmark(p)]);
  return { street: osm.street, landmark: osm.landmark || wiki };
}

async function wikiLandmark(p) {
  const u = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${p.lat}|${p.lng}&gsradius=150&gslimit=5&format=json`;
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Packhunt/0.1 (personal game)' }, signal: AbortSignal.timeout(4000) });
    const hit = (await r.json()).query?.geosearch?.find((g) => !/outbreak|disaster|bombing|attack|murder/i.test(g.title));
    return hit ? { name: hit.title, kind: null } : null;
  } catch {
    return null;
  }
}

async function osmLandmarks(p) {
  const a = `around:100,${p.lat},${p.lng}`;
  const q = `[out:json][timeout:5];(nwr(${a})["name"]["tourism"];nwr(${a})["name"]["historic"];` +
    `nwr(${a})["name"]["leisure"];nwr(${a})["name"]["amenity"];nwr(${a})["name"]["shop"];);out tags 25;` +
    `way(around:35,${p.lat},${p.lng})["highway"]["name"];out tags 3;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Packhunt/0.1 (personal game)' },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(5000),
    });
    const els = (await r.json()).elements || [];
    const street = els.find((e) => e.tags?.highway)?.tags.name || null;
    let landmark = null;
    for (const k of ['tourism', 'historic', 'leisure', 'amenity', 'shop']) {
      const e = els.find((x) => x.tags && !x.tags.highway && x.tags[k] && x.tags[k] !== 'yes');
      if (e) { landmark = { name: e.tags.name, kind: String(e.tags[k]).replace(/_/g, ' ') }; break; }
    }
    return { street, landmark };
  } catch {
    return { street: null, landmark: null };
  }
}

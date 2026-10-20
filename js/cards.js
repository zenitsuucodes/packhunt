// Draws trading cards (with a seeded pixel creature) onto a canvas.
export const RARITY = {
  COMMON: { border: '#a8a8a8', stars: 1 },
  UNCOMMON: { border: '#58a848', stars: 2 },
  RARE: { border: '#3878f8', stars: 3 },
  HOLO: { border: '#c060f0', stars: 4 },
  GOLDEN: { border: '#f8c830', stars: 5 },
};
const TYPE = {
  FIRE: ['#f08030', '#f8d8b8'], WATER: ['#6890f0', '#c8d8f8'], GRASS: ['#78c850', '#d0f0c0'],
  SPARK: ['#f8d030', '#f8f0b8'], SHADE: ['#705898', '#dcd0f0'], STONE: ['#b8a038', '#ece4c8'],
  LEGEND: ['#f8a800', '#fff0a8'],
};
const INK = '#283040';
const FONT = '"Press Start 2P", monospace';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// Symmetric 10x10 pixel monster, unique per seed.
function creature(x, seed, cx, cy, px, color) {
  const r = rng(seed);
  const W = 10, H = 10;
  const grid = [];
  for (let y = 0; y < H; y++) {
    grid[y] = [];
    for (let i = 0; i < W / 2; i++) {
      const centre = 1 - Math.abs(y - 4.5) / 6 - (4 - i) * 0.04;
      grid[y][i] = grid[y][W - 1 - i] = r() < 0.25 + centre * 0.55;
    }
  }
  const ox = cx - (W * px) / 2;
  const oy = cy - (H * px) / 2;
  const at = (i, y) => [ox + i * px, oy + y * px];
  x.fillStyle = INK;
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    if (grid[y][i]) { const [a, b] = at(i, y); x.fillRect(a - px * 0.35, b - px * 0.35, px * 1.7, px * 1.7); }
  }
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    if (!grid[y][i]) continue;
    const [a, b] = at(i, y);
    x.fillStyle = shade(color, y < 3 ? 1.25 : y > 6 ? 0.8 : 1);
    x.fillRect(a, b, px, px);
  }
  const eyeY = 3 + Math.floor(r() * 2);
  for (const ex of [3, 6]) {
    const [a, b] = at(ex, eyeY);
    x.fillStyle = '#fff';
    x.fillRect(a, b, px, px);
    x.fillStyle = INK;
    x.fillRect(a + px * 0.4, b + px * 0.3, px * 0.5, px * 0.6);
  }
}

export function drawCard(card, w = 256) {
  const h = Math.round(w * 1.4);
  const u = w / 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const R = RARITY[card.rarity] || RARITY.COMMON;
  const [tc, tbg] = TYPE[card.type] || TYPE.STONE;

  x.fillStyle = R.border;
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#f8f8f0';
  x.fillRect(3 * u, 3 * u, w - 6 * u, h - 6 * u);

  x.fillStyle = INK;
  x.textBaseline = 'top';
  x.font = `${3.4 * u}px ${FONT}`;
  x.fillText(card.name.toUpperCase(), 5 * u, 6 * u);
  x.textAlign = 'right';
  x.fillText(String(card.pts), w - 5 * u, 6 * u);
  x.textAlign = 'left';

  const ax = 5 * u, ay = 12 * u, aw = w - 10 * u, ah = 40 * u;
  x.fillStyle = tbg;
  x.fillRect(ax, ay, aw, ah);
  x.strokeStyle = INK;
  x.lineWidth = u;
  x.strokeRect(ax, ay, aw, ah);
  creature(x, card.seed, ax + aw / 2, ay + ah / 2, Math.floor(ah / 13), tc);

  x.font = `${2.8 * u}px ${FONT}`;
  x.fillStyle = tc;
  x.fillText(card.type, 5 * u, 56 * u);
  x.fillStyle = INK;
  x.fillText(card.rarity, 5 * u, 63 * u);
  x.fillStyle = R.border;
  for (let i = 0; i < R.stars; i++) x.fillRect(5 * u + i * 6 * u, 71 * u, 4 * u, 4 * u);
  x.fillStyle = '#8898b0';
  x.font = `${2.2 * u}px ${FONT}`;
  x.fillText('PACKHUNT', 5 * u, h - 8 * u);
  return c;
}

export function drawCardBack(w = 256) {
  const h = Math.round(w * 1.4);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const u = w / 64;
  x.fillStyle = '#2850a8';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#3868c8';
  for (let y = 0; y < h; y += 8 * u) for (let i = 0; i < w; i += 8 * u) {
    if (((y + i) / (8 * u)) % 2 === 0) x.fillRect(i, y, 8 * u, 8 * u);
  }
  x.fillStyle = '#f8c830';
  x.font = `${5 * u}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('PACK', w / 2, h / 2 - 4 * u);
  x.fillText('HUNT', w / 2, h / 2 + 4 * u);
  return c;
}

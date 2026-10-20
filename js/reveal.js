// Full-screen card reveal: the real card flips in over a photo of where it was found,
// tilts with the pointer and gets a textured holo-foil layer for holo and golden pulls.
import { drawCardBack } from './cards.js';

const $ = (s) => document.querySelector(s);

export const cardImage = (c, hi = true) => `https://images.pokemontcg.io/${c.img}${hi ? '_hires' : ''}.png`;
export const TIER_COLOR = { COMMON: '#7880a0', UNCOMMON: '#3c9a48', RARE: '#3878f8', HOLO: '#b050e0', GOLDEN: '#d89a00' };

// Glitter noise for the foil texture, plus the card back.
export function installTextures() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const x = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    const a = Math.random();
    x.fillStyle = `rgba(255,255,255,${(a * a).toFixed(2)})`;
    const s = Math.random() < 0.08 ? 2 : 1;
    x.fillRect(Math.random() * 160, Math.random() * 160, s, s);
  }
  document.documentElement.style.setProperty('--glitter', `url(${c.toDataURL()})`);
  $('#pcardBack').style.backgroundImage = `url(${drawCardBack(512).toDataURL()})`;
}

export function preloadCard(card) {
  const img = new Image();
  img.src = cardImage(card);
  const timeout = new Promise((res) => setTimeout(res, 5000));
  return Promise.race([img.decode().catch(() => {}), timeout]);
}

// ---------- pointer tilt ----------
const tilt = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, last: 0, raf: 0 };

function onPointer(e) {
  const r = $('#pcard').getBoundingClientRect();
  tilt.tx = Math.min(1.2, Math.max(-0.2, (e.clientX - r.left) / r.width));
  tilt.ty = Math.min(1.2, Math.max(-0.2, (e.clientY - r.top) / r.height));
  tilt.last = performance.now();
}

function frame(t) {
  tilt.raf = requestAnimationFrame(frame);
  if (t - tilt.last > 1800) { // gentle idle wobble so the foil keeps shimmering
    tilt.tx = 0.5 + Math.sin(t / 1300) * 0.32;
    tilt.ty = 0.5 + Math.cos(t / 1800) * 0.26;
  }
  tilt.x += (tilt.tx - tilt.x) * 0.12;
  tilt.y += (tilt.ty - tilt.y) * 0.12;
  const pc = $('#pcard');
  const live = pc.classList.contains('live');
  pc.style.setProperty('--rx', `${live ? (tilt.y - 0.5) * -24 : 0}deg`);
  pc.style.setProperty('--ry', `${live ? (tilt.x - 0.5) * 28 : 0}deg`);
  pc.style.setProperty('--mx', `${tilt.x * 100}%`);
  pc.style.setProperty('--my', `${tilt.y * 100}%`);
  pc.style.setProperty('--px', `${50 + (tilt.x - 0.5) * 90}%`);
  pc.style.setProperty('--py', `${50 + (tilt.y - 0.5) * 90}%`);
}

let flipTimer;
export function showCard(card, found) {
  const pc = $('#pcard');
  pc.className = 'pcard';
  pc.classList.toggle('foil', Boolean(card.foil));
  pc.classList.toggle('golden', card.tier === 'GOLDEN');
  pc.classList.toggle('holo', card.tier === 'HOLO');
  const img = $('#pcardImg');
  img.src = cardImage(card);
  img.alt = `${card.name} (${card.set})`;

  $('#revealBg').style.backgroundImage = found?.photo ? `url("${found.photo}")` : '';
  $('#foundTag').hidden = !found;
  if (found) {
    $('#foundPlace').textContent = found.place || 'Somewhere on Earth';
    const when = new Date(found.at || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    $('#foundMeta').textContent = found.lat != null ? `${when}  ·  ${found.lat}, ${found.lng}` : when;
  }

  void pc.offsetWidth;
  requestAnimationFrame(() => pc.classList.add('flipped'));
  clearTimeout(flipTimer);
  flipTimer = setTimeout(() => pc.classList.add('live'), 1150);
  addEventListener('pointermove', onPointer);
  cancelAnimationFrame(tilt.raf);
  tilt.raf = requestAnimationFrame(frame);
}

export function hideCard() {
  removeEventListener('pointermove', onPointer);
  cancelAnimationFrame(tilt.raf);
  clearTimeout(flipTimer);
}

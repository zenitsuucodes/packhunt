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
  $('#inspect').hidden = true;
}

// ---------- card inspector: zoom (buttons, Ctrl+wheel, pinch, double-tap) and scroll/drag ----------
const zoom = { z: 1, min: 1, max: 4 };

function baseWidth() {
  return Math.min(innerWidth * 0.9, (innerHeight - 140) * (63 / 88), 560);
}

// Zoom keeping the point under (cx, cy) in place.
function setZoom(z, cx, cy) {
  const sc = $('#inspectScroll');
  const img = $('#inspectImg');
  const old = zoom.z;
  zoom.z = Math.min(zoom.max, Math.max(zoom.min, z));
  const r = sc.getBoundingClientRect();
  const px = (cx ?? r.left + r.width / 2) - r.left;
  const py = (cy ?? r.top + r.height / 2) - r.top;
  const fx = (sc.scrollLeft + px) / sc.scrollWidth;
  const fy = (sc.scrollTop + py) / sc.scrollHeight;
  img.style.setProperty('--w', `${baseWidth() * zoom.z}px`);
  $('#zoomLabel').textContent = `${Math.round(zoom.z * 100)}%`;
  if (old !== zoom.z) {
    sc.scrollLeft = fx * sc.scrollWidth - px;
    sc.scrollTop = fy * sc.scrollHeight - py;
  }
}

export function openInspect() {
  const src = $('#pcardImg').src;
  if (!src) return;
  $('#inspectImg').src = src;
  $('#inspectImg').alt = $('#pcardImg').alt;
  $('#inspect').hidden = false;
  zoom.z = 1;
  setZoom(1);
}

export function installInspector(onSound) {
  const sc = $('#inspectScroll');
  $('#pcard').addEventListener('click', () => {
    if (!$('#pcard').classList.contains('live')) return;
    onSound?.();
    openInspect();
  });
  $('#inspectClose').onclick = () => { onSound?.(); $('#inspect').hidden = true; };
  $('#zoomIn').onclick = () => setZoom(zoom.z * 1.4);
  $('#zoomOut').onclick = () => setZoom(zoom.z / 1.4);
  $('#inspectImg').addEventListener('dblclick', (e) => setZoom(zoom.z > 1.5 ? 1 : 2.5, e.clientX, e.clientY));
  sc.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls
    e.preventDefault();
    setZoom(zoom.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if ($('#inspect').hidden) return;
    if (e.key === 'Escape') $('#inspect').hidden = true;
    if (e.key === '+' || e.key === '=') setZoom(zoom.z * 1.25);
    if (e.key === '-') setZoom(zoom.z / 1.25);
  });

  // Mouse drag to pan, two-finger pinch to zoom (touch scrolling stays native).
  const pts = new Map();
  let pinch = null;
  let drag = null;
  sc.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom.z };
      drag = null;
    } else if (e.pointerType === 'mouse') {
      drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop };
      sc.classList.add('dragging');
    }
  });
  sc.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      setZoom(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (drag) {
      sc.scrollLeft = drag.l - (e.clientX - drag.x);
      sc.scrollTop = drag.t - (e.clientY - drag.y);
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    drag = null;
    sc.classList.remove('dragging');
  };
  sc.addEventListener('pointerup', up);
  sc.addEventListener('pointercancel', up);
  addEventListener('resize', () => { if (!$('#inspect').hidden) setZoom(zoom.z); });
}

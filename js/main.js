// Packhunt: drop anywhere in Street View, follow clues, find 3D packs, rip them open.
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { PackOverlay } from './overlay.js';
import { Encounter } from './encounter.js';
import { drawCard } from './cards.js';
import { voxelData, buildPack, makeSparkles, animateSparkles } from './voxel.js';
import { installTextures, preloadCard, showCard, hideCard, cardImage, TIER_COLOR } from './reveal.js';

const $ = (s) => document.querySelector(s);
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const CITIES = [
  [35.6595, 139.7005], [48.8867, 2.3431], [40.7336, -74.0027], [51.5136, -0.1365],
  [52.3752, 4.8840], [41.8897, 12.4700], [41.3833, 2.1767], [38.7114, -9.1300],
  [50.0870, 14.4208], [37.5740, 126.9850], [35.0037, 135.7750], [-33.8860, 151.2110],
  [-37.8136, 144.9631], [37.7599, -122.4148], [43.6545, -79.4006], [19.4180, -99.1620],
  [-34.6212, -58.3731], [-33.9205, 18.4155], [41.0335, 28.9770], [1.2830, 103.8440],
  [18.9067, 72.8147], [52.4990, 13.4180], [55.9500, -3.1880], [64.1466, -21.9426],
  [55.6761, 12.5683], [48.2082, 16.3738], [25.0330, 121.5654], [13.7563, 100.5018],
];

const S = {
  cfg: {}, token: null, pano: null, overlay: null, enc: null, data: null,
  busy: false, done: false, epoch: 0, nextAt: 0, t0: 0, hintCount: 0,
  demo: new URLSearchParams(location.search).has('demo'),
};

// ---------- small UI helpers ----------
function screen(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
}
function current() {
  return [...document.querySelectorAll('.screen')].find((el) => !el.hidden)?.id || null;
}

let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

let sayTimer;
function say(text, done) {
  const el = $('#encText');
  clearInterval(sayTimer);
  let i = 0;
  el.textContent = '';
  sayTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i % 3 === 0) sfx.click();
    if (i >= text.length) { clearInterval(sayTimer); done && done(); }
  }, 24);
}

function actions(list, box = $('#encActions')) {
  box.innerHTML = '';
  for (const a of list) {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || ''}`;
    b.textContent = a.label;
    b.onclick = a.fn;
    box.appendChild(b);
  }
}

function flash(kind) {
  const f = $('#flash');
  f.className = '';
  void f.offsetWidth;
  f.className = kind;
}

async function api(path, body) {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'Something went wrong on the server.';
    return j;
  } catch {
    return { error: 'No connection. Check your internet.' };
  }
}

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- Google Maps ----------
let mapsPromise;
function loadMaps() {
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      window.gm_authFailure = () => {
        toast('Google rejected the map key. Check the key and its website restriction.', 6000);
        screen('title');
      };
      window.__packhuntMaps = resolve;
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(S.cfg.browserKey)}&v=weekly&callback=__packhuntMaps`;
      s.async = true;
      s.onerror = () => { mapsPromise = null; reject(new Error('maps')); };
      document.head.appendChild(s);
    });
  }
  return mapsPromise;
}

// One panorama for the whole visit: Google bills each new viewer, not each step.
function ensurePano() {
  if (S.pano) return;
  S.pano = new google.maps.StreetViewPanorama($('#pano'), {
    visible: false,
    addressControl: false,
    showRoadLabels: false,
    fullscreenControl: false,
    zoomControl: false,
    panControl: false,
    motionTracking: false,
    motionTrackingControl: false,
    enableCloseButton: false,
    clickToGo: true,
    linksControl: true,
  });
  S.pano.addListener('position_changed', onMove);
  S.overlay = new PackOverlay($('#stage'), S.pano, openEncounter);
}

// ---------- starting a hunt ----------
function randomDrop() {
  const [lat, lng] = rand(CITIES);
  startHunt({ lat: lat + (Math.random() - 0.5) * 0.008, lng: lng + (Math.random() - 0.5) * 0.008 });
}

async function pickSpot() {
  sfx.click();
  screen('loading');
  $('#loadingText').textContent = 'Loading the world...';
  try { await loadMaps(); } catch { toast('Could not load Google Maps.'); screen('title'); return; }
  screen('picker');
  if (S.pick) return;
  S.pick = new google.maps.Map($('#pickmap'), {
    center: { lat: 25, lng: 10 }, zoom: 2, streetViewControl: false, mapTypeControl: false,
    fullscreenControl: false, clickableIcons: false,
  });
  S.pick.addListener('click', (e) => startHunt(e.latLng.toJSON()));
}

async function startHunt(at) {
  sfx.click();
  screen('loading');
  $('#loadingText').textContent = 'Looking for a street...';
  const slow = setTimeout(() => ($('#loadingText').textContent = 'Hiding packs nearby...'), 1200);
  let r;
  try {
    await loadMaps();
    r = await api('/api/hunt', at);
  } catch {
    r = { error: 'Could not load Google Maps.' };
  }
  clearTimeout(slow);
  if (r.error) { sfx.error(); toast(r.error); screen('title'); return; }

  ensurePano();
  S.token = r.token;
  S.done = false;
  S.busy = false;
  S.hintCount = 0;
  S.wasNear = false;
  S.epoch++;
  S.t0 = Date.now() - r.elapsed * 1000;
  $('#hintList').innerHTML = '';
  S.overlay.sync([]);
  // Start on Google's own panorama, not a nearby user photo sphere.
  if (r.start.pano) S.pano.setPano(r.start.pano);
  else S.pano.setPosition({ lat: r.start.lat, lng: r.start.lng });
  S.pano.setPov({ heading: Math.random() * 360, pitch: 0 });
  S.pano.setZoom(1);
  S.pano.setVisible(true);

  apply(r);
  screen(null);
  for (const id of ['#hud', '#hintbox']) $(id).hidden = false;
  clearInterval(S.tick);
  S.tick = setInterval(tick, 1000);
  sfx.appear();
  toast(`${r.total} packs are hidden nearby. Follow the clues to the GOLDEN pack!`, 5000);
}

// ---------- moving ----------
function onMove() {
  if (!S.token || S.busy || S.done) return;
  clearTimeout(S.moveTimer);
  S.moveTimer = setTimeout(sendMove, 250);
}

async function sendMove() {
  const p = S.pano?.getPosition();
  if (!p || !S.token || S.done) return;
  if (S.moving) { S.again = true; return; }
  S.moving = true;
  const epoch = S.epoch;
  const r = await api('/api/move', { token: S.token, lat: p.lat(), lng: p.lng() });
  S.moving = false;
  if (epoch === S.epoch && !S.busy) {
    if (r.token) S.token = r.token;
    if (r.error) toast(r.error);
    if (r.hints) apply(r);
    else if (r.error && /expired/.test(r.error)) quit();
  }
  if (S.again) { S.again = false; sendMove(); }
}

function apply(r) {
  S.data = r;
  $('#hudPacks').textContent = `${r.found}/${r.total}`;
  $('#hudScore').textContent = r.score;
  if (S.overlay.sync(r.visible).length) sfx.appear();
  $('#radar').hidden = !r.near;
  if (r.near && !S.wasNear) sfx.ping();
  S.wasNear = r.near;
  renderHints(r.hints, r.level);
  S.nextAt = r.nextIn != null ? Date.now() + r.nextIn * 1000 : 0;
}

function renderHints(hints, level) {
  $('#hintLevel').textContent = `${level}/5`;
  const list = $('#hintList');
  if (hints.length > S.hintCount && S.hintCount > 0) {
    sfx.hint();
    $('#hintbox').classList.remove('collapsed');
  }
  hints.forEach((h, i) => {
    let li = list.children[i];
    const fresh = !li;
    if (fresh) {
      li = document.createElement('li');
      if (S.hintCount > 0) li.className = 'new';
      list.appendChild(li);
    }
    if (h.radar) {
      const t = h.radar.trend;
      li.innerHTML = `Radar: ${h.radar.metres}m away ${t === 'warmer' ? '<span class="warm">WARMER!</span>' : t === 'colder' ? '<span class="cold">COLDER...</span>' : ''}`;
    } else if (fresh && 'photo' in h) {
      if (!h.photo) { li.textContent = 'No photo of this spot, sorry!'; return; }
      li.textContent = 'Postcard from the hiding spot:';
      const img = new Image();
      img.alt = 'Street View photo of the Golden pack hiding spot';
      img.onerror = () => { li.textContent = 'The postcard got lost in the mail.'; };
      img.onclick = () => img.classList.toggle('zoom');
      img.src = h.photo;
      li.appendChild(img);
    } else if (fresh) {
      li.textContent = h.text;
    }
  });
  S.hintCount = hints.length;
}

function tick() {
  $('#hudTime').textContent = fmtTime((Date.now() - S.t0) / 1000);
  if (!S.nextAt) { $('#hintNext').textContent = ''; return; }
  const left = Math.ceil((S.nextAt - Date.now()) / 1000);
  $('#hintNext').textContent = left > 0 ? `next ${left}s` : 'new clue!';
  if (left <= 0 && !S.busy) { S.nextAt = 0; sendMove(); }
}

// ---------- opening packs ----------
async function openEncounter(id) {
  if (S.busy) return;
  const pack = S.data?.visible.find((p) => p.id === id);
  if (!pack) return;
  S.busy = true;
  S.cur = pack;
  S.taps = 0;
  S.ripping = false;
  $('#encounter').classList.toggle('gold', pack.gold);
  actions([]);
  $('#encText').textContent = '';
  screen('encounter');
  flash('go');
  sfx.encounter();
  await S.enc.show(pack.gold);
  say(pack.gold ? 'A legendary GOLDEN PACK appeared!' : 'A wild BOOSTER PACK appeared!', () =>
    actions([
      { label: '▶ RIP IT', cls: pack.gold ? 'gold' : 'primary', fn: startRip },
      { label: 'RUN', fn: closeEncounter },
    ]));
}

function startRip() {
  sfx.click();
  actions([]);
  S.ripping = true;
  S.epoch++;
  if (S.demo) {
    S.openReq = demoCard(S.cur.gold);
  } else {
    const p = S.pano.getPosition();
    S.openReq = api('/api/open', { token: S.token, packId: S.cur.id, lat: p.lat(), lng: p.lng() });
  }
  say('Tap the pack 3 times to rip it open!');
}

function tapPack() {
  if (!S.ripping) return;
  S.taps++;
  S.enc.shake();
  sfx.shake();
  if (navigator.vibrate) try { navigator.vibrate(35); } catch {}
  if (S.taps >= 3) finishRip();
}

async function finishRip() {
  S.ripping = false;
  const r = await S.openReq;
  if (r.error) {
    sfx.error();
    say(r.error, () => actions([{ label: 'BACK', fn: closeEncounter }]));
    return;
  }
  if (r.token) S.token = r.token;
  S.pending = r.hints ? r : null;
  await S.fontReady;
  const c = r.card;
  const ready = c.img ? preloadCard(c) : null;
  flash('white');
  sfx.rip();
  addToBag({ ...c, place: r.foundAt?.place || null, at: r.foundAt?.at || Date.now() });
  await S.enc.rip(c);
  if (c.img) {
    await ready;
    showReveal(r);
    return;
  }
  setTimeout(() => sfx.reveal(c.rarity), 100);
  if (c.rarity === 'GOLDEN') {
    S.finishTime = r.finishTime;
    S.finalScore = r.score;
    say(`LEGENDARY! You found the GOLDEN PACK and pulled ${c.name}! +${c.pts} pts`, () =>
      actions([{ label: '▶ FINISH', cls: 'gold', fn: finish }]));
  } else {
    say(`You pulled ${c.name}! ${c.rarity}. +${c.pts} pts${r.bonusHint ? ' New clue unlocked!' : ''}`, () =>
      actions([{ label: '▶ KEEP HUNTING', cls: 'primary', fn: closeEncounter }]));
  }
}

function pill(card) {
  return `<span class="rarity-pill" style="background:${TIER_COLOR[card.tier] || '#7880a0'}">${card.rarity}</span>`;
}

// The real card, over a Street View photo of the exact spot it was found.
function showReveal(r) {
  const c = r.card;
  const gold = S.cur.gold;
  S.enc.stop();
  screen('reveal');
  showCard(c, r.foundAt);
  setTimeout(() => sfx.reveal(c.tier), 450);
  if (c.tier === 'GOLDEN' || c.tier === 'HOLO') setTimeout(() => flash('white'), 900);
  if (gold) {
    S.finishTime = r.finishTime;
    S.finalScore = r.score;
  }
  const box = $('#revealActions');
  box.innerHTML = '';
  $('#revealText').innerHTML = '';
  setTimeout(() => {
    $('#revealText').innerHTML = `${pill(c)}${gold ? 'LEGENDARY! ' : ''}You pulled <b></b>! ` +
      `<span class="muted"></span> +${c.pts} pts${r.bonusHint ? '. New clue unlocked!' : ''}`;
    $('#revealText b').textContent = c.name;
    $('#revealText .muted').textContent = c.set;
    actions(gold
      ? [{ label: '▶ FINISH', cls: 'gold', fn: finish }]
      : [{ label: '▶ KEEP HUNTING', cls: 'primary', fn: closeEncounter }], box);
  }, 1100);
}

function closeEncounter() {
  sfx.click();
  hideCard();
  S.enc.stop();
  screen(null);
  S.busy = false;
  if (S.demo) { setTimeout(() => demoEncounter(), 300); return; }
  if (S.pending) { apply(S.pending); S.pending = null; }
}

function finish() {
  sfx.click();
  hideCard();
  S.enc.stop();
  S.busy = false;
  S.done = true;
  clearInterval(S.tick);
  for (const id of ['#hud', '#hintbox', '#radar']) $(id).hidden = true;
  if (S.pano) S.pano.setVisible(false);
  if (S.overlay) S.overlay.sync([]);
  const t = S.finishTime ?? Math.floor((Date.now() - S.t0) / 1000);
  const found = S.pending ? `${S.pending.found}/${S.pending.total}` : '';
  S.pending = null;
  $('#resStats').innerHTML = `Time ${fmtTime(t)}<br>Packs ${found}<br>Score ${S.finalScore ?? 0}`;
  const best = store.get('packhunt_best', null);
  if (!S.demo && (best == null || t < best)) {
    store.set('packhunt_best', t);
    $('#resBest').textContent = 'NEW BEST TIME!';
  } else {
    $('#resBest').textContent = best != null ? `Best time ${fmtTime(best)}` : '';
  }
  screen('results');
}

function quit() {
  S.done = true;
  S.token = null;
  clearInterval(S.tick);
  for (const id of ['#hud', '#hintbox', '#radar']) $(id).hidden = true;
  if (S.pano) S.pano.setVisible(false);
  if (S.overlay) S.overlay.sync([]);
  refreshTitle();
  screen('title');
}

// ---------- bag ----------
function addToBag(card) {
  const bag = store.get('packhunt_bag', []);
  bag.unshift({ ...card, at: Date.now() });
  store.set('packhunt_bag', bag.slice(0, 300));
}

async function openBag() {
  sfx.click();
  S.bagFrom = current();
  await S.fontReady;
  const grid = $('#bagGrid');
  grid.innerHTML = '';
  const bag = store.get('packhunt_bag', []);
  if (!bag.length) grid.innerHTML = '<p class="muted">No cards yet. Go rip some packs!</p>';
  for (const card of bag) {
    if (!card.img) { grid.appendChild(drawCard(card, 192)); continue; }
    const b = document.createElement('button');
    b.className = `bag-card${card.foil ? ' foil' : ''}`;
    b.innerHTML = '<div class="thumb"><img loading="lazy" alt=""></div><span></span>';
    b.querySelector('img').src = cardImage(card, false);
    b.querySelector('img').alt = card.name;
    b.querySelector('span').textContent = card.place ? card.place.split(', ').slice(-2).join(', ') : card.set;
    b.onclick = () => viewCard(card);
    grid.appendChild(b);
  }
  screen('bag');
}

function viewCard(card) {
  sfx.click();
  screen('reveal');
  showCard(card, card.place || card.at ? { place: card.place, at: card.at } : null);
  $('#revealText').innerHTML = `${pill(card)}<b></b> <span class="muted"></span>`;
  $('#revealText b').textContent = card.name;
  $('#revealText .muted').textContent = card.set;
  actions([{ label: 'BACK', fn: () => { sfx.click(); hideCard(); screen('bag'); } }], $('#revealActions'));
}

function refreshTitle() {
  const bag = store.get('packhunt_bag', []);
  $('#bagCount').textContent = bag.length ? `(${bag.length})` : '';
  const best = store.get('packhunt_best', null);
  $('#bestLine').textContent = best != null ? `Best Golden time: ${fmtTime(best)}` : '';
}

// Spinning 3D golden pack on the title screen.
async function titlePack() {
  const host = $('#titlePack');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 6);
  const pack = buildPack(await voxelData('assets/pack_gold.png'), { height: 2.2, depth: 4 });
  const sparkles = makeSparkles(true, 14);
  sparkles.scale.setScalar(1.7);
  scene.add(pack, sparkles);
  const loop = (t) => {
    requestAnimationFrame(loop);
    if ($('#title').hidden) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    pack.rotation.y = t / 900;
    pack.position.y = Math.sin(t / 500) * 0.12;
    animateSparkles(sparkles, t);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
}

// ---------- demo (no Google needed): ?demo or ?demo=gold ----------
async function demoCard(gold) {
  const tier = gold ? 'GOLDEN' : rand(['COMMON', 'UNCOMMON', 'RARE', 'HOLO', 'HOLO']);
  try {
    const { card } = await (await fetch(`/api/card?tier=${tier}`)).json();
    return { card, bonusHint: !gold, foundAt: { place: 'Demo Street, Pallet Town', at: Date.now(), photo: null } };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

function demoEncounter() {
  S.demoCount = (S.demoCount || 0) + 1;
  const gold = new URLSearchParams(location.search).get('demo') === 'gold' || S.demoCount % 4 === 0;
  S.data = { visible: [{ id: S.demoCount, gold }] };
  S.busy = false;
  openEncounter(S.demoCount);
}

// ---------- boot ----------
async function boot() {
  S.fontReady = document.fonts.load('20px "Press Start 2P"').catch(() => {});
  installTextures();
  S.enc = new Encounter($('#encStage'));
  $('#encStage').addEventListener('pointerdown', tapPack);
  $('#randomBtn').onclick = randomDrop;
  $('#pickBtn').onclick = pickSpot;
  $('#pickBack').onclick = () => screen('title');
  $('#bagBtn').onclick = openBag;
  $('#hudBag').onclick = openBag;
  $('#resBag').onclick = openBag;
  $('#bagClose').onclick = () => { sfx.click(); refreshTitle(); screen(S.bagFrom); };
  $('#againBtn').onclick = () => { refreshTitle(); screen('title'); };
  $('#hudQuit').onclick = () => { if (confirm('Quit this hunt?')) quit(); };
  $('#hintHead').onclick = () => $('#hintbox').classList.toggle('collapsed');
  const snd = $('#hudSound');
  snd.classList.toggle('off', sfx.isMuted());
  snd.onclick = () => snd.classList.toggle('off', sfx.toggle());
  addEventListener('pointerdown', sfx.unlock, { once: true });
  refreshTitle();
  titlePack();

  if (S.demo) { demoEncounter(); return; }
  try { S.cfg = await (await fetch('/api/config')).json(); } catch { S.cfg = {}; }
  if (!S.cfg.browserKey) { $('#menu').hidden = true; $('#setup').hidden = false; }
}

if (location.hostname === 'localhost') window.__packhunt = S; // dev-only handle for testing

boot();

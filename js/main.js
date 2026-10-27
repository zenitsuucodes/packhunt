// Packhunt: drop anywhere in Street View, follow clues, find 3D packs, rip them open.
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { PackOverlay } from './overlay.js';
import { Encounter } from './encounter.js';
import { drawCard } from './cards.js';
import { makeSparkles, animateSparkles } from './voxel.js';
import { buildRealPack } from './pack3d.js';
import { installTextures, installInspector, preloadCard, showCard, hideCard, cardImage, TIER_COLOR } from './reveal.js';
import { CHALLENGES } from './challenges.js';
import { offset } from './geo.js';
import { getSession, connectWallet, disconnectWallet, shortAddr } from './wallet.js';

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
  S.pano.addListener('position_changed', () => { if (S.hero?.on) placeHeroPacks(); });
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
    fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy',
  });
  new google.maps.StreetViewCoverageLayer().setMap(S.pick); // blue lines = Street View
  S.pickMarker = new google.maps.Marker({ map: S.pick, visible: false });
  S.pick.addListener('click', (e) => choosePick(e.latLng.toJSON()));
}

// Tapping the map (or a search result) places a pin; DROP HERE starts the hunt.
function choosePick(at, label) {
  sfx.click();
  S.pickAt = at;
  S.pickMarker.setPosition(at);
  S.pickMarker.setVisible(true);
  $('#pickHint').textContent = label || `Drop at ${at.lat.toFixed(4)}, ${at.lng.toFixed(4)}?`;
  $('#pickDrop').hidden = false;
}

async function searchPlaces(e) {
  e.preventDefault();
  const q = $('#pickQuery').value.trim();
  const list = $('#pickResults');
  if (!q) return;
  list.hidden = false;
  list.innerHTML = '<li class="muted">Searching...</li>';
  let results = [];
  try { results = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json(); } catch {}
  list.innerHTML = '';
  if (!results.length) { list.innerHTML = '<li class="muted">No places found. Try another name.</li>'; return; }
  for (const r of results) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.name;
    b.onclick = () => {
      list.hidden = true;
      S.pick.setCenter(r);
      S.pick.setZoom(16);
      choosePick({ lat: r.lat, lng: r.lng }, r.name.split(',').slice(0, 2).join(','));
    };
    li.appendChild(b);
    list.appendChild(li);
  }
}

async function startHunt(at) {
  sfx.click();
  S.mode = at.challenge || 'wild';
  at = { ...at, wallet: getSession()?.session };
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
  heroStop();
  pushBack();
  S.token = r.token;
  S.done = false;
  S.busy = false;
  S.hintCount = 0;
  S.wasNear = false;
  S.lastTrend = '';
  S.epoch++;
  S.t0 = Date.now() - r.elapsed * 1000;
  S.wallet = r.wallet;
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
  showIntro(r);
}

// Challenge card shown on landing: a preset famous spot, or one generated from the drop location.
function showIntro(r) {
  const ch = CHALLENGES.find((c) => c.id === r.challenge) || r.custom;
  if (!ch) return;
  $('#introLabel').textContent = r.custom ? 'CHALLENGE GENERATED FOR THIS SPOT' : 'CHALLENGE';
  $('#introName').textContent = ch.name;
  $('#introPlace').textContent = ch.place;
  $('#introStars').textContent = `${'★'.repeat(ch.stars)}${'☆'.repeat(3 - ch.stars)}`;
  $('#introBlurb').textContent = ch.blurb;
  const extra = r.custom?.famous ? `  ·  Nearby: ${r.custom.famous}` : '';
  $('#introMeta').textContent = `${r.total} packs  ·  ${r.timeLeft ? `${fmtTime(r.timeLeft)} to find the GOLDEN pack` : 'No time limit'}${extra}`;
  $('#intro').hidden = false;
  clearTimeout(S.introTimer);
  S.introTimer = setTimeout(() => ($('#intro').hidden = true), 9000);
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
  renderRadar(r);
  S.deadline = r.timeLeft != null ? Date.now() + r.timeLeft * 1000 : 0;
  if (r.expired && !S.busy) timeUp();
}

// Always-visible radar badge: counts down until it unlocks (clue 2), then shows the trend after every step.
function renderRadar(r) {
  const chip = $('#radarChip');
  const radar = (r || S.data)?.hints.find((h) => h.radar)?.radar;
  chip.hidden = false;
  if (!radar) {
    const level = S.data?.level || 1;
    const left = Math.max(0, Math.ceil((S.nextAt - Date.now()) / 1000));
    chip.className = 'radar-chip';
    chip.innerHTML = `<span class="r-label">GOLDEN RADAR</span>${level === 1 && S.nextAt ? `unlocks in ${fmtTime(left)}` : 'unlocks at clue 2'}`;
    return;
  }
  if (!r) return;
  const trend = radar.trend || S.lastTrend || '';
  if (radar.trend && radar.trend !== S.lastTrend) {
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }
  S.lastTrend = trend;
  chip.className = `radar-chip ${trend} ${chip.classList.contains('bump') ? 'bump' : ''}`;
  const word = trend === 'warmer' ? '<b>WARMER &#9650;</b>' : trend === 'colder' ? '<b>COLDER &#9660;</b>' : 'Walk to get a reading';
  chip.innerHTML = `<span class="r-label">GOLDEN RADAR</span>${word}${radar.metres != null ? `<br>${radar.metres}m away` : ''}`;
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
      li.innerHTML = `Radar: ${h.radar.metres != null ? `${h.radar.metres}m away` : 'signal only'} ${t === 'warmer' ? '<span class="warm">WARMER!</span>' : t === 'colder' ? '<span class="cold">COLDER...</span>' : ''}`;
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
  const hudTime = $('#hudTime');
  if (S.deadline) {
    const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
    hudTime.textContent = fmtTime(left);
    hudTime.classList.toggle('urgent', left <= 60);
    if (left <= 0 && !S.busy && !S.done) { S.deadline = 0; sendMove(); return; }
  } else {
    hudTime.textContent = fmtTime((Date.now() - S.t0) / 1000);
    hudTime.classList.remove('urgent');
  }
  if (!S.data?.hints.some((h) => h.radar)) renderRadar();
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
  await S.enc.show(pack.set, pack.gold);
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
    const late = /Time's up/.test(r.error);
    const back = late ? () => { S.enc.stop(); S.busy = false; timeUp(); } : closeEncounter;
    say(r.error, () => actions([{ label: late ? 'RESULTS' : 'BACK', fn: back }]));
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
    S.timeBonus = r.timeBonus;
    S.recorded = r.recorded;
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

function endHunt() {
  hideCard();
  S.enc.stop();
  S.busy = false;
  S.done = true;
  clearInterval(S.tick);
  for (const id of ['#hud', '#hintbox', '#radar', '#intro', '#radarChip']) $(id).hidden = true;
  if (S.pano) S.pano.setVisible(false);
  if (S.overlay) S.overlay.sync([]);
}

function walletLine(recorded) {
  if (recorded) return `Your cards and score are recorded to ${shortAddr(S.wallet)}.`;
  if (S.wallet) return "The leaderboard isn't live yet, so this score wasn't recorded.";
  return 'Connect your Solana wallet to record the cards you collect.';
}

function finish() {
  sfx.click();
  endHunt();
  const t = S.finishTime ?? Math.floor((Date.now() - S.t0) / 1000);
  const found = S.pending ? `${S.pending.found}/${S.pending.total}` : '';
  S.pending = null;
  $('#resTitle').textContent = 'HUNT COMPLETE!';
  $('#resStats').innerHTML = `Time ${fmtTime(t)}<br>Packs ${found}<br>Time bonus +${S.timeBonus || 0}<br>Score ${S.finalScore ?? 0}`;
  const key = `packhunt_best_${S.mode || 'wild'}`;
  const best = store.get(key, null);
  if (!S.demo && (best == null || t < best)) {
    store.set(key, t);
    $('#resBest').textContent = 'NEW BEST TIME!';
  } else {
    $('#resBest').textContent = best != null ? `Best time ${fmtTime(best)}` : '';
  }
  $('#resWallet').textContent = walletLine(S.recorded);
  screen('results');
}

function timeUp() {
  if (S.done) return;
  sfx.error();
  endHunt();
  const d = S.data || {};
  $('#resTitle').textContent = "TIME'S UP!";
  $('#resStats').innerHTML = `The Golden pack got away.<br>Packs ${d.found ?? 0}/${d.total ?? 0}<br>Score ${d.score ?? 0}`;
  $('#resBest').textContent = '';
  $('#resWallet').textContent = 'Only finished hunts count on the leaderboard.';
  screen('results');
}

function quit() {
  S.done = true;
  S.token = null;
  setTimeout(heroResume, 50);
  clearInterval(S.tick);
  for (const id of ['#hud', '#hintbox', '#radar', '#intro', '#radarChip']) $(id).hidden = true;
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
  const best = store.get('packhunt_best_wild', null);
  $('#bestLine').textContent = best != null ? `Best wild drop: ${fmtTime(best)}` : '';
  const w = getSession();
  for (const b of [$('#walletBtn'), $('#boardWallet')]) {
    b.textContent = w ? `WALLET ${shortAddr(w.wallet)}  (DISCONNECT)` : 'CONNECT SOLANA WALLET';
    b.classList.toggle('connected', Boolean(w));
  }
}

// Spinning 3D golden pack on the title screen.
async function titlePack() {
  const host = $('#titlePack');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 6);
  const pack = await buildRealPack('sv3pt5', true, { height: 2.4 });
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
    const { card } = await (await fetch(`/api/card?tier=${tier}&set=${S.cur.set}`)).json();
    return { card, bonusHint: !gold, foundAt: { place: 'Demo Street, Pallet Town', at: Date.now(), photo: null } };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

function demoEncounter() {
  S.demoCount = (S.demoCount || 0) + 1;
  const gold = new URLSearchParams(location.search).get('demo') === 'gold' || S.demoCount % 4 === 0;
  const set = gold ? rand(['sv3pt5', 'swsh7', 'sv8pt5', 'sv4pt5']) : rand(['base1', 'base2', 'base3', 'sv3pt5', 'swsh7', 'swsh12pt5', 'sv4pt5', 'sv8pt5']);
  S.data = { visible: [{ id: S.demoCount, gold, set }] };
  S.busy = false;
  openEncounter(S.demoCount);
}

// ---------- live Street View loop behind the title screen ----------
// Reuses the game's one panorama, so it adds no extra Street View loads when a hunt starts.
const HERO_STAY = 18000;

async function startHeroView() {
  if (!S.cfg.browserKey || S.demo) return;
  try { await loadMaps(); } catch { return; }
  let spots = [];
  try { spots = await (await fetch('/api/hero')).json(); } catch {}
  if (!spots.length) return;
  ensurePano();
  S.hero = { spots, i: Math.floor(Math.random() * spots.length), on: false };
  heroResume();
}

function heroResume() {
  if (!S.hero || S.token) return;
  S.hero.on = true;
  S.pano.setOptions({ linksControl: false, clickToGo: false });
  heroGo(S.hero.i);
  requestAnimationFrame(heroSpin);
}

function heroStop() {
  if (!S.hero?.on) return;
  S.hero.on = false;
  $('#heroTag').hidden = true;
  S.overlay.sync([]);
  S.pano.setOptions({ linksControl: true, clickToGo: true });
  $('#stage').classList.remove('fading');
}

function heroGo(i) {
  const h = S.hero;
  h.i = i % h.spots.length;
  const spot = h.spots[h.i];
  $('#stage').classList.add('fading');
  setTimeout(() => {
    if (!h.on) return;
    S.overlay.sync([]);
    S.pano.setPano(spot.pano);
    S.pano.setPov({ heading: spot.heading, pitch: 4 });
    S.pano.setZoom(1);
    S.pano.setVisible(true);
    h.since = performance.now();
    $('#heroPlace').textContent = spot.name;
    $('#heroTag').hidden = false;
    setTimeout(() => h.on && $('#stage').classList.remove('fading'), 700);
  }, 600);
}

// A few packs floating just ahead of the camera, one of them golden.
function placeHeroPacks() {
  const pos = S.pano.getPosition();
  if (!pos) return;
  const here = { lat: pos.lat(), lng: pos.lng() };
  const ahead = S.hero.spots[S.hero.i].heading;
  const sets = ['sv3pt5', 'swsh7', 'sv8pt5', 'base1', 'sv4pt5', 'swsh12pt5'];
  const packs = [[-28, 11], [6, 17], [38, 13], [180, 15]].map(([turn, metres], k) => ({
    id: -1 - k, gold: k === 1, set: rand(sets), ...offset(here, metres, ahead + turn),
  }));
  S.overlay.sync(packs);
  $('#heroCount').textContent = `${packs.length} PACKS NEARBY`;
}

function heroSpin(t) {
  const h = S.hero;
  if (!h?.on) return;
  requestAnimationFrame(heroSpin);
  if (!h.since || $('#stage').classList.contains('fading')) return;
  const pov = S.pano.getPov();
  S.pano.setPov({ heading: pov.heading + 0.035, pitch: 4 + Math.sin(t / 5000) * 2 });
  if (t - h.since > HERO_STAY) { h.since = 0; heroGo(h.i + 1); }
}

// ---------- challenges ----------
function openChallenges() {
  sfx.click();
  const list = $('#challengeList');
  list.innerHTML = '';
  for (const c of CHALLENGES) {
    const b = document.createElement('button');
    b.className = 'challenge';
    const best = store.get(`packhunt_best_${c.id}`, null);
    b.innerHTML = '<span class="c-name"></span><span class="c-place"></span><span class="c-blurb"></span>' +
      '<span class="c-foot"><span class="c-stars"></span><span class="c-best"></span></span>';
    b.querySelector('.c-name').textContent = c.name;
    b.querySelector('.c-place').textContent = c.place;
    b.querySelector('.c-blurb').textContent = c.blurb;
    b.querySelector('.c-stars').textContent = `${'\u2605'.repeat(c.stars)}${'\u2606'.repeat(3 - c.stars)}`;
    b.querySelector('.c-best').textContent = best != null ? `BEST ${fmtTime(best)}` : '';
    b.onclick = () => startHunt({ challenge: c.id });
    list.appendChild(b);
  }
  screen('challenges');
}

// ---------- wallet + leaderboard ----------
async function toggleWallet() {
  sfx.click();
  if (getSession()) {
    disconnectWallet();
    toast('Wallet disconnected.');
  } else {
    const r = await connectWallet();
    if (r.error) { sfx.error(); toast(r.error, 5000); }
    else if (!r.pending) { sfx.hint(); toast(`Wallet ${shortAddr(r.wallet)} connected. Your cards will now be recorded.`); }
  }
  refreshTitle();
  if (!$('#board').hidden) openBoard(true);
}

async function openBoard(quiet) {
  if (!quiet) sfx.click();
  screen('board');
  const list = $('#boardList');
  list.innerHTML = '<li>Loading...</li>';
  let r;
  try { r = await (await fetch('/api/leaderboard')).json(); } catch { r = { enabled: false, top: [] }; }
  $('#boardWeek').textContent = r.enabled ? `Week ${r.week}` : 'The leaderboard opens soon.';
  list.innerHTML = '';
  const me = getSession()?.wallet;
  if (r.enabled && !r.top.length) list.innerHTML = '<li>No finished hunts yet this week. Be the first!</li>';
  for (const row of r.top) {
    const li = document.createElement('li');
    li.textContent = `${shortAddr(row.wallet)}  ${row.score} pts`;
    if (row.wallet === me) li.className = 'me';
    list.appendChild(li);
  }
}

// ---------- phone back button / back gesture ----------
// Each screen we open pushes a history entry, so "back" returns to the menu instead of leaving the site.
function pushBack() {
  try { history.pushState({ packhunt: true }, ''); } catch {}
}

function installBack() {
  for (const id of ['#challengesBtn', '#boardBtn', '#bagBtn', '#hudBag', '#resBag', '#pickBtn']) {
    $(id).addEventListener('click', pushBack);
  }
  addEventListener('popstate', () => {
    if (!$('#inspect').hidden) { $('#inspect').hidden = true; return; }
    const zoomed = document.querySelector('#hintList img.zoom');
    if (zoomed) { zoomed.classList.remove('zoom'); return; }
    const cur = current();
    const hunting = S.token && !S.done;
    if (cur === 'bag' && (hunting || S.bagFrom)) { $('#bagClose').click(); return; }
    if (cur === 'reveal' && !hunting) { hideCard(); screen('bag'); return; }
    if (hunting && !S.busy) {
      if (confirm('Leave this hunt and go back to the menu?')) quit();
      else pushBack();
      return;
    }
    if (hunting) { pushBack(); return; } // mid pack-opening: stay put
    if (cur && cur !== 'title') { sfx.click(); refreshTitle(); screen('title'); heroResume(); }
  });
}

// ---------- boot ----------
async function boot() {
  S.fontReady = document.fonts.load('20px "Press Start 2P"').catch(() => {});
  installTextures();
  installInspector(() => sfx.click());
  S.enc = new Encounter($('#encStage'));
  $('#encStage').addEventListener('pointerdown', tapPack);
  $('#randomBtn').onclick = randomDrop;
  $('#challengesBtn').onclick = openChallenges;
  $('#challengesClose').onclick = () => { sfx.click(); screen('title'); };
  $('#boardBtn').onclick = () => openBoard();
  $('#boardClose').onclick = () => { sfx.click(); screen('title'); };
  $('#walletBtn').onclick = toggleWallet;
  $('#boardWallet').onclick = toggleWallet;
  $('#pickBtn').onclick = pickSpot;
  $('#pickBack').onclick = () => screen('title');
  $('#pickForm').onsubmit = searchPlaces;
  $('#introGo').onclick = () => { sfx.click(); $('#intro').hidden = true; };
  $('#pickDrop').onclick = () => S.pickAt && startHunt(S.pickAt);
  $('#bagBtn').onclick = openBag;
  $('#hudBag').onclick = openBag;
  $('#resBag').onclick = openBag;
  $('#bagClose').onclick = () => { sfx.click(); refreshTitle(); screen(S.bagFrom); };
  $('#againBtn').onclick = () => { S.token = null; refreshTitle(); screen('title'); heroResume(); };
  $('#hudQuit').onclick = () => { if (confirm('Leave this hunt and go back to the menu?')) quit(); };
  installBack();
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
  startHeroView();
}

if (location.hostname === 'localhost') window.__packhunt = S; // dev-only handle for testing

boot();

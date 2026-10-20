// Realistic 3D booster packs: a puffy foil wrapper with crimped ends, printed with the
// set's logo and cover art, so each pack matches the set its cards come from.
import * as THREE from 'three';

let setsPromise;
export function loadSets() {
  setsPromise ||= fetch('data/sets.json').then((r) => r.json())
    .then((list) => Object.fromEntries(list.map((s) => [s.id, s])));
  return setsPromise;
}

const images = new Map();
function loadImg(url) {
  if (!images.has(url)) {
    images.set(url, new Promise((resolve) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    }));
  }
  return images.get(url);
}

function mix(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

function fitImage(x, img, bx, by, bw, bh) {
  const s = Math.min(bw / img.width, bh / img.height);
  const w = img.width * s;
  const h = img.height * s;
  x.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
}

function foilBase(x, W, H, color, gold) {
  const g = x.createLinearGradient(0, 0, W * 0.4, H);
  if (gold) {
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, '#f2b62a'); g.addColorStop(0.7, '#c98a10'); g.addColorStop(1, '#7a4e05');
  } else {
    g.addColorStop(0, mix(color, 1.35)); g.addColorStop(0.5, color); g.addColorStop(1, mix(color, 0.45));
  }
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // Brushed-foil streaks
  for (let i = -H; i < W + H; i += 14) {
    x.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.06})`;
    x.lineWidth = 2 + Math.random() * 5;
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + H * 0.45, H);
    x.stroke();
  }
}

const textures = new Map();
async function wrapperTextures(setId, gold) {
  const key = `${setId}:${gold}`;
  if (textures.has(key)) return textures.get(key);
  const job = (async () => {
    const sets = await loadSets();
    const s = sets[setId] || Object.values(sets)[0];
    const [logo, art] = await Promise.all([
      loadImg(`https://images.pokemontcg.io/${s.id}/logo.png`),
      loadImg(`https://images.pokemontcg.io/${s.art}_hires.png`),
    ]);
    const W = 512;
    const H = 760;

    // Front
    const f = document.createElement('canvas');
    f.width = W; f.height = H;
    const x = f.getContext('2d');
    foilBase(x, W, H, s.color, gold);
    const burst = x.createRadialGradient(W / 2, 420, 10, W / 2, 420, 330);
    burst.addColorStop(0, 'rgba(255,255,255,.55)');
    burst.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = burst;
    x.fillRect(0, 0, W, H);
    if (art) {
      const sx = art.width * 0.085, sy = art.height * 0.105, sw = art.width * 0.83, sh = art.height * 0.4;
      const dw = 400, dh = (dw * sh) / sw, dx = (W - dw) / 2, dy = 250;
      x.save();
      x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
      roundRect(x, dx - 8, dy - 8, dw + 16, dh + 16, 14);
      x.fillStyle = gold ? '#fff6d0' : '#f4f4f4';
      x.fill();
      x.restore();
      x.save();
      roundRect(x, dx, dy, dw, dh, 8);
      x.clip();
      x.drawImage(art, sx, sy, sw, sh, dx, dy, dw, dh);
      x.restore();
    }
    if (logo) {
      x.save();
      x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 12; x.shadowOffsetY = 4;
      fitImage(x, logo, 50, 40, W - 100, 180);
      x.restore();
    }
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fillRect(0, H - 130, W, 130);
    x.textAlign = 'center';
    x.fillStyle = gold ? '#fff2a0' : '#ffffff';
    x.font = '900 46px "Arial Black", Impact, sans-serif';
    x.fillText(gold ? 'GOLDEN PACK' : 'BOOSTER PACK', W / 2, H - 70);
    x.font = 'bold 22px Arial, sans-serif';
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillText(gold ? 'LEGENDARY PULL INSIDE' : `${s.name.toUpperCase()}  ·  1 CARD`, W / 2, H - 32);

    // Back
    const b = document.createElement('canvas');
    b.width = W; b.height = H;
    const y = b.getContext('2d');
    foilBase(y, W, H, s.color, gold);
    y.fillStyle = 'rgba(0,0,0,.25)';
    y.fillRect(0, 0, W, H);
    if (logo) fitImage(y, logo, 110, 120, W - 220, 120);
    y.textAlign = 'center';
    y.fillStyle = 'rgba(255,255,255,.9)';
    y.font = 'bold 26px Arial, sans-serif';
    y.fillText('PACKHUNT', W / 2, 330);
    y.font = '18px Arial, sans-serif';
    y.fillText('Found somewhere on Earth.', W / 2, 370);
    y.fillStyle = '#fff';
    y.fillRect(W / 2 - 90, H - 170, 180, 80);
    y.fillStyle = '#111';
    for (let i = 0; i < 40; i++) y.fillRect(W / 2 - 80 + i * 4, H - 160, Math.random() < 0.5 ? 2 : 3, 60);

    // Crimp ridges
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const z = c.getContext('2d');
    z.fillStyle = gold ? '#e8c050' : mix(s.color, 1.5);
    z.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 256; i += 4) {
      z.fillStyle = i % 8 ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.25)';
      z.fillRect(i, 0, 2, 32);
    }

    const tex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    return { front: tex(f), back: tex(b), crimp: tex(c) };
  })();
  textures.set(key, job);
  return job;
}

// Puffy pillow surface: zero bulge at the edges so front and back seal together.
function pillow(w, h, bulge) {
  const g = new THREE.PlaneGeometry(w, h, 24, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (2 * p.getX(i)) / w;
    const v = (2 * p.getY(i)) / h;
    p.setZ(i, bulge * (1 - u * u) * (1 - v ** 8));
  }
  g.computeVertexNormals();
  return g;
}

function crimp(w, h, teeth) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, h * 0.8);
  for (let i = 0; i < teeth; i++) {
    const x0 = -w / 2 + (i * w) / teeth;
    shape.lineTo(x0 + w / teeth / 2, h);
    shape.lineTo(x0 + w / teeth, h * 0.8);
  }
  shape.lineTo(w / 2, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: false });
  g.translate(0, 0, -0.007);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  return g;
}

export async function buildRealPack(setId, gold, { height = 1.4 } = {}) {
  const t = await wrapperTextures(setId, gold);
  const W = height * 0.64;
  const H = height * 0.86;
  const CH = height * 0.07;
  const shine = { shininess: gold ? 120 : 80, specular: gold ? 0xfff0b0 : 0x777777 };
  const front = new THREE.Mesh(pillow(W, H, W * 0.07), new THREE.MeshPhongMaterial({ map: t.front, ...shine }));
  const back = new THREE.Mesh(pillow(W, H, W * 0.07), new THREE.MeshPhongMaterial({ map: t.back, ...shine }));
  back.rotation.y = Math.PI;
  const crimpMat = new THREE.MeshPhongMaterial({ map: t.crimp, shininess: 100, specular: 0xaaaaaa, side: THREE.DoubleSide });
  const top = new THREE.Mesh(crimp(W, CH, 16), crimpMat);
  top.position.y = H / 2 - 0.002;
  const bottom = new THREE.Mesh(crimp(W, CH, 16), crimpMat);
  bottom.rotation.z = Math.PI;
  bottom.position.y = -H / 2 + 0.002;

  const body = new THREE.Group();
  body.add(front, back, bottom);
  const group = new THREE.Group();
  group.add(body, top);
  group.userData = { body, top };
  return group;
}

// The 3D "wild pack appeared" scene: the pack drops in, shakes, rips open and a card flips out.
import * as THREE from 'three';
import { voxelData, buildPack, makeSparkles, animateSparkles } from './voxel.js';
import { drawCard, drawCardBack, RARITY } from './cards.js';

const easeOutBack = (p) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
const easeOut = (p) => 1 - (1 - p) ** 3;
function bounce(p) {
  if (p < 1 / 2.75) return 7.5625 * p * p;
  if (p < 2 / 2.75) return 7.5625 * (p -= 1.5 / 2.75) * p + 0.75;
  if (p < 2.5 / 2.75) return 7.5625 * (p -= 2.25 / 2.75) * p + 0.9375;
  return 7.5625 * (p -= 2.625 / 2.75) * p + 0.984375;
}

function glowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function rainbowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 0);
  ['#ff5080', '#ffd040', '#60ff90', '#50b0ff', '#c070ff', '#ff5080'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeCard(card) {
  const front = new THREE.CanvasTexture(drawCard(card, 512));
  front.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.CanvasTexture(drawCardBack(512));
  back.colorSpace = THREE.SRGBColorSpace;
  const color = RARITY[card.rarity]?.border || '#a8a8a8';
  const edge = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.24, 0.04), [
    edge, edge, edge, edge, new THREE.MeshBasicMaterial({ map: front }), new THREE.MeshBasicMaterial({ map: back }),
  ]);
  if (card.rarity === 'HOLO' || card.rarity === 'GOLDEN') {
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.24), new THREE.MeshBasicMaterial({
      map: rainbowTexture(), transparent: true, opacity: card.rarity === 'GOLDEN' ? 0.2 : 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    shine.position.z = 0.022;
    mesh.add(shine);
    mesh.userData.shine = shine;
  }
  if (card.rarity !== 'COMMON') {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({
      map: glowTexture(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: card.rarity === 'UNCOMMON' ? 0.5 : 0.9,
    }));
    glow.position.z = -0.3;
    mesh.add(glow);
    mesh.userData.glow = glow;
  }
  return mesh;
}

export class Encounter {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0.3, 7);
    this.camera.lookAt(0, 0.3, 0);
    this.anims = [];
    this.root = new THREE.Group();
    this.scene.add(this.root);

    const N = 90;
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial(), N);
    this.parts.userData.p = Array.from({ length: N }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 }));
    this.parts.frustumCulled = false;
    this.scene.add(this.parts);
    this.tmp = new THREE.Object3D();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width) return;
    this.renderer.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    // Pull back on narrow phone screens so the card fits.
    this.camera.position.z = r.width < r.height ? 9.5 : 7;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    let last = performance.now();
    const tick = (t) => {
      if (!this.running) return;
      requestAnimationFrame(tick);
      this.update(t, Math.min(0.05, (t - last) / 1000));
      last = t;
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  tween(dur, fn, delay = 0) {
    return new Promise((res) => this.anims.push({ t0: performance.now() + delay, dur, fn, res }));
  }

  clear() {
    this.anims = [];
    this.root.clear();
    this.pack = this.card = this.sparkles = null;
  }

  async show(gold) {
    this.clear();
    this.start();
    const data = await voxelData(gold ? 'assets/pack_gold.png' : 'assets/pack.png');
    this.pack = buildPack(data, { height: 2.4, depth: 4, split: 0.17 });
    this.pack.position.y = 6;
    this.root.add(this.pack);
    this.sparkles = makeSparkles(gold, gold ? 22 : 12);
    this.sparkles.scale.setScalar(1.9);
    this.root.add(this.sparkles);
    this.idle = false;
    await this.tween(750, (p) => { this.pack.position.y = 6 - 5.7 * bounce(p); });
    this.idle = true;
  }

  shake() { this.shakeUntil = performance.now() + 320; }

  burst(colors, origin, power = 1) {
    const list = this.parts.userData.p;
    list.forEach((p, i) => {
      p.pos.copy(origin);
      p.vel.set((Math.random() - 0.5) * 7 * power, (Math.random() * 6 + 2) * power, (Math.random() - 0.2) * 4);
      p.life = 0.8 + Math.random() * 0.8;
      this.parts.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    });
    this.parts.instanceColor.needsUpdate = true;
  }

  async rip(card) {
    this.idle = false;
    const pack = this.pack;
    pack.rotation.set(0, 0, 0);
    const { top, body } = pack.userData;
    const color = RARITY[card.rarity]?.border || '#ffffff';
    this.burst([color, '#ffffff', '#f8d030'], new THREE.Vector3(0, pack.position.y + 1, 0.3), card.rarity === 'GOLDEN' ? 1.5 : 1);
    if (top) this.tween(800, (p) => { top.position.set(p * 2.2, p * 3.5 - p * p * 1.5, p); top.rotation.z = -p * 5; });
    this.tween(650, (p) => { body.position.y = -p * 4; body.scale.setScalar(1 - p * 0.5); }, 120);

    // Real cards are revealed by the DOM card screen instead of a 3D card.
    if (card.img) {
      if (card.foil) this.burst(['#f8c830', '#ff6080', '#60c0ff', '#ffffff'], new THREE.Vector3(0, 1.2, 0), 1.3);
      await this.tween(750, () => {});
      return;
    }

    this.card = makeCard(card);
    this.card.position.set(0, -0.6, 0.2);
    this.card.scale.setScalar(0.05);
    this.card.rotation.y = Math.PI;
    this.root.add(this.card);
    await this.tween(1000, (p) => {
      const e = easeOutBack(p);
      this.card.scale.setScalar(0.05 + 0.95 * e);
      this.card.position.y = -0.6 + 0.9 * e;
      this.card.rotation.y = Math.PI * 3 * (1 - easeOut(p));
    }, 250);
    if (card.rarity === 'GOLDEN' || card.rarity === 'HOLO') {
      this.burst(['#f8c830', '#ff6080', '#60c0ff', '#ffffff'], new THREE.Vector3(0, 1.5, 0), 1.3);
    }
    this.cardIdle = true;
  }

  update(t, dt) {
    this.anims = this.anims.filter((a) => {
      const p = (t - a.t0) / a.dur;
      if (p < 0) return true;
      a.fn(Math.min(1, p));
      if (p >= 1) { a.res(); return false; }
      return true;
    });

    if (this.pack && this.idle) {
      this.pack.rotation.y = Math.sin(t / 900) * 0.6;
      this.pack.position.y = 0.3 + Math.sin(t / 380) * 0.1;
      const left = (this.shakeUntil || 0) - t;
      this.pack.rotation.z = left > 0 ? Math.sin(t / 22) * 0.3 * (left / 320) : 0;
    }
    if (this.sparkles) {
      animateSparkles(this.sparkles, t);
      this.sparkles.position.y = this.pack && this.idle ? this.pack.position.y : 0.3;
    }
    if (this.card && this.cardIdle) {
      this.card.rotation.y = Math.sin(t / 1100) * 0.3;
      this.card.position.y = 0.3 + Math.sin(t / 700) * 0.06;
    }
    if (this.card?.userData.shine) this.card.userData.shine.material.map.offset.x = t / 1800;
    if (this.card?.userData.glow) this.card.userData.glow.rotation.z = t / 3000;

    const list = this.parts.userData.p;
    list.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 9 * dt;
        p.pos.addScaledVector(p.vel, dt);
      }
      this.tmp.position.copy(p.pos);
      this.tmp.scale.setScalar(Math.max(0, Math.min(1, p.life)));
      this.tmp.rotation.set(p.pos.x * 3, p.pos.y * 3, 0);
      this.tmp.updateMatrix();
      this.parts.setMatrixAt(i, this.tmp.matrix);
    });
    this.parts.instanceMatrix.needsUpdate = true;
  }
}

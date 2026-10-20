// Draws 3D packs floating inside Google Street View. A transparent three.js canvas sits
// on top of the panorama and its camera copies the panorama's heading, pitch and zoom.
import * as THREE from 'three';
import { dist, bearing } from './geo.js';
import { makeBeam, makeShadow, makeSparkles, animateSparkles } from './voxel.js';
import { buildRealPack } from './pack3d.js';

const CAMERA_HEIGHT = 2.5; // Street View cameras sit roughly 2.5 m above the road

export class PackOverlay {
  constructor(stage, pano, onPick) {
    this.stage = stage;
    this.pano = pano;
    this.onPick = onPick;
    this.items = new Map();

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.className = 'overlay3d';
    stage.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(1, 2, 1.5);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
    this.camera.rotation.order = 'YXZ';
    this.ray = new THREE.Raycaster();

    addEventListener('resize', () => this.resize());
    this.resize();
    this.installPicking();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.renderer.setSize(r.width, r.height);
  }

  // Show exactly these packs; returns the ids that just appeared.
  sync(list) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, it] of this.items) {
      if (!ids.has(id)) { this.scene.remove(it.root); this.items.delete(id); }
    }
    const added = [];
    for (const p of list) {
      if (this.items.has(p.id)) continue;
      const it = { p, root: new THREE.Group(), born: performance.now() };
      this.items.set(p.id, it);
      this.scene.add(it.root);
      added.push(p.id);
      it.beam = makeBeam(p.gold);
      it.root.add(it.beam, makeShadow());
      it.sparkles = makeSparkles(p.gold);
      it.sparkles.position.y = 1.4;
      it.root.add(it.sparkles);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1.8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.y = 1.4;
      hit.userData.id = p.id;
      it.hit = hit;
      it.root.add(hit);
      buildRealPack(p.set, p.gold, { height: 1.3 }).then((model) => {
        if (!this.items.has(p.id)) return;
        it.model = model;
        it.root.add(model);
      });
    }
    return added;
  }

  loop(t) {
    requestAnimationFrame(this.loop);
    const pos = this.pano.getPosition();
    if (!pos || !this.pano.getVisible()) return;
    const here = { lat: pos.lat(), lng: pos.lng() };
    const pov = this.pano.getPov();
    const zoom = this.pano.getZoom() ?? 1;

    // Street View's horizontal field of view halves with every zoom level.
    const hfov = THREE.MathUtils.degToRad(Math.min(120, 180 / 2 ** zoom));
    this.camera.aspect = this.w / this.h;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect));
    this.camera.updateProjectionMatrix();
    this.camera.rotation.set(THREE.MathUtils.degToRad(pov.pitch), -THREE.MathUtils.degToRad(pov.heading), 0);

    for (const it of this.items.values()) {
      const d = dist(here, it.p);
      const b = THREE.MathUtils.degToRad(bearing(here, it.p));
      it.root.position.set(Math.sin(b) * d, -CAMERA_HEIGHT, -Math.cos(b) * d);
      const grow = Math.min(1, (t - it.born) / 500); // pop in
      it.root.scale.setScalar(Math.min(2.4, 1 + d / 20) * grow);
      // The beam helps spot packs down the street but would block the view up close.
      it.beam.material.opacity = (it.p.gold ? 0.3 : 0.22) * THREE.MathUtils.clamp((d - 8) / 12, 0, 1);
      if (it.model) {
        it.model.position.y = 1.4 + Math.sin(t / 450 + it.p.id) * 0.12;
        it.model.rotation.y = t / 800;
      }
      animateSparkles(it.sparkles, t);
    }
    this.renderer.render(this.scene, this.camera);
  }

  hitTest(e) {
    const r = this.stage.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    if (!pt || !this.items.size) return null;
    const ndc = { x: ((pt.clientX - r.left) / r.width) * 2 - 1, y: -((pt.clientY - r.top) / r.height) * 2 + 1 };
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects([...this.items.values()].map((i) => i.hit), false);
    return hits.length ? hits[0].object.userData.id : null;
  }

  // Catch taps on a pack before Street View treats them as "walk here".
  installPicking() {
    let swallow = false;
    let timer;
    const down = (e) => {
      if (!this.stage.contains(e.target)) return;
      if (swallow) { e.stopPropagation(); e.preventDefault(); return; }
      const id = this.hitTest(e);
      if (id == null) return;
      swallow = true;
      clearTimeout(timer);
      timer = setTimeout(() => (swallow = false), 700);
      e.stopPropagation();
      e.preventDefault();
      this.onPick(id);
    };
    const block = (e) => {
      if (!swallow) return;
      e.stopPropagation();
      e.preventDefault();
    };
    addEventListener('pointerdown', down, true);
    for (const type of ['mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click', 'dblclick']) {
      addEventListener(type, block, { capture: true, passive: false });
    }
  }
}

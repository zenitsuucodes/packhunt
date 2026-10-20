// Turns a pixel-art sprite into a chunky 3D voxel model, like a dropped item in Minecraft.
import * as THREE from 'three';

const cache = new Map();

export function voxelData(url, cols = 40) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = cols;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, cols, cols);
        const d = x.getImageData(0, 0, cols, cols).data;
        const px = [];
        let minX = cols, maxX = 0, minY = cols, maxY = 0;
        for (let y = 0; y < cols; y++) {
          for (let i = 0; i < cols; i++) {
            const k = (y * cols + i) * 4;
            if (d[k + 3] < 140) continue;
            px.push({ x: i, y, c: new THREE.Color(`rgb(${d[k]},${d[k + 1]},${d[k + 2]})`) });
            minX = Math.min(minX, i); maxX = Math.max(maxX, i);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
        resolve({ px, minX, maxX, minY, maxY });
      };
      img.onerror = reject;
      img.src = url;
    }));
  }
  return cache.get(url);
}

// Builds the pack. With `split`, the top rows become a separate mesh that can be torn off.
export function buildPack(data, { height = 1.2, depth = 3, split = 0 } = {}) {
  const rows = data.maxY - data.minY + 1;
  const vs = height / rows;
  const geo = new THREE.BoxGeometry(vs, vs, vs * depth);
  const mat = new THREE.MeshLambertMaterial();
  const cx = (data.minX + data.maxX) / 2;
  const cy = (data.minY + data.maxY) / 2;
  const cut = data.minY + Math.round(rows * split);

  const parts = { body: [], top: [] };
  for (const p of data.px) (split && p.y < cut ? parts.top : parts.body).push(p);

  const group = new THREE.Group();
  const m4 = new THREE.Matrix4();
  for (const [name, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      m4.makeTranslation((p.x - cx) * vs, (cy - p.y) * vs, 0);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, p.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    group.userData[name] = mesh;
  }
  return group;
}

// Tall glowing loot beam so packs can be spotted down the street.
export function makeBeam(gold) {
  const mat = new THREE.MeshBasicMaterial({
    color: gold ? 0xffc020 : 0x3090ff, transparent: true, opacity: gold ? 0.3 : 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 30, 12, 1, true), mat);
  beam.position.y = 15;
  return beam;
}

export function makeShadow() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), mat);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.03;
  return s;
}

// Little orbiting sparkle cubes around a pack.
export function makeSparkles(gold, count = 10) {
  const mat = new THREE.MeshBasicMaterial({ color: gold ? 0xfff0a0 : 0xffffff });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat, count);
  mesh.userData.seeds = Array.from({ length: count }, () => ({
    r: 0.55 + Math.random() * 0.35, y: Math.random() * 1.4 - 0.5, s: 0.6 + Math.random(), a: Math.random() * 6.28,
  }));
  return mesh;
}

const tmp = new THREE.Object3D();
export function animateSparkles(mesh, t) {
  mesh.userData.seeds.forEach((s, i) => {
    const a = s.a + t * 0.0012 * s.s;
    tmp.position.set(Math.cos(a) * s.r, s.y + Math.sin(t * 0.002 + i) * 0.15, Math.sin(a) * s.r);
    tmp.scale.setScalar(0.5 + 0.5 * Math.abs(Math.sin(t * 0.004 + i)));
    tmp.rotation.set(a, a, 0);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

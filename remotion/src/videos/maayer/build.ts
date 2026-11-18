// Static scenery: merged batches (one mesh per material), box-section strands rebuilt along a path every frame
// (chains, rails), and the town on both banks: gabled houses with painted facades, church, mill + chimneys, quay,
// hills and CC0 Kenney props (trees, lanterns, stalls, hedges).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { D0 } from "./legacy";
import { brick, rng, ctex, rep, jit, facadeHD, roofHD, stoneHD } from "./paint";
import { twoTone } from "./shade";
import { NOINK } from "./ink";
import { HUT, POND, BUS_STOP, INT, Light, DHEKI, WELL, STREET, MESS, ROOF, MED_GATE, STALL, SHOP, OFFICE, BEDROOM, V3 } from "./story";

export type Kit = Record<string, THREE.Object3D>;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------- materials (shared, cached) ----------------
const mats = new Map<string, THREE.Material>();
/** materials whose Strands are built as real interlocking chain links (MAT pass) instead of a textured box tube */
const CHAIN_MATS = new WeakSet<THREE.Material>();
export const lam = (key: string, make: () => THREE.MeshLambertMaterialParameters) => {
  let m = mats.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    if (key === "chainHD") {
      // MAT pass: the chain material (world.ts) becomes slate blue-grey iron with a soft painted-metal highlight;
      // its Strands switch to link geometry, so links read in close-ups (bank f1780, overhead f1650)
      const c = twoTone(new THREE.MeshPhongMaterial({ color: "#7a8490", specular: "#6c727b", shininess: 30 }));
      CHAIN_MATS.add(c);
      m = c as unknown as THREE.MeshLambertMaterial;
    } else m = twoTone(new THREE.MeshLambertMaterial(make()));
    mats.set(key, m);
  }
  return m;
};
const lamOf = new Map<string, THREE.MeshLambertMaterial>();
// the nature kit ships a teal palette; our valley wants storybook greens and browns
const GREENS = ["#62ae4c", "#56a447", "#72b853"];
const RECOLOR: Record<string, string> = { grass: "#6aab4f", leafsDark: "#4a9142", woodBark: "#8a5a3c", woodInner: "#e8cfa4", wood: "#a8724a",
  woodDark: "#7a4f33", dirt: "#8a6a4a", stone: "#b7b4ad" };
/** Kenney GLB materials -> Lambert, so the whole world shares one lighting model */
const toLambert = (m: THREE.Material) => {
  let l = lamOf.get(m.uuid);
  if (!l) {
    const s = m as THREE.MeshStandardMaterial;
    const col = m.name === "leafsGreen" ? GREENS[lamOf.size % 3] : RECOLOR[m.name];
    l = twoTone(new THREE.MeshLambertMaterial({ color: col ? new THREE.Color(col) : s.color?.clone() ?? new THREE.Color("#ffffff"), map: s.map ?? null, side: s.side, alphaTest: s.alphaTest }));
    lamOf.set(m.uuid, l);
  }
  return l;
};

// ---------------- geometry pieces ----------------
const f32 = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return new THREE.Float32BufferAttribute(out, a.itemSize);
};
/** quad a,b,c,d counter-clockwise seen from its front; uv (u0,v0) at a, (u1,v1) at c */
export const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u1 = 1, v1 = 1, u0 = 0, v0 = 0) => {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 2, 3, 4, 5].flatMap(() => [n.x, n.y, n.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  return g;
};
export const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 2].flatMap(() => [n.x, n.y, n.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  return g;
};
/** axis box from min to max, texture tiled every `tile` metres (0 = one image per face) */
export const boxGeo = (min: THREE.Vector3, max: THREE.Vector3, tile = 0, bottom = false) => {
  const [x0, y0, z0] = [min.x, min.y, min.z], [x1, y1, z1] = [max.x, max.y, max.z];
  const t = (a: number) => (tile ? a / tile : 1);
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const faces = [
    quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), t(w), t(h)),
    quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), t(w), t(h)),
    quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), t(d), t(h)),
    quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), t(d), t(h)),
    quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), t(w), t(d)),
  ];
  if (bottom) faces.push(quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), t(w), t(d)));
  return mergeGeometries(faces, false);
};

/** collects pieces by material and merges them into one static mesh per material */
export class Batch {
  private g = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const x = new THREE.BufferGeometry();
    x.setAttribute("position", f32(src.attributes.position));
    if (src.attributes.normal) x.setAttribute("normal", f32(src.attributes.normal)); else x.computeVertexNormals();
    x.setAttribute("uv", src.attributes.uv ? f32(src.attributes.uv) : new THREE.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    if (m) x.applyMatrix4(m);
    const l = this.g.get(mat);
    if (l) l.push(x); else this.g.set(mat, [x]);
  }
  addObject(o: THREE.Object3D, m: THREE.Matrix4) {
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.add(mesh.geometry, toLambert(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material), new THREE.Matrix4().multiplyMatrices(m, mesh.matrixWorld));
    });
  }
  build(parent: THREE.Object3D, cast = true) {
    for (const [mat, list] of this.g) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.g.clear();
  }
}

// ---------------- strands: box-section tube along a path, rebuilt in place ----------------
// chain-link template (MAT pass): a stadium-shaped ring tube in link space (x along the chain, y in the ring plane,
// z across), NS centre-line samples x NR tube sides, smooth normals (clean ink silhouettes, no facet creases)
const LNS = 16, LNR = 6;
type LinkT = { p: Float32Array; n: Float32Array; idx: number[]; pitch: number };
const linkTemplate = (h: number): LinkT => {
  const ow = h * 0.85, rb = ow * 0.14, ol = ow * 1.62, rc = ow / 2 - rb, hl = ol / 2 - rb - rc;
  const p = new Float32Array(LNS * LNR * 3), n = new Float32Array(LNS * LNR * 3), idx: number[] = [];
  for (let j = 0; j < LNS; j++) {
    const th = (2 * Math.PI * (j + 0.5)) / LNS, nx = Math.cos(th), ny = Math.sin(th);
    const cx = rc * nx + Math.sign(nx) * hl, cy = rc * ny;
    for (let k = 0; k < LNR; k++) {
      const ph = (2 * Math.PI * k) / LNR, cp = Math.cos(ph), sp = Math.sin(ph), o = (j * LNR + k) * 3;
      p[o] = cx + rb * cp * nx; p[o + 1] = cy + rb * cp * ny; p[o + 2] = rb * sp;
      n[o] = cp * nx; n[o + 1] = cp * ny; n[o + 2] = sp;
      const a = j * LNR + k, b = j * LNR + ((k + 1) % LNR), c = ((j + 1) % LNS) * LNR + ((k + 1) % LNR), d = ((j + 1) % LNS) * LNR + k;
      idx.push(a, d, c, a, c, b); // outward winding
    }
  }
  return { p, n, idx, pitch: ol - 4 * rb };
};

export class Strand {
  mesh: THREE.Mesh;
  private pos: Float32Array; private nor: Float32Array; private uv: Float32Array;
  private lt: LinkT | null = null; private maxLinks = 0;
  constructor(public n: number, public w: number, public h: number, mat: THREE.Material, public tile = 1, cast = true) {
    const g = new THREE.BufferGeometry();
    if (CHAIN_MATS.has(mat)) {
      // link mode: up to maxLinks interlocking links laid along the path every frame (draw range = links used)
      const lt = (this.lt = linkTemplate(h)), nv = LNS * LNR;
      this.maxLinks = 440;
      this.pos = new Float32Array(this.maxLinks * nv * 3); this.nor = new Float32Array(this.maxLinks * nv * 3); this.uv = new Float32Array(this.maxLinks * nv * 2);
      const idx = new Uint32Array(this.maxLinks * lt.idx.length);
      for (let l = 0; l < this.maxLinks; l++) for (let i = 0; i < lt.idx.length; i++) idx[l * lt.idx.length + i] = lt.idx[i] + l * nv;
      g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setDrawRange(0, 0);
    } else {
      this.pos = new Float32Array(n * 12); this.nor = new Float32Array(n * 12); this.uv = new Float32Array(n * 8);
      g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(this.nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
      const idx: number[] = [];
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) {
        const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = (i + 1) * 4 + ((k + 1) % 4), d = (i + 1) * 4 + k;
        idx.push(a, b, c, a, c, d);
      }
      g.setIndex(idx);
    }
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = cast; this.mesh.receiveShadow = true;
  }
  private T = new THREE.Vector3(); private S = new THREE.Vector3(); private N = new THREE.Vector3();
  /** link mode: links every `pitch` along the polyline, centred, alternating ring plane (vertical / horizontal) */
  private setLinks(pts: THREE.Vector3[], lt: LinkT) {
    const { T, S, N } = this, nv = LNS * LNR;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1], count = Math.max(0, Math.min(this.maxLinks, Math.floor(total / lt.pitch)));
    const s0 = (total - (count - 1) * lt.pitch) / 2;
    let seg = 1;
    for (let l = 0; l < count; l++) {
      const s = s0 + l * lt.pitch;
      while (seg < pts.length - 1 && cum[seg] < s) seg++;
      const a = pts[seg - 1], b = pts[seg], u = (s - cum[seg - 1]) / Math.max(1e-6, cum[seg] - cum[seg - 1]);
      const px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u, pz = a.z + (b.z - a.z) * u;
      T.subVectors(b, a).normalize();
      S.set(-T.z, 0, T.x); // T x up
      if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
      S.normalize(); N.crossVectors(S, T).normalize();
      const odd = l % 2 === 1;
      // ring plane: (T, N) for even links, (T, S) for odd links; z (thickness) across it
      const yx = odd ? S.x : N.x, yy = odd ? S.y : N.y, yz = odd ? S.z : N.z;
      const zx = odd ? -N.x : S.x, zy = odd ? -N.y : S.y, zz = odd ? -N.z : S.z;
      const base = l * nv * 3;
      for (let v = 0; v < nv * 3; v += 3) {
        const x = lt.p[v], y = lt.p[v + 1], z = lt.p[v + 2], o = base + v;
        this.pos[o] = px + T.x * x + yx * y + zx * z;
        this.pos[o + 1] = py + T.y * x + yy * y + zy * z;
        this.pos[o + 2] = pz + T.z * x + yz * y + zz * z;
        const nx = lt.n[v], ny = lt.n[v + 1], nz = lt.n[v + 2];
        this.nor[o] = T.x * nx + yx * ny + zx * nz;
        this.nor[o + 1] = T.y * nx + yy * ny + zy * nz;
        this.nor[o + 2] = T.z * nx + yz * ny + zz * nz;
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, count * lt.idx.length);
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
  set(pts: THREE.Vector3[]) {
    if (this.lt) { this.setLinks(pts, this.lt); return; }
    const { T, S, N } = this;
    let len = 0;
    for (let i = 0; i < this.n; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      T.subVectors(b, a).normalize();
      S.crossVectors(T, V(0, 1, 0));
      if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
      S.normalize(); N.crossVectors(S, T).normalize();
      if (i) len += p.distanceTo(pts[Math.min(i - 1, pts.length - 1)]);
      for (let k = 0; k < 4; k++) {
        const sx = k === 0 || k === 3 ? -1 : 1, sy = k < 2 ? -1 : 1, j = (i * 4 + k) * 3;
        this.pos[j] = p.x + S.x * sx * this.w / 2 + N.x * sy * this.h / 2;
        this.pos[j + 1] = p.y + S.y * sx * this.w / 2 + N.y * sy * this.h / 2;
        this.pos[j + 2] = p.z + S.z * sx * this.w / 2 + N.z * sy * this.h / 2;
        const nx = S.x * sx + N.x * sy, ny = S.y * sx + N.y * sy, nz = S.z * sx + N.z * sy, nl = Math.hypot(nx, ny, nz);
        this.nor[j] = nx / nl; this.nor[j + 1] = ny / nl; this.nor[j + 2] = nz / nl;
        this.uv[(i * 4 + k) * 2] = k / 4; this.uv[(i * 4 + k) * 2 + 1] = len / this.tile;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.uv.needsUpdate = true;
  }
}

// ---------------- set dressing around the lens ----------------
/** a sight line of the film: from the lens toward the shot's subject, `len` along d (d has unit forward component) */
export type Ray = { o: THREE.Vector3; d: THREE.Vector3; len: number; core: boolean };
let sight: Ray[] = [];
/** does any sight line pass through this box? (centre lines only for small props, so they can still frame a shot) */
const inTheWay = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, coreOnly = false) => {
  for (const { o, d, len, core } of sight) {
    if (coreOnly && !core) continue;
    let t0 = 0, t1 = len;
    for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) t0 = Infinity; continue; }
      const ta = (a - oo) / dd, tb = (b - oo) / dd;
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t0 <= t1) return true;
  }
  return false;
};

// ---------------- cartoon vegetation (MAT pass) ----------------
// Kenney's faceted low-poly trees and box hedges -> rounded storybook shapes: clustered smooth spheres for canopies
// (the two-tone sun term gives each lobe a lit cap and a cool belly), tapered trunks, rounded-box hedges. Smooth
// normals mean the world ink draws clean silhouettes and lobe-to-lobe folds instead of a crease on every facet.
type VegKind = "round" | "fat" | "tall" | "cone" | "bush" | "hedge";
const VEG: Record<string, VegKind> = {
  tree_oak: "round", tree_default: "round", tree_detailed: "round", tree_fat: "fat", "tree-high-round": "tall", tree: "tall",
  tree_cone: "cone", plant_bushLarge: "bush", plant_bushDetailed: "bush", plant_bush: "bush", hedge: "hedge",
};
const LEAF = ["#5aa83c", "#4c9a37", "#69b545", "#55a243", "#3f8f3c"];
/** canopy paint (equal px per metre on a unit sphere: 256 around x 128 pole to pole): light crown, darker belly,
 *  soft leaf-clump dabs (kept low contrast: the two-tone sun term does the main modelling) */
const leafTex = (i: number) => ctex("leafHD" + i, 256, 128, (g, r) => {
  const base = new THREE.Color(LEAF[i]), top = base.clone().offsetHSL(0.012, 0.03, 0.08), bot = base.clone().offsetHSL(-0.015, 0.0, -0.08);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#" + top.getHexString()); gr.addColorStop(0.42, "#" + base.getHexString()); gr.addColorStop(1, "#" + bot.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 46; k++) {
    const x = r() * 256, y = 10 + r() * 108, rad = 5 + r() * 9, light = y < 64 ? r() < 0.7 : r() < 0.25;
    for (const ox of [-256, 0, 256]) {
      g.strokeStyle = light ? "rgba(225,255,170,0.22)" : "rgba(20,70,30,0.2)"; g.lineWidth = 2.5; g.lineCap = "round";
      g.beginPath(); g.arc(x + ox, y + rad * 0.6, rad, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
  }
});
const leafMat = (i: number) => lam("leafHD" + i, () => ({ map: leafTex(i) }));
/** warm bark: no cool shade lift (it turned brown trunks purple) plus a small warm floor in shade */
const warmLam = (key: string, p: THREE.MeshLambertMaterialParameters) => {
  let m = mats.get(key);
  if (!m) { m = twoTone(new THREE.MeshLambertMaterial(p), 0); mats.set(key, m); }
  return m;
};
const barkMat = () => warmLam("barkWarm", { color: "#9a6434", emissive: "#4a2810" });
const vegGeo = new Map<string, THREE.BufferGeometry>();
const lobeGeo = (q: number) => {
  const k = "lobe" + q;
  let g = vegGeo.get(k);
  if (!g) { g = new THREE.SphereGeometry(1, [20, 14, 10][q], [14, 10, 7][q]); vegGeo.set(k, g); }
  return g;
};
const trunkGeo = () => {
  let g = vegGeo.get("trunk");
  if (!g) { g = new THREE.CylinderGeometry(0.6, 1, 1, 10, 1, true).translate(0, 0.5, 0); vegGeo.set("trunk", g); }
  return g;
};
/** rounded box (exact: inner box + radius), unit size along x, smooth normals; used for hedges */
const hedgeGeo = () => {
  let g = vegGeo.get("hedge");
  if (!g) {
    g = new THREE.BoxGeometry(1, 1, 1, 18, 10, 10);
    const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
    // per-axis rounding radii in unit space (~0.35 m at the ends, ~0.45 m on top / sides at 3.3 x 1.56 x 1.17 m);
    // flat bottom (it sits on the lawn)
    const R = [0.106, 0.29, 0.385], v = new THREE.Vector3(), e = new THREE.Vector3(), q = [0, 0, 0];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      for (let a = 0; a < 3; a++) {
        const c = v.getComponent(a), lim = a === 1 && c < 0 ? 0.5 : 0.5 - R[a];
        q[a] = THREE.MathUtils.clamp(c, -lim, lim); e.setComponent(a, (c - q[a]) / R[a]);
      }
      const L = e.length();
      if (L < 1e-6) continue;
      e.divideScalar(L);
      p.setXYZ(i, q[0] + e.x * R[0], q[1] + e.y * R[1], q[2] + e.z * R[2]);
      const nn = new THREE.Vector3(e.x / R[0], e.y / R[1], e.z / R[2]).normalize();
      n.setXYZ(i, nn.x, nn.y, nn.z);
    }
    g.translate(0, 0.5, 0);
    vegGeo.set("hedge", g);
  }
  return g;
};
const yawQ = (a: number) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
/** half-width of a cartoon plant of kind k and height h (for the sight-line test) */
const vegRad = (k: VegKind, h: number) => (k === "hedge" ? 1.7 : k === "bush" ? 0.85 * h : k === "tall" ? 0.2 * h : k === "cone" ? 0.27 * h : k === "fat" ? 0.44 * h : 0.39 * h);
/** add one cartoon plant to a batch: base at (x, y, z), height h, q = lobe detail (0 near .. 2 far) */
const addVeg = (b: Batch, k: VegKind, x: number, y: number, z: number, h: number, seed: number, q = 0) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 7), U = (a: number, c: number) => a + (c - a) * r();
  const leaf = leafMat(k === "cone" ? 4 : k === "hedge" ? 1 : Math.floor(r() * 4)), lobe = lobeGeo(q), yaw = r() * 6.28;
  const put = (px: number, py: number, pz: number, rad: number, sy = 0.9) =>
    b.add(lobe, leaf, new THREE.Matrix4().compose(V(x + px, y + py, z + pz), yawQ(r() * 6.28), V(rad, rad * sy, rad)));
  const trunk = (th: number, tr: number) =>
    b.add(trunkGeo(), barkMat(), new THREE.Matrix4().compose(V(x, y - 0.15, z), yawQ(yaw), V(tr, th + 0.15, tr)));
  const ring = (n: number, dist: number, r0: number, r1: number, cy: number, dy: number) => {
    const a0 = r() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i * 6.28) / n + U(-0.35, 0.35), dd = dist * U(0.85, 1.12);
      put(Math.cos(a) * dd, cy + U(-dy, dy), Math.sin(a) * dd, U(r0, r1));
    }
  };
  if (k === "round" || k === "fat") {
    const f = k === "fat";
    trunk((f ? 0.4 : 0.48) * h, 0.055 * h);
    const cy = (f ? 0.58 : 0.64) * h;
    put(0, cy, 0, (f ? 0.29 : 0.26) * h);
    ring(f ? 5 : 4, (f ? 0.22 : 0.18) * h, (f ? 0.19 : 0.17) * h, (f ? 0.23 : 0.21) * h, cy - 0.05 * h, 0.04 * h);
    put(U(-0.05, 0.05) * h, cy + (f ? 0.15 : 0.17) * h, U(-0.05, 0.05) * h, (f ? 0.19 : 0.17) * h);
  } else if (k === "tall") {
    trunk(0.34 * h, 0.045 * h);
    put(0, 0.47 * h, 0, 0.17 * h, 1.3);
    put(U(-0.03, 0.03) * h, 0.65 * h, U(-0.03, 0.03) * h, 0.15 * h, 1.3);
    put(0, 0.82 * h, 0, 0.11 * h, 1.25);
    ring(3, 0.1 * h, 0.1 * h, 0.12 * h, 0.55 * h, 0.06 * h);
  } else if (k === "cone") {
    trunk(0.2 * h, 0.05 * h);
    put(0, 0.3 * h, 0, 0.26 * h, 0.62);
    put(0, 0.5 * h, 0, 0.2 * h, 0.66);
    put(0, 0.68 * h, 0, 0.14 * h, 0.75);
    put(0, 0.84 * h, 0, 0.08 * h, 1.0);
  } else if (k === "bush") {
    put(0, 0.46 * h, 0, 0.5 * h);
    ring(3, 0.42 * h, 0.32 * h, 0.38 * h, 0.32 * h, 0.04 * h);
  } else { // hedge segment, 3.3 m along local x
    b.add(hedgeGeo(), leaf, new THREE.Matrix4().compose(V(x, y - 0.06, z), new THREE.Quaternion(), V(3.3, h + 0.06, Math.max(0.9, h * 0.78))));
  }
};

// ---------------- painted cloth banner (MAT round 3) ----------------
// The Kenney banner is one flat face of the saturated colour atlas: in golden light it kept a uniform, hot red and
// read as pasted on. Ours is a hanging cloth with real folds (smooth normals, so the two-tone light rolls across
// them), a swallow-tail hem, a muted crimson (sat ~-25 %) with an ochre border and a diamond like the tower flags.
const BANNER_COL: Record<string, string> = { "banner-red": "#b8553a", "banner-green": "#4f8a5a" }; // warm red: no purple in shade
const FOLD = 0.27, CLOTH_W = 1.1, CLOTH_H = 2.6; // fold period across the cloth, cloth size (m)
const bannerTex = (col: string) => ctex("bannerHD" + col, 256, 700, (g) => {
  const W = 256, H = 700, base = new THREE.Color(col);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#" + base.clone().offsetHSL(0, 0, 0.04).getHexString()); gr.addColorStop(1, "#" + base.clone().offsetHSL(0, 0, -0.06).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) { // painted fold shading, in phase with the geometry folds
    const s = Math.sin((x / W) * (CLOTH_W / FOLD) * Math.PI * 2);
    g.fillStyle = s > 0 ? `rgba(255,235,215,${0.1 * s})` : `rgba(60,15,15,${-0.12 * s})`; g.fillRect(x, 0, 1, H);
  }
  g.fillStyle = "#" + base.clone().offsetHSL(0, -0.05, -0.12).getHexString(); g.fillRect(0, 0, W, 54); // top hem
  g.strokeStyle = "#d1aa5c"; g.lineWidth = 9; g.strokeRect(20, 66, W - 40, H - 86);                 // ochre border
  g.strokeStyle = "rgba(60,30,20,0.45)"; g.lineWidth = 2; g.strokeRect(14, 60, W - 28, H - 74); g.strokeRect(26, 72, W - 52, H - 98);
  g.fillStyle = "#d1aa5c"; g.fillRect(0, 46, W, 8);
  const cx = W / 2, cy = 250; // emblem: diamond (the tower flags' motif) on a light disc
  g.fillStyle = "#efe2c2"; g.beginPath(); g.arc(cx, cy, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(60,30,20,0.55)"; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#d1aa5c"; g.beginPath(); g.moveTo(cx, cy - 46); g.lineTo(cx + 34, cy); g.lineTo(cx, cy + 46); g.lineTo(cx - 34, cy); g.closePath(); g.fill();
  g.strokeStyle = "rgba(60,30,20,0.6)"; g.lineWidth = 2.5; g.stroke();
});
const bannerGeo = () => {
  let geo = vegGeo.get("banner");
  if (!geo) {
    const w = CLOTH_W, hh = CLOTH_H, notch = 0.42;
    geo = new THREE.PlaneGeometry(w, hh, 16, 20).translate(0, -hh / 2, 0); // top edge at y = 0
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), t = -y / hh; // 0 top .. 1 bottom
      p.setY(i, y + notch * (1 - Math.abs(x) / (w / 2)) * t * t);                              // swallow-tail hem
      p.setZ(i, (0.025 + 0.055 * t) * Math.sin((x / FOLD) * Math.PI * 2 + 0.6) + 0.04 * t * t); // folds deepen downwards
    }
    geo.computeVertexNormals();
    vegGeo.set("banner", geo);
  }
  return geo;
};
/** gonfalon on a pole where the Kenney banner plate stood: its plate hung 0.4 x scale beside the placement point,
 *  facing local +-x, so the pole goes there (same framing) and the cloth faces that way */
const bannerProp = (b: Batch, name: string, x0: number, y: number, z0: number, h: number, yaw0: number) => {
  const off = 0.4 * (h / 0.84), x = x0 + Math.cos(yaw0) * off, z = z0 - Math.sin(yaw0) * off, yaw = yaw0 + Math.PI / 2;
  if (inTheWay(x - 0.7, x + 0.7, y, y + h, z - 0.7, z + 0.7, true)) return;
  const col = BANNER_COL[name] ?? "#b4524b";
  const M = (px: number, py: number, pz: number) => new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z).multiply(new THREE.Matrix4().makeTranslation(px, py, pz));
  const pole = lam("bannerPole", () => ({ color: "#6e4b33" })), gold = lam("bannerGold", () => ({ color: "#c9a24e" }));
  b.add(new THREE.CylinderGeometry(0.045, 0.06, h, 10).translate(0, h / 2, 0), pole, M(0, 0, 0));
  b.add(new THREE.SphereGeometry(0.1, 14, 10), gold, M(0, h + 0.06, 0));
  b.add(new THREE.CylinderGeometry(0.03, 0.03, CLOTH_W + 0.2, 8).rotateZ(Math.PI / 2), pole, M(0, h - 0.18, 0.06));
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.045, 10, 8), gold, M(s * (CLOTH_W / 2 + 0.12), h - 0.18, 0.06));
  b.add(bannerGeo(), lam("bannerHD" + col, () => ({ map: bannerTex(col), side: THREE.DoubleSide })), M(0, h - 0.2, 0.1));
};

// ---------------- Kenney props ----------------
const boxes = new Map<THREE.Object3D, THREE.Box3>();
/** place a Kenney model with its base on y, scaled to height h (left out when it would stand in front of the lens).
 *  Trees, bushes and hedges are drawn as cartoon vegetation, banners as painted cloth instead (MAT pass). */
export const prop = (b: Batch, kit: Kit, name: string, x: number, y: number, z: number, h: number, yaw = 0) => {
  if (name.startsWith("banner")) { bannerProp(b, name, x, y, z, h, yaw); return; }
  const vk = VEG[name];
  if (vk) {
    const rad = vegRad(vk, h);
    if (inTheWay(x - rad, x + rad, y, y + h, z - rad, z + rad, true)) return;
    const d = Math.hypot(x, z);
    addVeg(b, vk, x, y, z, h, x * 92.7 + z * 31.3 + yaw * 1000, d > 200 ? 2 : Math.abs(z) > 45 && d > 60 ? 1 : 0);
    return;
  }
  const o = kit[name];
  if (!o) return;
  let box = boxes.get(o);
  if (!box) { box = new THREE.Box3().setFromObject(o); boxes.set(o, box); }
  const s = h / Math.max(0.01, box.max.y - box.min.y), r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s * 0.5;
  if (inTheWay(x - r, x + r, y, y + h, z - r, z + r, true)) return;
  b.addObject(o, new THREE.Matrix4().compose(V(x, y - box.min.y * s, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(s, s, s)));
};

/** a Kenney model as its own object (two-tone materials), base at y = 0, scaled to height h (no sight-line test:
 *  used for the CAM agent's FOREGROUND framing objects, which are meant to stand in front of the lens) */
export const kitClone = (kit: Kit, name: string, h: number): THREE.Object3D | null => {
  const pc = procClone(name, h); // village plants are procedural (no model files)
  if (pc) return pc;
  const vk = VEG[name];
  if (vk) { // cartoon plant as its own object (MAT pass), base at y = 0
    const vb = new Batch(), grp = new THREE.Group();
    addVeg(vb, vk, 0, 0, 0, h, name.length * 977 + h * 131, 0);
    vb.build(grp, false);
    grp.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = true; } });
    return grp;
  }
  const o = kit[name];
  if (!o) return null;
  let box = boxes.get(o);
  if (!box) { box = new THREE.Box3().setFromObject(o); boxes.set(o, box); }
  const c = o.clone(true), s = h / Math.max(0.01, box.max.y - box.min.y);
  c.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) { m.material = toLambert(Array.isArray(m.material) ? m.material[0] : m.material); m.castShadow = false; m.receiveShadow = true; }
  });
  const g = new THREE.Group();
  c.position.y = -box.min.y * s; c.scale.setScalar(s);
  g.add(c);
  return g;
};

// ---------------- houses ----------------
type Style = { wall: string; shutter: string; roof: string; timber?: boolean; brick?: boolean };
// MAT pass: warm ochre / cream / sandstone / salmon walls + one blue-grey (the old pinks, whites and grey-blues read
// lavender: the two-tone shade multiplies by a blue-violet, so a near-neutral albedo turns lilac on every shaded face)
// round 3: saturation -35 % on every wall (neutral warm grey / beige; the salmon became a warm greige)
// round 4: the pale greiges still read lavender-grey in shade -> a muted brick / cream / ochre / terracotta spread
const STYLES: Style[] = [
  { wall: "#ecdab2", shutter: "#3f6fb5", roof: "#d27a62" },              // cream
  { wall: "#d8a95f", shutter: "#2f6a43", roof: "#b8644f" },              // ochre
  { wall: "#c47a5c", shutter: "#2f5f6a", roof: "#8f97a8" },              // muted brick-red plaster
  { wall: "#efdcb8", shutter: "#2f5f6a", roof: "#c9775a", timber: true }, // cream timber frame
  { wall: "#ddbd78", shutter: "#5a3b2a", roof: "#d27a62" },              // straw ochre
  { wall: "#cc9a6c", shutter: "#3f6fb5", roof: "#8e7aa0" },              // terracotta sand
  { wall: "#e2c49a", shutter: "#8c3b4a", roof: "#c9775a" },              // warm sandstone
  { wall: "#e3d2b8", shutter: "#2f6a43", roof: "#8f97a8", brick: true },
];
const roofMat = (col: string) => lam("roof" + col, () => ({ map: roofHD(col, col === "#8f97a8"), side: THREE.DoubleSide }));

/** gabled house: front facade (local +z) at width w, depth d, wall height h, ridge along local x (left out if it blocks a shot) */
export const house = (b: Batch, x: number, z: number, yaw: number, w: number, d: number, h: number, si: number, y = D0) => {
  const across = Math.abs(Math.sin(yaw)) > 0.5, hx = (across ? d : w) / 2 + 0.6, hz = (across ? w : d) / 2 + 0.6;
  if (inTheWay(x - hx, x + hx, y, y + h + d * 0.42 + 1.2, z - hz, z + hz)) return;
  const st = STYLES[si % STYLES.length];
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const front = lam(`hf${si}_${w}_${h}`, () => ({ map: facadeHD(`hf${si}_${w}_${h}`, w, h, { ...st, door: true }) }));
  const side = lam(`hs${si}_${h}`, () => ({ map: facadeHD(`hs${si}_${h}`, 8, h, st) }));
  const wall = lam("wall" + st.wall, () => ({ color: st.brick ? "#c8643f" : st.wall }));
  const hw = w / 2, hd = d / 2, rh = d * 0.42, o = 0.35;
  b.add(quad(V(-hw, 0, hd), V(hw, 0, hd), V(hw, h, hd), V(-hw, h, hd)), front, m);
  b.add(quad(V(hw, 0, -hd), V(-hw, 0, -hd), V(-hw, h, -hd), V(hw, h, -hd)), side, m);
  b.add(quad(V(-hw, 0, -hd), V(-hw, 0, hd), V(-hw, h, hd), V(-hw, h, -hd)), side, m);
  b.add(quad(V(hw, 0, hd), V(hw, 0, -hd), V(hw, h, -hd), V(hw, h, hd)), side, m);
  b.add(tri(V(-hw, h, -hd), V(-hw, h, hd), V(-hw, h + rh, 0)), wall, m);
  b.add(tri(V(hw, h, hd), V(hw, h, -hd), V(hw, h + rh, 0)), wall, m);
  const ru = (w + 2 * o) / 4, rv = Math.hypot(hd + o, rh) / 4, rm = roofMat(st.roof);
  b.add(quad(V(-hw - o, h - 0.25, hd + o), V(hw + o, h - 0.25, hd + o), V(hw + o, h + rh, 0), V(-hw - o, h + rh, 0), ru, rv), rm, m);
  b.add(quad(V(hw + o, h - 0.25, -hd - o), V(-hw - o, h - 0.25, -hd - o), V(-hw - o, h + rh, 0), V(hw + o, h + rh, 0), ru, rv), rm, m);
  const cx = hw * 0.45 * (si % 2 ? 1 : -1);
  b.add(boxGeo(V(cx - 0.4, h + rh * 0.3, -hd * 0.35 - 0.4), V(cx + 0.4, h + rh + 1.1, -hd * 0.35 + 0.4), 2), lam("chim", () => ({ map: rep(brick(), 1, 1) })), m);
  houseDetail(b, m, w, d, h, rh, cx);
};

// round 4: real 3D relief on every house (was a flat window-textured box): stone plinth, cornice under the eaves,
// window sills + lintel hoods matching facadeHD's window layout, front door step + door hood, chimney cap and pot
const UB = new THREE.BoxGeometry(1, 1, 1);
const trimM = () => lam("trimStone", () => ({ color: "#efe3c8" }));
const capM = () => lam("chimCap", () => ({ color: "#9a8778" }));
const plinthM = () => lam("plinthHD", () => ({ map: stoneHD("copeHD") }));
const ub = (b: Batch, mat: THREE.Material, m: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  b.add(UB, mat, m.clone().multiply(new THREE.Matrix4().compose(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), new THREE.Quaternion(), V(x1 - x0, y1 - y0, z1 - z0))));
const houseDetail = (b: Batch, m: THREE.Matrix4, w: number, d: number, h: number, rh: number, chx: number) => {
  const hw = w / 2, hd = d / 2, tm = trimM(), floors = Math.max(1, Math.floor(h / 2.8));
  b.add(boxGeo(V(-hw - 0.07, -0.05, -hd - 0.07), V(hw + 0.07, 0.45, hd + 0.07), 2), plinthM(), m);          // plinth
  ub(b, tm, m, -hw - 0.12, hw + 0.12, h - 0.52, h - 0.25, hd, hd + 0.17);                                   // cornice front
  ub(b, tm, m, -hw - 0.12, hw + 0.12, h - 0.52, h - 0.25, -hd - 0.17, -hd);                                 // cornice back
  for (const s of [-1, 1]) ub(b, tm, m, s < 0 ? -hw - 0.17 : hw, s < 0 ? -hw : hw + 0.17, h - 0.52, h - 0.25, -hd - 0.12, hd + 0.12);
  // windows: facadeHD puts nWin = floor(width / 2.2) per floor at (i + 0.5) / nWin, sill line fl * 2.8 + 0.9 m
  const wins = (len: number, door: boolean, at: (u: number) => [number, number], out: [number, number]) => {
    const n = Math.max(1, Math.floor(len / 2.2));
    for (let fl = 0; fl < floors; fl++) for (let i = 0; i < n; i++) {
      const [px, pz] = at((i + 0.5) / n), yb = fl * 2.8 + 0.9;
      if (door && fl === 0 && i === Math.floor(n / 2)) {
        const along = (k: number) => [px + out[1] * k, pz - out[0] * k] as const; // along the wall (perpendicular to out)
        const [ax, az] = along(-0.82), [bx, bz] = along(0.82), [cx2, cz2] = along(-0.78), [dx2, dz2] = along(0.78);
        ub(b, plinthM(), m, Math.min(ax, bx, ax + out[0] * 0.5), Math.max(ax, bx, ax + out[0] * 0.5), 0, 0.2, Math.min(az, bz, az + out[1] * 0.5), Math.max(az, bz, az + out[1] * 0.5)); // step
        ub(b, tm, m, Math.min(cx2, dx2, cx2 + out[0] * 0.34), Math.max(cx2, dx2, cx2 + out[0] * 0.34), 2.3, 2.44, Math.min(cz2, dz2, cz2 + out[1] * 0.34), Math.max(cz2, dz2, cz2 + out[1] * 0.34)); // hood
        continue;
      }
      for (const [y0, y1, dep, half] of [[yb - 0.2, yb - 0.08, 0.14, 0.6], [yb + 1.33, yb + 1.43, 0.08, 0.55]] as const) {
        const ax = px - out[1] * half, az = pz + out[0] * half, bx = px + out[1] * half, bz = pz - out[0] * half;
        ub(b, tm, m, Math.min(ax, bx, ax + out[0] * dep), Math.max(ax, bx, ax + out[0] * dep), y0, y1, Math.min(az, bz, az + out[1] * dep), Math.max(az, bz, az + out[1] * dep));
      }
    }
  };
  wins(w, true, (u) => [-hw + u * w, hd], [0, 1]);            // front (+z), u from -x to +x
  wins(8, false, (u) => [hw - u * w, -hd], [0, -1]);          // back: side texture (8 m layout) stretched over w
  wins(8, false, (u) => [-hw, -hd + u * d], [-1, 0]);         // left side (-x): side texture is always the 8 m layout
  wins(8, false, (u) => [hw, hd - u * d], [1, 0]);            // right side (+x)
  // chimney cap + pot
  const cz = -hd * 0.35, top = h + rh + 1.1;
  ub(b, capM(), m, chx - 0.52, chx + 0.52, top, top + 0.16, cz - 0.52, cz + 0.52);
  b.add(new THREE.CylinderGeometry(0.13, 0.16, 0.42, 10).translate(0, 0.21, 0), lam("chimPot", () => ({ color: "#b8684a" })), m.clone().multiply(new THREE.Matrix4().makeTranslation(chx, top + 0.16, cz)));
};

// ---------------- painted extras ----------------
const chapelTex = () => ctex("chapel", 512, 512, (g) => {
  g.fillStyle = "#e9e0cc"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(0,0,0,.06)"; for (let y = 0; y < 512; y += 32) g.fillRect(0, y, 512, 2);
  for (const cx of [128, 384]) {
    g.fillStyle = "#33406b"; g.strokeStyle = "rgba(40,30,40,.85)"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx - 40, 430); g.lineTo(cx - 40, 190); g.arc(cx, 190, 40, Math.PI, 0); g.lineTo(cx + 40, 430); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "rgba(160,200,255,.35)"; g.fillRect(cx - 30, 200, 16, 220);
    g.strokeStyle = "#d9c9a0"; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, 160); g.lineTo(cx, 430); g.moveTo(cx - 40, 300); g.lineTo(cx + 40, 300); g.stroke();
  }
});
const clockTex = () => ctex("clock", 256, 256, (g) => {
  g.fillStyle = "#f7f1e1"; g.strokeStyle = "#221f2e"; g.lineWidth = 12;
  g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill(); g.stroke();
  g.lineCap = "round";
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; g.lineWidth = 8; g.beginPath(); g.moveTo(128 + 80 * Math.cos(a), 128 + 80 * Math.sin(a)); g.lineTo(128 + 96 * Math.cos(a), 128 + 96 * Math.sin(a)); g.stroke(); }
  g.lineWidth = 12; g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 62); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(178, 150); g.stroke();
});
/** round 4: St George's cross (England, 1831): white field, red cross (the old red + yellow diamond read as Vietnam's flag) */
export const flagTex = () => ctex("flagStGeorge", 256, 160, (g) => {
  g.fillStyle = "#f4f0e6"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#c8323a"; g.fillRect(0, 62, 256, 36); g.fillRect(110, 0, 36, 160);
  g.fillStyle = "rgba(120,100,90,0.10)"; g.fillRect(0, 150, 256, 10); // soft hem shade
});

// ---------------- town ----------------
const inPark = (x: number, z: number) => z < 0 && x > 46 && x < 96 && z > -100 && z < -49;
const inMill = (x: number, z: number) => z < 0 && x > -66 && x < -14 && z > -90 && z < -54;
const inChurch = (x: number, z: number) => (z > 0 && x > 10 && x < 38 && z > 46 && z < 84) || (z > 0 && x > 86 && x < 110 && z > 60 && z < 84);

export const buildTown = (root: THREE.Object3D, kit: Kit, rays: Ray[] = []) => {
  const b = new Batch(), r = rng(11);
  sight = rays;
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length) % a.length];
  for (const bank of [-1, 1]) {
    const away = bank > 0 ? Math.PI : 0; // fronts face the river
    // riverfront rows, fronts on the quay at |z| = 36.5
    for (const sx of [-1, 1]) {
      let x = 8.5;
      while (x < 134) {
        const w = pick([7, 9]), h = pick([7, 8.4, 9.8]), cx = sx * (x + w / 2), cz = bank * 40.5;
        house(b, cx, cz, away, w, 8, h, Math.floor(r() * 8));
        x += w + (r() < 0.25 ? 2.5 : 0.25);
      }
    }
    // main street, fronts on |x| = 6
    for (const sx of [-1, 1]) {
      let z = 46;
      while (z < 150) {
        const w = pick([7, 9]), h = pick([7, 8.4, 9.8]);
        if (!inChurch(sx * 10, bank * (z + w / 2))) house(b, sx * 10, bank * (z + w / 2), sx < 0 ? Math.PI / 2 : -Math.PI / 2, w, 8, h, Math.floor(r() * 8));
        z += w + (r() < 0.2 ? 3 : 0.3);
      }
    }
    // back rows
    for (const zf of [52, 66, 80, 96]) for (const sx of [-1, 1]) {
      let x = 17 + r() * 4;
      while (x < 124) {
        const w = pick([7, 9]), h = pick([7, 8.4, 9.8]), cx = sx * (x + w / 2), cz = bank * (zf + 4 + r() * 2);
        if (r() > 0.22 && !inPark(cx, cz) && !inMill(cx, cz) && !inChurch(cx, cz)) house(b, cx, cz, away, w, 8, h, Math.floor(r() * 8));
        x += w + 1 + r() * 4;
      }
    }
  }
  // church on the far bank: nave, tower, spire, clock
  const ch = lam("chapel", () => ({ map: chapelTex() })), st = lam("towerstone", () => ({ map: stoneHD("tstoneHD") })); // 2048 canvas at its own repeat 0.5 (paint.ts)
  b.add(boxGeo(V(18.5, D0, 57), V(29.5, D0 + 9, 80), 6), ch);
  const sl = roofMat("#8f97a8");
  b.add(quad(V(18.1, D0 + 8.8, 57), V(18.1, D0 + 8.8, 80.4), V(24, D0 + 13.5, 80.4), V(24, D0 + 13.5, 57), 6, 2), sl);
  b.add(quad(V(29.9, D0 + 8.8, 80.4), V(29.9, D0 + 8.8, 57), V(24, D0 + 13.5, 57), V(24, D0 + 13.5, 80.4), 6, 2), sl);
  b.add(tri(V(18.5, D0 + 9, 80), V(29.5, D0 + 9, 80), V(24, D0 + 13.5, 80)), st);
  b.add(boxGeo(V(21.4, D0, 51.6), V(26.6, D0 + 19, 57), 4), st);
  b.add(boxGeo(V(21.1, D0 + 18.6, 51.3), V(26.9, D0 + 19.4, 57.3), 4), st);
  const spire = new THREE.ConeGeometry(4.0, 13, 4, 1);
  spire.rotateY(Math.PI / 4);
  b.add(spire, sl, new THREE.Matrix4().makeTranslation(24, D0 + 19.4 + 6.5, 54.3));
  b.add(tri(V(29.5, D0 + 9, 57), V(18.5, D0 + 9, 57), V(24, D0 + 13.5, 57)), st);
  b.add(quad(V(25.1, D0 + 12.4, 51.55), V(22.9, D0 + 12.4, 51.55), V(22.9, D0 + 14.6, 51.55), V(25.1, D0 + 14.6, 51.55)), lam("clock", () => ({ map: clockTex(), alphaTest: 0.5 })));
  // mill (near bank) + chimneys with smoke handled in the world
  const mill = lam("mill", () => ({ map: facadeHD("mill", 30, 13, { wall: "#b5543c", shutter: "#3b3f52", brick: true }) }));
  const millS = lam("mills", () => ({ map: facadeHD("mills", 12, 13, { wall: "#b5543c", shutter: "#3b3f52", brick: true }) }));
  b.add(quad(V(-58, D0, -70), V(-28, D0, -70), V(-28, D0 + 13, -70), V(-58, D0 + 13, -70)), mill);
  b.add(quad(V(-28, D0, -82), V(-58, D0, -82), V(-58, D0 + 13, -82), V(-28, D0 + 13, -82)), mill);
  b.add(quad(V(-58, D0, -82), V(-58, D0, -70), V(-58, D0 + 13, -70), V(-58, D0 + 13, -82)), millS);
  b.add(quad(V(-28, D0, -70), V(-28, D0, -82), V(-28, D0 + 13, -82), V(-28, D0 + 13, -70)), millS);
  b.add(quad(V(-58.4, D0 + 12.8, -69.6), V(-27.6, D0 + 12.8, -69.6), V(-27.6, D0 + 16.5, -76), V(-58.4, D0 + 16.5, -76), 8, 2), sl);
  b.add(quad(V(-27.6, D0 + 12.8, -82.4), V(-58.4, D0 + 12.8, -82.4), V(-58.4, D0 + 16.5, -76), V(-27.6, D0 + 16.5, -76), 8, 2), sl);
  b.add(tri(V(-58, D0 + 13, -82), V(-58, D0 + 13, -70), V(-58, D0 + 16.5, -76)), millS);
  b.add(tri(V(-28, D0 + 13, -70), V(-28, D0 + 13, -82), V(-28, D0 + 16.5, -76)), millS);
  const chim = lam("chimney", () => ({ map: rep(brick(), 2, 8) })), soot = lam("soot", () => ({ color: "#4a3442" }));
  for (const [x, z, hh] of [[-22, -77, 30], [-80, 93, 24]] as const) {
    b.add(new THREE.CylinderGeometry(0.95, 1.35, hh, 14, 1, true), chim, new THREE.Matrix4().makeTranslation(x, D0 + hh / 2, z));
    b.add(new THREE.CylinderGeometry(1.15, 1.1, 1.3, 14), soot, new THREE.Matrix4().makeTranslation(x, D0 + hh + 0.3, z));
  }
  house(b, -80, 100, Math.PI, 16, 10, 9.8, 7);
  // hills around the valley
  const hill = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const hm = [lam("hillA", () => ({ color: "#78b257" })), lam("hillB", () => ({ color: "#6aa24e" })), lam("hillC", () => ({ color: "#8bbf63" }))];
  ([[-360, 250, 190, 52, 120], [140, 380, 240, 64, 140], [430, 150, 170, 48, 130], [-440, -130, 190, 44, 150], [-90, -390, 250, 58, 140],
    [320, -330, 210, 54, 130], [520, -60, 160, 40, 120], [-560, 60, 200, 46, 140]] as const).forEach(([x, z, sx, sy, sz], i) =>
    b.add(hill, hm[i % 3], new THREE.Matrix4().compose(V(x, D0 - 2, z), new THREE.Quaternion(), V(sx, sy, sz))));
  // trees: quays, gardens, valley, hilltops
  const trees = ["tree_oak", "tree_default", "tree_detailed", "tree_fat", "tree-high-round", "tree"];
  for (const bank of [-1, 1]) for (let x = -130; x <= 130; x += 22) if (Math.abs(x) > 12) prop(b, kit, pick(trees), x + r() * 4, D0, bank * 33.6, 7 + r() * 2.5, r() * 6);
  for (let i = 0; i < 140; i++) {
    const x = (r() - 0.5) * 520, z = (r() < 0.5 ? -1 : 1) * (48 + r() * 220);
    if (inPark(x, z) || inMill(x, z) || inChurch(x, z) || Math.abs(x) < 16) continue;
    prop(b, kit, pick(trees), x, D0, z, 7 + r() * 4, r() * 6);
  }
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, d = 230 + r() * 160;
    prop(b, kit, pick(["tree_cone", "tree_default", "tree_oak"]), Math.cos(a) * d * 1.3, D0, Math.sin(a) * d, 12 + r() * 6, r() * 6);
  }
  // quay furniture
  for (const bank of [-1, 1]) {
    for (let x = -126; x <= 126; x += 12) if (Math.abs(x) > 5) prop(b, kit, "lantern", x, D0, bank * 31.0, 2.8);
    prop(b, kit, "banner-red", 5.4, D0, bank * 31.6, 3.6, bank > 0 ? Math.PI : 0);
  }
  prop(b, kit, "stall-red", -14, D0, -34, 3.2);
  prop(b, kit, "stall-green", -21.5, D0, -34.4, 3.2, 0.1);
  // round 4: this cart sat blurred in shot 11's bottom-left corner (lens at 14, 10.5, -47) as a grey "mushroom"
  // (bed + handle + wheel); moved 3.5 m along the quay, out of that frame, still dressing the market
  prop(b, kit, "cart", 17.0, D0, -34.0, 2.2, 1.2);
  prop(b, kit, "stall-bench", 20, D0, -32.2, 1.0);
  prop(b, kit, "stall-green", 16, D0, 34, 3.2, Math.PI);
  prop(b, kit, "stall-red", 23.5, D0, 34.3, 3.2, Math.PI);
  prop(b, kit, "cart", -15, D0, 33.6, 2.2, 2.4);
  prop(b, kit, "windmill", 98, D0, 72, 16, -0.6);
  prop(b, kit, "canoe", -19, 0.02, 27.6, 0.7, 1.5);
  prop(b, kit, "canoe", 31, 0.02, -28.2, 0.7, -1.4);
  for (let i = 0; i < 14; i++) prop(b, kit, "lily_large", (r() - 0.5) * 120, 0.03, (r() < 0.5 ? -1 : 1) * (27.2 + r() * 2.2), 0.08, r() * 6);
  // park around the swing (near bank, x 50..92, z -96..-56)
  for (const [n, x, z, h] of [["tree_oak", 58, -66, 9.5], ["tree_fat", 84, -64, 8], ["tree_detailed", 54, -84, 9], ["tree_default", 88, -86, 9],
    ["tree_oak", 79, -95, 10], ["tree-high-round", 61, -94, 9], ["tree_default", 92, -73, 8.5]] as const) prop(b, kit, n, x, D0, z, h, x);
  for (let x = 50; x < 92; x += 3.2) prop(b, kit, "hedge", x, D0, -57, 1.5);
  for (const [x, z] of [[62, -76], [77, -71], [66, -82], [75, -80], [57, -73]]) prop(b, kit, pick(["plant_bushLarge", "plant_bushDetailed", "plant_bush"]), x, D0, z, 1.3);
  // flowers only (inked grass tufts read as green boxes), and none inside the swing's 4 m circle
  for (let i = 0; i < 26; i++) {
    const f = pick(["flower_redA", "flower_yellowA", "flower_purpleA"]), x = 56 + r() * 30, z = -60 - r() * 32;
    if (Math.hypot(x - 70, z + 75) > 4) prop(b, kit, f, x, D0, z, 0.5);
  }
  prop(b, kit, "stall-bench", 76.5, D0, -79.5, 1.0, Math.PI);
  prop(b, kit, "lantern", 64.5, D0, -71, 2.8);
  b.build(root);
  sight = [];
};

// ======================================================================================================
// VILLAGE (stage 2): the homestead, pond, kaccha path, fields and trees of "মায়ের অবসর". Everything is built in
// code (no model files). Layout comes from story.ts (HUT, POND, BUS_STOP). Trees go into their own group named
// "trees" so a mask render (world.ts treeMask, inputProps post.treeMask) can measure how much of a wide frame
// they cover (target ~60 %). Paddy tufts and jute stalks are un-inked (NOINK): at field density the ink pass
// would turn them into black noise; the jute canopy and every tree keep their ink.
// ======================================================================================================
const vTAU = Math.PI * 2;
const vU = (r: () => number, a: number, c: number) => a + (c - a) * r();
const sstep = (a: number, c: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
const deg = (d: number) => (d * Math.PI) / 180;
const pick2 = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];
/** draw fn at (x, y) and at its wrapped copies so a tiled canvas has no seams */
const wrapAt = (S: number, T: number, x: number, y: number, pad: number, fn: (x: number, y: number) => void) => {
  for (const ox of [-S, 0, S]) for (const oy of [-T, 0, T])
    if (x + ox > -pad && x + ox < S + pad && y + oy > -pad && y + oy < T + pad) fn(x + ox, y + oy);
};
const ell = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string, rot = 0) => {
  g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, vTAU); g.fill();
};

// ---------------- painted textures ----------------
/** corrugated CI sheet: corrugations run down the slope (along v), sheet overlaps every 1.2 m, rust runs, nail heads */
const tinTex = () => ctex("v_tin", 512, 512, (g, r) => {
  for (let x = 0; x < 512; x += 16) {
    const gr = g.createLinearGradient(x, 0, x + 16, 0);
    gr.addColorStop(0, "#c6ccd0"); gr.addColorStop(0.35, "#adb4b9"); gr.addColorStop(0.7, "#8a9399"); gr.addColorStop(1, "#bcc3c7");
    g.fillStyle = gr; g.fillRect(x, 0, 16, 512);
  }
  g.fillStyle = "rgba(55,58,66,0.4)"; g.fillRect(0, 0, 512, 3); g.fillRect(0, 256, 512, 3);
  g.filter = "blur(9px)"; // soft rust: blurred, low-contrast washes below the sheet overlaps, a few weathered patches
  for (let i = 0; i < 10; i++) {
    const x = r() * 512, y0 = r() < 0.5 ? 4 : 260, len = 60 + r() * 150, w = 22 + r() * 40;
    wrapAt(512, 512, x, y0 + len / 2, len, (cx, cy) => {
      const gr = g.createLinearGradient(0, cy - len / 2, 0, cy + len / 2);
      gr.addColorStop(0, "rgba(140,84,50,0.22)"); gr.addColorStop(1, "rgba(140,84,50,0)");
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, w / 2, len / 2, 0, 0, vTAU); g.fill();
    });
  }
  for (let i = 0; i < 5; i++) wrapAt(512, 512, r() * 512, r() * 512, 80, (x, y) => ell(g, x, y, 30 + r() * 40, 18 + r() * 20, "rgba(130,90,60,0.14)"));
  g.filter = "none";
  g.fillStyle = "rgba(60,60,66,0.7)";
  for (const y of [9, 265]) for (let x = 8; x < 512; x += 64) { g.beginPath(); g.arc(x, y, 2.5, 0, vTAU); g.fill(); }
});
/** mud-plastered wall, 2 m x 2.5 m: smoothed by hand, darker re-plastered band on the bottom 0.5 m, hairline cracks */
const mudWallTex = () => ctex("v_mudwall", 512, 640, (g, r) => {
  const gr = g.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, "#d4a670"); gr.addColorStop(1, "#c6955f");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 640);
  for (let i = 0; i < 70; i++) {
    const x = r() * 512, y = r() * 520, rad = 20 + r() * 50;
    g.strokeStyle = r() < 0.5 ? "rgba(255,236,200,0.08)" : "rgba(110,72,40,0.06)"; g.lineWidth = 3 + r() * 5;
    g.beginPath(); g.arc(x, y, rad, Math.PI * (1.1 + r() * 0.3), Math.PI * (1.6 + r() * 0.3)); g.stroke();
  }
  g.fillStyle = "#9c6e46"; g.beginPath(); g.moveTo(0, 640);
  for (let x = 0; x <= 512; x += 16) g.lineTo(x, 512 + Math.sin((x / 512) * vTAU * 4) * 5 + (x % 512 ? (r() - 0.5) * 6 : 0));
  g.lineTo(512, 640); g.closePath(); g.fill();
  for (let i = 0; i < 9; i++) {
    let x = r() * 512, y = 120 + r() * 360;
    g.strokeStyle = "rgba(80,50,30,0.45)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += 8 + r() * 18; g.lineTo(x, y); }
    g.stroke();
  }
});
const plinthTex = () => ctex("v_plinth", 512, 512, (g, r) => {
  g.fillStyle = "#93633f"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) wrapAt(512, 512, r() * 512, r() * 512, 70, (x, y) => ell(g, x, y, 20 + r() * 50, 6 + r() * 14, r() < 0.5 ? "rgba(175,125,82,0.2)" : "rgba(88,55,30,0.18)"));
  for (let i = 0; i < 40; i++) {
    const x = r() * 512, y = r() * 512;
    g.strokeStyle = "rgba(190,140,95,0.25)"; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 40, y + (r() - 0.5) * 8); g.stroke();
  }
});
/** 2/2 twill bamboo mat (the door) */
const weaveTex = () => ctex("v_weave", 256, 256, (g, r) => {
  g.fillStyle = "#a8854c"; g.fillRect(0, 0, 256, 256);
  const s = 16;
  for (let y = 0; y < 256; y += s) for (let x = 0; x < 256; x += s) {
    const k = ((x / s + y / s) % 4) < 2;
    g.fillStyle = jit(r, k ? "#dcc184" : "#c9a86a", 0.06);
    g.fillRect(x + 1, y + 1, s - 2, s - 2);
    g.fillStyle = "rgba(90,60,30,0.28)";
    if (k) g.fillRect(x + 1, y + s - 4, s - 2, 2); else g.fillRect(x + s - 4, y + 1, 2, s - 2);
  }
});
/** bera: split-bamboo fence panel, 2 m x 1.3 m, gaps cut out (alpha), two tie strips */
const beraTex = () => ctex("v_bera2", 512, 336, (g, r) => {
  for (let x = 2; x < 512; x += 15) {
    const top = r() * 16;
    g.fillStyle = jit(r, "#a68d60", 0.08, 4, 0.08); g.fillRect(x, top, 11, 336 - top);
    g.fillStyle = "rgba(255,240,210,0.18)"; g.fillRect(x + 2, top, 2, 336 - top);
    g.fillStyle = "rgba(70,50,28,0.35)";
    for (let k = 0; k < 3; k++) g.fillRect(x, 40 + r() * 250, 11, 2);
  }
  g.fillStyle = "#94733f"; g.fillRect(0, 80, 512, 12); g.fillRect(0, 250, 512, 12);
});
/** uthan: the swept, packed-earth courtyard (4 m tile): broom arcs, a few fallen leaves */
const uthanTex = () => ctex("v_uthan", 1024, 1024, (g, r) => {
  g.fillStyle = "#d2b283"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 18; i++) wrapAt(1024, 1024, r() * 1024, r() * 1024, 260, (x, y) => ell(g, x, y, 120 + r() * 140, 80 + r() * 100, r() < 0.5 ? "rgba(185,148,102,0.22)" : "rgba(232,208,162,0.22)"));
  for (let i = 0; i < 70; i++) {
    const cx = r() * 1024, cy = r() * 1024, rad = 60 + r() * 90, a0 = r() * vTAU;
    for (let k = 0; k < 6; k++) wrapAt(1024, 1024, cx, cy, rad + 30, (x, y) => {
      g.strokeStyle = "rgba(150,112,72,0.2)"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, rad + k * 4, a0, a0 + 0.6); g.stroke();
    });
  }
  for (let i = 0; i < 26; i++) wrapAt(1024, 1024, r() * 1024, r() * 1024, 20, (x, y) => ell(g, x, y, 9, 4, pick2(r, ["#8a9a3e", "#a8743a", "#c99a48"]), r() * 3));
});
/** kaccha path, 2.2 m across (u) x 4 m along (v): wheel ruts, footprints, grassy verges */
const kacchaTex = () => ctex("v_kaccha", 512, 1024, (g, r) => {
  g.fillStyle = "#b68b5b"; g.fillRect(0, 0, 512, 1024);
  g.fillStyle = "rgba(222,190,140,0.28)"; g.fillRect(150, 0, 212, 1024);
  for (const cx of [150, 362]) {
    g.strokeStyle = "rgba(105,72,44,0.35)"; g.lineWidth = 24; g.beginPath();
    for (let y = 0; y <= 1024; y += 32) { const x = cx + Math.sin((y / 1024) * vTAU * 2) * 8; if (y) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 60; i++) wrapAt(512, 1024, 120 + r() * 270, r() * 1024, 10, (x, y) => ell(g, x, y, 5, 9, "rgba(100,68,40,0.2)"));
  for (const side of [0, 1]) for (let y = 0; y < 1024; y += 8) {
    const w = 18 + Math.sin((y / 1024) * vTAU * 3) * 8 + r() * 10;
    g.fillStyle = "#7da848"; g.fillRect(side ? 512 - w : 0, y, w, 8);
  }
  g.lineWidth = 2;
  for (let i = 0; i < 140; i++) {
    const x = r() < 0.5 ? r() * 40 : 472 + r() * 40, y = r() * 1024;
    g.strokeStyle = r() < 0.5 ? "rgba(150,200,90,0.6)" : "rgba(70,120,40,0.6)";
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 10 - r() * 8); g.stroke();
  }
});
/** pond surface: green-teal water, ripple arcs, lily pads */
const pondTex = () => ctex("v_pond", 512, 512, (g, r) => {
  g.fillStyle = "#3e7a6c"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14; i++) wrapAt(512, 512, r() * 512, r() * 512, 120, (x, y) => ell(g, x, y, 60 + r() * 60, 30 + r() * 40, r() < 0.5 ? "rgba(46,100,90,0.4)" : "rgba(84,140,120,0.35)"));
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) wrapAt(512, 512, r() * 512, r() * 512, 30, (x, y) => {
    g.strokeStyle = "rgba(175,220,205,0.5)"; g.beginPath(); g.arc(x, y, 8 + r() * 18, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  });
  for (let i = 0; i < 9; i++) wrapAt(512, 512, r() * 512, r() * 512, 20, (x, y) => {
    const rad = 9 + r() * 7, a = r() * vTAU;
    g.fillStyle = "#6aa548"; g.beginPath(); g.moveTo(x, y); g.arc(x, y, rad, a + 0.3, a + vTAU - 0.1); g.closePath(); g.fill();
    g.strokeStyle = "rgba(30,62,32,0.6)"; g.lineWidth = 1.5; g.stroke();
  });
});
const bankTex = () => ctex("v_bank", 512, 512, (g, r) => {
  g.fillStyle = "#7f6244"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 50; i++) wrapAt(512, 512, r() * 512, r() * 512, 60, (x, y) => ell(g, x, y, 25 + r() * 35, 5 + r() * 8, r() < 0.5 ? "rgba(60,44,30,0.25)" : "rgba(150,120,85,0.2)"));
});
/** a paddy field seen from above (4 m tile): rows of rice over muddy water */
const paddyFieldTex = (key: string, mud: string, row: string) => ctex("v_paddy_" + key, 512, 512, (g, r) => {
  g.fillStyle = mud; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) {
    g.fillStyle = jit(r, row, 0.06, 3, 0.08); g.fillRect(x + 4, 0, 20, 512);
    for (let y = 0; y < 512; y += 12) { g.fillStyle = "rgba(255,255,200,0.12)"; g.fillRect(x + 6 + r() * 12, y, 4, 6); }
  }
  for (let i = 0; i < 10; i++) wrapAt(512, 512, r() * 512, r() * 512, 120, (x, y) => ell(g, x, y, 60 + r() * 60, 60 + r() * 60, "rgba(40,70,20,0.08)"));
  g.globalAlpha = 0.85; g.fillStyle = row; g.fillRect(0, 0, 512, 512); g.globalAlpha = 1; // soften the row contrast (no stripe aliasing at grazing angles)
});
const juteGroundTex = () => ctex("v_juteground", 512, 512, (g, r) => {
  g.fillStyle = "#6e5a3c"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) wrapAt(512, 512, r() * 512, r() * 512, 10, (x, y) => ell(g, x, y, 6, 2.5, pick2(r, ["#8a9a3e", "#5f7a2e", "#a08040"]), r() * 3));
});
/** one paddy tuft: blades fanning from the bottom centre (cut-out) */
const tuftTex = () => ctex("v_tuft", 256, 256, (g, r) => {
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const bx = 128 + (r() - 0.5) * 36, tx = 128 + (r() - 0.5) * 230, ty = 6 + r() * 70;
    g.strokeStyle = jit(r, i % 3 ? "#7bbb40" : "#5e9e34", 0.08, 4, 0.1); g.lineWidth = 7;
    g.beginPath(); g.moveTo(bx, 256); g.quadraticCurveTo(bx + (tx - bx) * 0.2, 120, tx, ty); g.stroke();
  }
});
/** pinnate palm frond (u along the frond, v across, midrib at v = .5): leaflets lean toward the tip */
const frondTex = (key: string, cols: string[], rib: string, step: number) => ctex("v_frond_" + key, 1024, 256, (g, r) => {
  g.lineCap = "round";
  for (let x = 26; x < 1010; x += step) for (const s of [-1, 1]) {
    g.strokeStyle = cols[Math.floor(r() * cols.length) % cols.length]; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 22, 128 + s * 62, Math.min(1020, x + 64 + r() * 12), 128 + s * 116); g.stroke();
  }
  g.strokeStyle = rib; g.lineWidth = 9; g.beginPath(); g.moveTo(0, 128); g.lineTo(1024, 128); g.stroke();
});
const cocoFrond = () => frondTex("coco", ["#4f9a38", "#5aa83c", "#46902f", "#62ad42"], "#8fa24a", 9);
const betelFrond = () => frondTex("betel", ["#5aa83c", "#6cb547", "#4f9a38"], "#9bb05a", 11);
const dryFrond = () => frondTex("dry", ["#b08a4a", "#9c7a3e", "#c49b58"], "#8a6a3a", 10);
/** banana leaf: broad blade, pale midrib, lateral veins, wind-torn slits cut from the edge */
const bananaTex = () => ctex("v_banana", 1024, 256, (g, r) => {
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#64a83a"); gr.addColorStop(0.5, "#8ccc55"); gr.addColorStop(1, "#64a83a");
  g.fillStyle = gr; g.fillRect(0, 3, 1024, 250);
  g.strokeStyle = "rgba(205,238,150,0.35)"; g.lineWidth = 1.5;
  for (let x = 160; x < 1000; x += 14) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 40, 128 + s * 122); g.stroke(); }
  g.fillStyle = "rgba(150,120,60,0.55)";
  for (let x = 0; x < 1024; x += 30) if (r() < 0.5) { g.fillRect(x, 3, 30, 5); g.fillRect(x, 248, 30, 5); }
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 18; i++) {
    const x = 260 + r() * 720, s = r() < 0.5 ? -1 : 1, d = 40 + r() * 70;
    g.beginPath(); g.moveTo(x, 128 + s * 130); g.lineTo(x + 7, 128 + s * 130); g.lineTo(x + 26, 128 + s * (122 - d)); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "#d6e8a0"; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 128); g.lineTo(1024, 128); g.stroke();
});
/** trunk bark, u along the trunk (2 m per tile), v around: coconut rings, betel rings, banana streaks */
const cocoBarkTex = () => ctex("v_cocobark", 256, 64, (g, r) => {
  g.fillStyle = "#958670"; g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 16) { g.fillStyle = jit(r, "#6e604e", 0.1); g.fillRect(x, 0, 3, 64); g.fillStyle = "rgba(255,240,215,0.15)"; g.fillRect(x + 4, 0, 3, 64); }
});
const betelBarkTex = () => ctex("v_betelbark", 256, 64, (g) => {
  g.fillStyle = "#a3a28a"; g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 22) { g.fillStyle = "#dedbc6"; g.fillRect(x, 0, 4, 64); }
});
const bananaStemTex = () => ctex("v_bstem", 256, 64, (g, r) => {
  g.fillStyle = "#8fae4f"; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 16; i++) { g.fillStyle = r() < 0.5 ? "rgba(110,80,40,0.35)" : "rgba(200,225,140,0.3)"; g.fillRect(0, r() * 64, 256, 1 + r() * 3); }
});

/** village grass (4 m tile): muted olive green (the bridge's grassHD went neon under the Bangladesh day light) */
const vGrassTex = () => ctex("v_grass", 1024, 1024, (g, r) => {
  g.fillStyle = "#6c8d47"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 22; i++) wrapAt(1024, 1024, r() * 1024, r() * 1024, 320, (x, y) => ell(g, x, y, 120 + r() * 180, 90 + r() * 140, r() < 0.5 ? "rgba(126,156,84,0.16)" : "rgba(82,114,52,0.16)"));
  g.lineWidth = 2; g.lineCap = "round";
  for (let i = 0; i < 1600; i++) {
    const x = r() * 1024, y = r() * 1024, h = 7 + r() * 9, lean = (r() - 0.5) * 6, light = r() < 0.4;
    wrapAt(1024, 1024, x, y, 20, (xx, yy) => {
      g.strokeStyle = light ? "rgba(158,186,110,0.18)" : "rgba(64,96,40,0.22)";
      g.beginPath(); g.moveTo(xx - 3 + lean, yy - h); g.lineTo(xx, yy); g.lineTo(xx + 3 + lean, yy - h * 0.8); g.stroke();
    });
  }
  for (let i = 0; i < 40; i++) wrapAt(1024, 1024, r() * 1024, r() * 1024, 12, (x, y) => ell(g, x, y, 8, 4, "rgba(150,120,72,0.15)", r() * 3)); // bare earth
});
/** warm matcap for the bamboo peg (it is lit by the doorway glow, never by the cool night shade) */
const pegMatcap = () => ctex("v_pegcap", 256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "#c39250"); gr.addColorStop(0.6, "#ad7d3c"); gr.addColorStop(0.88, "#8a5e2a"); gr.addColorStop(1, "#5f401b");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const hl = g.createRadialGradient(86, 74, 0, 86, 74, 46); // faint warm highlight, upper left (off the end cap)
  hl.addColorStop(0, "rgba(236,200,140,0.35)"); hl.addColorStop(1, "rgba(236,200,140,0)");
  g.fillStyle = hl; g.fillRect(0, 0, 256, 256);
});
const pegMat = () => {
  let m = mats.get("v_peg");
  if (!m) { m = new THREE.MeshMatcapMaterial({ matcap: pegMatcap() }); mats.set("v_peg", m); }
  return m;
};
/** the lit hut interior seen through the doorway / window: brighter in the middle and toward the floor */
const glowTex = () => ctex("v_glow", 64, 128, (g) => {
  const im = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = (x + 0.5) / 64 - 0.5, v = (y + 0.5) / 128, k = (1 - 0.55 * (2 * u) ** 2) * (0.78 + 0.22 * v), i = (y * 64 + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.round(255 * k); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
});
const GLOW_ON = new THREE.Color(3.0, 2.45, 0.95), GLOW_DUSK = new THREE.Color(1.15, 0.82, 0.42), GLOW_OFF = new THREE.Color(0.035, 0.026, 0.02);
/** additive pool of warm light on a ground patch in front of the door (intensity from world x, z) */
const spillMesh = (x0: number, x1: number, z0: number, z1: number, y: number) => {
  const W = 128, H = 128;
  const tex = ctex(`v_spill_${x0}_${z0}`, W, H, (g) => {
    const im = g.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const v = 1 - (j + 0.5) / H, x = x0 + (x1 - x0) * ((i + 0.5) / W), z = z1 + (z0 - z1) * v, dz = Math.max(0, z - (HUT[2] + HUT_Z));
      const half = 0.5 + 0.42 * dz, I = Math.exp(-1.6 * ((x - HUT[0] + 0.2) / half) ** 2) * Math.exp(-dz / 1.7), k = (j * W + i) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.min(1, I));
    }
    g.putImageData(im, 0, 0);
  });
  const m = new THREE.Mesh(quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0)),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.0, 0.76, 0.32), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.layers.set(NOINK); m.visible = false; m.renderOrder = 2;
  return m;
};

// ---------------- geometry helpers ----------------
/** ground-facing quad (normal +y) from x0..x1, z0..z1 at height y, uv = world / tile (seamless between quads) */
const flatUp = (x0: number, x1: number, z0: number, z1: number, y: number, tile: number) =>
  quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), x1 / tile, z0 / tile, x0 / tile, z1 / tile);
/** straight round rod from a to c (radius r0 at a, r1 at c) */
const rodGeo = (a: THREE.Vector3, c: THREE.Vector3, r0: number, r1 = r0, seg = 7) => {
  const d = c.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, false);
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)));
};
/** tapered tube along a polyline (smooth normals; u = arc length / tile, v around) */
const tubeGeo = (P: THREE.Vector3[], r0: number, r1: number, seg = 8, tile = 2) => {
  const n = P.length, pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const mid = P[n - 1].clone().sub(P[0]).normalize(), ref = Math.abs(mid.y) > 0.7 ? V(1, 0, 0) : V(0, 1, 0);
  const T = V(0, 0, 0), A = V(0, 0, 0), B = V(0, 0, 0);
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += P[i].distanceTo(P[i - 1]);
    T.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    A.crossVectors(T, ref).normalize(); B.crossVectors(A, T).normalize();
    const rr = r0 + (r1 - r0) * (i / (n - 1));
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * vTAU, c = Math.cos(a), sn = Math.sin(a);
      const nx = A.x * c + B.x * sn, ny = A.y * c + B.y * sn, nz = A.z * c + B.z * sn;
      pos.push(P[i].x + nx * rr, P[i].y + ny * rr, P[i].z + nz * rr); nor.push(nx, ny, nz); uv.push(s / tile, j / seg);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, c = a + seg + 1;
    idx.push(a, c, a + 1, c, c + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
};
/** centre line of a frond / leaf: from o toward azimuth az, elevation easing from e0 to e1 (it arches and droops) */
const arcLine = (o: THREE.Vector3, az: number, len: number, e0: number, e1: number, n = 9) => {
  const P: THREE.Vector3[] = [], p = o.clone(), ds = len / (n - 1), S = V(-Math.sin(az), 0, Math.cos(az));
  for (let i = 0; i < n; i++) {
    P.push(p.clone());
    const e = e0 + (e1 - e0) * (i / (n - 1));
    p.add(V(Math.cos(e) * Math.cos(az) * ds, Math.sin(e) * ds, Math.cos(e) * Math.sin(az) * ds));
  }
  return { P, S };
};
/** blade along a centre line: two halves of half-width W[i], folded by `fold` x W (+ = V up, - = drooping roof) */
const bladeGeo = (P: THREE.Vector3[], S: THREE.Vector3, W: number[], fold: number) => {
  const n = P.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const T = V(0, 0, 0), N = V(0, 0, 0);
  for (let i = 0; i < n; i++) {
    T.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    N.crossVectors(S, T).normalize();
    for (const h of [-1, 0, 1]) {
      const k = Math.abs(h) * fold * W[i];
      pos.push(P[i].x + S.x * h * W[i] + N.x * k, P[i].y + S.y * h * W[i] + N.y * k, P[i].z + S.z * h * W[i] + N.z * k);
      uv.push(i / (n - 1), 0.5 + 0.5 * h);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, c = a + 3;
    idx.push(a, a + 1, c + 1, a, c + 1, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};
/** planar polygon (fan) with explicit uvs; vertex order flipped if needed so its normal points along `out` */
const polyGeo = (pts: THREE.Vector3[], uvs: [number, number][], out: THREE.Vector3) => {
  const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
  const order = n.dot(out) < 0 ? pts.map((_, i) => (pts.length - i) % pts.length) : pts.map((_, i) => i);
  const pos: number[] = [], uv: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) { pos.push(pts[k].x, pts[k].y, pts[k].z); uv.push(...uvs[k]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
};

// ---------------- materials ----------------
const aniso = (t: THREE.Texture) => { t.anisotropy = 16; t.needsUpdate = true; return t; };
const VM = {
  tin: () => lam("v_tin", () => ({ map: tinTex(), side: THREE.DoubleSide })),
  mud: () => warmLam("v_mudWarm", { map: mudWallTex(), emissive: "#3a2412" }),
  plinth: () => lam("v_plinth", () => ({ map: plinthTex() })),
  weave: () => lam("v_weave", () => ({ map: weaveTex(), side: THREE.DoubleSide })),
  bamboo: () => lam("v_bamboo2", () => ({ color: "#a48a5c" })),
  dark: () => lam("v_dark", () => ({ color: "#2a1f19" })),
  wood: () => lam("v_wood", () => ({ color: "#7a5636" })),
  bera: () => lam("v_bera", () => ({ map: beraTex(), alphaTest: 0.5, side: THREE.DoubleSide })),
  uthan: () => lam("v_uthan", () => ({ map: uthanTex() })),
  kaccha: () => lam("v_kaccha", () => ({ map: kacchaTex() })),
  grass: () => lam("v_grass", () => { const t = vGrassTex(); t.anisotropy = 16; t.needsUpdate = true; return { map: t }; }),
  bank: () => lam("v_bank", () => ({ map: bankTex() })),
  pond: () => lam("v_pond", () => ({ map: rep(pondTex(), 2, 2) })),
  brick: () => lam("v_brick", () => ({ map: brick() })),
  paddyA: () => lam("v_paddyA", () => ({ map: aniso(paddyFieldTex("a", "#5b7238", "#7fbf45")) })),
  paddyB: () => lam("v_paddyB", () => ({ map: aniso(paddyFieldTex("b", "#55703a", "#6aab3c")) })),
  paddyGold: () => lam("v_paddyGold", () => ({ map: aniso(paddyFieldTex("gold", "#8c7a42", "#c8b45a")) })),
  juteGround: () => lam("v_juteGround", () => ({ map: juteGroundTex() })),
  bund: () => lam("v_bund", () => ({ color: "#93ad57" })),
  tuft: () => lam("v_tuft", () => ({ map: tuftTex(), alphaTest: 0.45, side: THREE.DoubleSide })),
  coco: () => lam("v_coco", () => ({ map: cocoFrond(), alphaTest: 0.42, side: THREE.DoubleSide })),
  betel: () => lam("v_betel", () => ({ map: betelFrond(), alphaTest: 0.42, side: THREE.DoubleSide })),
  dry: () => lam("v_dry", () => ({ map: dryFrond(), alphaTest: 0.42, side: THREE.DoubleSide })),
  banana: () => lam("v_bananaLeaf", () => ({ map: bananaTex(), alphaTest: 0.5, side: THREE.DoubleSide })),
  cocoBark: () => lam("v_cocoBark", () => ({ map: cocoBarkTex() })),
  betelBark: () => lam("v_betelBark", () => ({ map: betelBarkTex() })),
  bStem: () => lam("v_bStem", () => ({ map: bananaStemTex() })),
  shaft: () => lam("v_shaft", () => ({ color: "#7fa84a" })),
  nut: () => lam("v_nut", () => ({ color: "#86803a" })),
  areca: () => lam("v_areca", () => ({ color: "#d98a2e" })),
  banyanBark: () => warmLam("v_banyanBarkWarm", { color: "#956c46", emissive: "#3f2712" }),
  juteStalk: () => lam("v_juteStalk", () => ({ color: "#86a24e" })),
  tulsi: () => lam("v_tulsi", () => ({ color: "#4f7f3a" })),
  mancha: () => lam("v_mancha", () => ({ color: "#c98f5a" })),
  tinCap: () => lam("v_tincap", () => ({ color: "#8f979c" })),
};

// ---------------- plants ----------------
/** palm trunks go here when set (buildVillage: a batch that casts no shadow; their long thin shadows read as artifacts) */
let trunkSink: Batch | null = null;
const trunkB = (b: Batch) => trunkSink ?? b;
/** coconut palm: leaning, curving ringed trunk; crown of ~14 drooping fronds, one dry frond, a nut cluster */
const coconut = (b: Batch, x: number, y: number, z: number, h: number, seed: number, q = 0) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 3), la = r() * vTAU, lean = vU(r, 0.04, 0.09) * h;
  const P: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, k = 2 * t - t * t; P.push(V(x + Math.cos(la) * lean * k, y + h * t, z + Math.sin(la) * lean * k)); }
  trunkB(b).add(tubeGeo(P, 0.255, 0.195, q > 1 ? 6 : 10), VM.cocoBark());
  const top = P[8], n = q > 1 ? 9 : 14, sc = Math.pow(h / 14, 0.4), a0 = r() * vTAU;
  for (let k = 0; k < n; k++) {
    const tier = k / (n - 1), az = a0 + k * 2.4, e0 = deg(62 - 72 * tier), e1 = e0 - deg(vU(r, 70, 100));
    const { P: F, S } = arcLine(top.clone().add(V(Math.cos(az) * 0.12, 0, Math.sin(az) * 0.12)), az, vU(r, 3.9, 4.7) * sc, e0, e1, q > 1 ? 6 : 10);
    const W = F.map((_, i) => 0.52 * sc * Math.pow(Math.sin(Math.min(1, (i / (F.length - 1)) * 1.08) * Math.PI), 0.55));
    b.add(bladeGeo(F, S, W, -0.3), VM.coco());
  }
  if (q < 2) {
    const az = r() * vTAU, { P: F, S } = arcLine(top.clone().add(V(0, -0.3, 0)), az, 3.2 * sc, deg(-58), deg(-84), 7);
    b.add(bladeGeo(F, S, F.map((_, i) => 0.4 * sc * Math.sin(Math.min(1, (i / 6) * 1.1) * Math.PI) ** 0.6), -0.2), VM.dry());
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * vTAU + r();
      b.add(lobeGeo(2), VM.nut(), new THREE.Matrix4().compose(V(top.x + Math.cos(a) * 0.4, top.y - 0.35 - r() * 0.15, top.z + Math.sin(a) * 0.4), new THREE.Quaternion(), V(0.14, 0.15, 0.14)));
    }
  }
};
/** betel nut (areca) palm: slim straight ringed trunk, green crownshaft, small upright crown, orange nut bunch */
const betel = (b: Batch, x: number, y: number, z: number, h: number, seed: number, q = 0) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 5), la = r() * vTAU, lean = vU(r, 0.015, 0.04) * h;
  const top = V(x + Math.cos(la) * lean, y + h, z + Math.sin(la) * lean), shaft = top.clone().add(V(0, -1.3, 0));
  trunkB(b).add(tubeGeo([V(x, y, z), shaft], 0.15, 0.13, q > 1 ? 6 : 8), VM.betelBark());
  trunkB(b).add(tubeGeo([shaft, top], 0.165, 0.135, q > 1 ? 6 : 8), VM.shaft());
  const n = q > 1 ? 6 : 8, sc = Math.pow(h / 12, 0.3), a0 = r() * vTAU;
  for (let k = 0; k < n; k++) {
    const tier = k / (n - 1), az = a0 + k * 2.4, e0 = deg(72 - 42 * tier), e1 = e0 - deg(vU(r, 55, 80));
    const { P: F, S } = arcLine(top, az, vU(r, 2.2, 2.7) * sc, e0, e1, q > 1 ? 5 : 8);
    b.add(bladeGeo(F, S, F.map((_, i) => 0.38 * sc * Math.pow(Math.sin(Math.min(1, (i / (F.length - 1)) * 1.08) * Math.PI), 0.6)), -0.2), VM.betel());
  }
  if (q < 2) for (let i = 0; i < 10; i++) {
    const a = r() * vTAU, d = 0.19 + r() * 0.08;
    b.add(lobeGeo(2), VM.areca(), new THREE.Matrix4().compose(V(shaft.x + Math.cos(a) * d, shaft.y - 0.2 - r() * 0.35, shaft.z + Math.sin(a) * d), new THREE.Quaternion(), V(0.055, 0.06, 0.055)));
  }
};
/** one banana plant: pseudostem, ~7 broad torn leaves arching out and drooping, a rolled young leaf */
const bananaPlant = (b: Batch, x: number, y: number, z: number, h: number, seed: number) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 9), sh = 0.55 * h;
  b.add(tubeGeo([V(x, y - 0.05, z), V(x, y + sh * 0.5, z), V(x, y + sh, z)], 0.15 * (h / 3), 0.1 * (h / 3), 8, 1), VM.bStem());
  const top = V(x, y + sh, z), n = 7, a0 = r() * vTAU;
  for (let k = 0; k < n; k++) {
    const tier = k / (n - 1), az = a0 + k * 2.4, e0 = deg(78 - 26 * tier), e1 = deg(-12 - 40 * tier - r() * 15);
    const { P: F, S } = arcLine(top, az, 0.72 * h * vU(r, 0.85, 1.12), e0, e1, 10);
    const W = F.map((_, i) => { const t = i / (F.length - 1); return t < 0.18 ? 0.035 : 0.3 * (h / 3.2) * Math.sqrt(Math.max(0, Math.min(1, (t - 0.18) / 0.08, (1 - t) / 0.1))); });
    b.add(bladeGeo(F, S, W, 0.18), VM.banana());
  }
  b.add(tubeGeo([top, top.clone().add(V(0.03, 0.55 * (h / 3), 0))], 0.05, 0.02, 6, 1), VM.shaft());
};
const bananaClump = (b: Batch, x: number, y: number, z: number, h: number, seed: number) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 11);
  bananaPlant(b, x, y, z, h, seed);
  for (let i = 0; i < 2; i++) { const a = r() * vTAU, d = vU(r, 0.6, 1.0); bananaPlant(b, x + Math.cos(a) * d, y, z + Math.sin(a) * d, h * vU(r, 0.55, 0.85), seed + 17 * (i + 1)); }
};
/** banyan: fused trunks, spreading limbs, a wide domed canopy, aerial roots hanging to the ground */
const banyan = (b: Batch, x: number, y: number, z: number, h: number, seed: number) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 13), s = h / 15, bark = VM.banyanBark();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * vTAU + r(), d = 0.45 * s;
    b.add(tubeGeo([V(x + Math.cos(a) * d * 1.6, y - 0.2, z + Math.sin(a) * d * 1.6), V(x + Math.cos(a) * d, y + 2.5 * s, z + Math.sin(a) * d), V(x, y + 4.6 * s, z)], vU(r, 0.55, 0.75) * s, 0.45 * s, 10), bark);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * vTAU + r() * 0.5, L = vU(r, 4.5, 6.5) * s;
    b.add(tubeGeo([V(x, y + 4.3 * s, z), V(x + Math.cos(a) * L * 0.5, y + 6.4 * s, z + Math.sin(a) * L * 0.5), V(x + Math.cos(a) * L, y + 7.6 * s, z + Math.sin(a) * L)], 0.32 * s, 0.14 * s, 7), bark);
  }
  const leaf = [leafMat(4), leafMat(1), leafMat(0)], put = (px: number, py: number, pz: number, rad: number, sy: number) =>
    b.add(lobeGeo(1), leaf[Math.floor(r() * 3) % 3], new THREE.Matrix4().compose(V(x + px * s, y + py * s, z + pz * s), yawQ(r() * vTAU), V(rad * s, rad * s * sy, rad * s)));
  put(0, 10.4, 0, 3.6, 0.8);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * vTAU + r(); put(Math.cos(a) * 4, 9.8 + r(), Math.sin(a) * 4, vU(r, 2.6, 3.1), 0.8); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * vTAU + r() * 0.3; put(Math.cos(a) * 7.6, 8.4 + r() * 0.8, Math.sin(a) * 7.6, vU(r, 2.2, 2.7), 0.72); }
  for (let i = 0; i < 5; i++) { const a = r() * vTAU, d = r() * 3; put(Math.cos(a) * d, 12 + r(), Math.sin(a) * d, vU(r, 2.0, 2.5), 0.85); }
  for (let i = 0; i < 14; i++) { const a = (i / 14) * vTAU + r() * 0.3; put(Math.cos(a) * vU(r, 8.2, 9.4), vU(r, 6.2, 7.0), Math.sin(a) * vU(r, 8.2, 9.4), vU(r, 1.7, 2.2), 0.62); } // low skirt
  for (let i = 0; i < 6; i++) { // prop roots: aerial roots that reached the ground and thickened into trunks
    const a = r() * vTAU, d = vU(r, 3, 7);
    b.add(rodGeo(V(x + Math.cos(a) * d * s, y - 0.1, z + Math.sin(a) * d * s), V(x + Math.cos(a) * d * s, y + (7.1 - d * 0.1) * s, z + Math.sin(a) * d * s), 0.14 * s, 0.09 * s, 7), bark);
  }
  for (let k = 0; k < 9; k++) { // hanging bunches of thin aerial roots under the limbs
    const a = r() * vTAU, d = vU(r, 2.5, 8);
    for (let i = 0; i < 3; i++) {
      const px = x + (Math.cos(a) * d + (r() - 0.5) * 0.5) * s, pz = z + (Math.sin(a) * d + (r() - 0.5) * 0.5) * s, top = (7.1 - d * 0.1) * s;
      b.add(rodGeo(V(px, y + vU(r, 1.2, 2.6) * s, pz), V(px, top, pz), 0.035 * s, 0.05 * s, 6), bark);
    }
  }
};
/** jute bunch for a near framing shot: thin stalks, leaves bunched at the top */
const juteBunch = (b: Batch, x: number, y: number, z: number, h: number, seed: number) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 19);
  for (let i = 0; i < 14; i++) {
    const px = x + (r() - 0.5) * 0.7, pz = z + (r() - 0.5) * 0.5, th = h * vU(r, 0.8, 1.05);
    b.add(rodGeo(V(px, y, pz), V(px + (r() - 0.5) * 0.08, y + th, pz), 0.013, 0.009, 5), VM.juteStalk());
    for (let k = 0; k < 3; k++) b.add(lobeGeo(1), leafMat(2), new THREE.Matrix4().compose(V(px + (r() - 0.5) * 0.1, y + th * (0.78 + k * 0.08), pz + (r() - 0.5) * 0.1), yawQ(r() * vTAU), V(0.09, 0.16, 0.09)));
  }
};
/** tulsi on its clay mancha (pedestal) */
const tulsiMancha = (b: Batch, x: number, y: number, z: number, h: number, seed: number) => {
  const r = rng(Math.abs(Math.floor(seed)) % 200000 + 23), ph = 0.5 * h;
  b.add(boxGeo(V(x - 0.24, y, z - 0.24), V(x + 0.24, y + ph, z + 0.24), 0, false), VM.mancha());
  b.add(boxGeo(V(x - 0.29, y + ph, z - 0.29), V(x + 0.29, y + ph + 0.05, z + 0.29), 0, false), VM.mancha());
  for (let i = 0; i < 7; i++) {
    const a = r() * vTAU, d = r() * 0.12;
    b.add(lobeGeo(1), VM.tulsi(), new THREE.Matrix4().compose(V(x + Math.cos(a) * d, y + ph + 0.12 + r() * 0.3 * h, z + Math.sin(a) * d), yawQ(r() * vTAU), V(0.13, 0.11, 0.13)));
  }
};
/** paddy tufts: crossed cut-out quads, normals up (lit like the field), un-inked; spots = [x, z, h, yaw] */
type Tuft = [number, number, number, number];
const tuftMesh = (spots: Tuft[]) => {
  const n = spots.length, pos = new Float32Array(n * 24), nor = new Float32Array(n * 24), uv = new Float32Array(n * 16), idx = new Uint32Array(n * 12);
  spots.forEach(([x, z, h, yaw], i) => {
    for (let q = 0; q < 2; q++) {
      const a = yaw + (q * Math.PI) / 2, w = h * 0.62, dx = (Math.cos(a) * w) / 2, dz = (Math.sin(a) * w) / 2, v0 = i * 8 + q * 4;
      const P = [[x - dx, 0, z - dz], [x + dx, 0, z + dz], [x + dx, h, z + dz], [x - dx, h, z - dz]], T = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let k = 0; k < 4; k++) { pos.set(P[k], (v0 + k) * 3); nor.set([0, 1, 0], (v0 + k) * 3); uv.set(T[k], (v0 + k) * 2); }
      idx.set([v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3], i * 12 + q * 6);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, VM.tuft());
  m.layers.set(NOINK); m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false;
  return m;
};
const paddySpots = (x0: number, x1: number, z0: number, z1: number, seed: number, keep: (x: number, z: number) => boolean = () => true) => {
  const r = rng(seed), out: Tuft[] = [];
  for (let z = z0 + 0.15; z < z1; z += 0.36) for (let x = x0 + 0.2; x < x1; x += 0.42) {
    const px = x + (r() - 0.5) * 0.12, pz = z + (r() - 0.5) * 0.1;
    if (keep(px, pz)) out.push([px, pz, vU(r, 0.5, 0.72), r() * Math.PI]);
  }
  return out;
};

/** procedural stand-ins for kit names (FOREGROUND framing props + village plants); h = height in metres */
type ProcFn = (b: Batch, x: number, y: number, z: number, h: number, seed: number) => void;
const PROC: Record<string, ProcFn> = {
  banana: bananaPlant, banana_clump: bananaClump, coconut, betel, banyan, jute_stalks: juteBunch, tulsi: tulsiMancha,
  mango: (b, x, y, z, h, s) => addVeg(b, "fat", x, y, z, h, s, 0),
};
/** a procedural plant as its own object at the origin (for FOREGROUND); null if the name is unknown */
export const procClone = (name: string, h: number): THREE.Object3D | null => {
  const grp = new THREE.Group();
  if (name === "paddy") { grp.add(tuftMesh(paddySpots(-0.9, 0.9, -0.6, 0.6, 77).map(([x, z, hh, a]) => [x, z, hh * (h / 0.62), a] as Tuft))); return grp; }
  const f = PROC[name];
  if (!f) return null;
  const vb = new Batch();
  f(vb, 0, 0, 0, h, name.length * 977 + h * 131);
  vb.build(grp, false);
  grp.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = true; } });
  return grp;
};

// ---------------- the hut ----------------
// 6 m x 4.6 m mud-walled hut on a 0.45 m mud plinth, door facing +z, hip (char-chala) roof of corrugated tin over a
// front veranda. The bamboo peg of the hook shot sits right of the door at (1.1, 1.25, 2.3 -> 2.57).
const HUT_X = 3.0, HUT_Z = 2.3, PLY = 0.45, WALL_TOP = 2.95;
const buildHut = (b: Batch, glow: THREE.Material) => {
  const m = new THREE.Matrix4().makeTranslation(HUT[0], HUT[1], HUT[2]), mud = VM.mud(), bam = VM.bamboo();
  const add = (g: THREE.BufferGeometry, mat: THREE.Material) => b.add(g, mat, m);
  add(boxGeo(V(-3.6, -0.05, -2.9), V(3.6, PLY, 3.4), 2), VM.plinth());
  const wall = (ax: number, az: number, bx: number, bz: number, len: number) =>
    add(quad(V(ax, PLY, az), V(bx, PLY, bz), V(bx, WALL_TOP, bz), V(ax, WALL_TOP, az), len / 2, 1), mud);
  wall(-HUT_X, HUT_Z, HUT_X, HUT_Z, 6); wall(HUT_X, -HUT_Z, -HUT_X, -HUT_Z, 6);
  wall(-HUT_X, -HUT_Z, -HUT_X, HUT_Z, 4.6); wall(HUT_X, HUT_Z, HUT_X, -HUT_Z, 4.6);
  // doorway: dark opening, bamboo frame, the woven door swung open against the wall
  const fz = HUT_Z + 0.012, dx0 = -0.65, dx1 = 0.25, dTop = 2.25;
  add(quad(V(dx0, PLY, fz), V(dx1, PLY, fz), V(dx1, dTop, fz), V(dx0, dTop, fz)), glow);
  for (const xx of [dx0 - 0.03, dx1 + 0.03]) add(rodGeo(V(xx, PLY, HUT_Z + 0.05), V(xx, dTop + 0.08, HUT_Z + 0.05), 0.045), bam);
  add(rodGeo(V(dx0 - 0.12, dTop + 0.05, HUT_Z + 0.06), V(dx1 + 0.12, dTop + 0.05, HUT_Z + 0.06), 0.04), bam);
  const hinge = V(dx0 - 0.05, 0, HUT_Z + 0.06), open = deg(20), tip = V(hinge.x - 0.9 * Math.cos(open), 0, hinge.z + 0.9 * Math.sin(open));
  add(quad(V(tip.x, PLY + 0.04, tip.z), V(hinge.x, PLY + 0.04, hinge.z), V(hinge.x, dTop - 0.04, hinge.z), V(tip.x, dTop - 0.04, tip.z), 2.5, 5), VM.weave());
  for (const p of [hinge, tip]) add(rodGeo(V(p.x, PLY + 0.04, p.z), V(p.x, dTop - 0.02, p.z), 0.025), bam);
  for (const yy of [PLY + 0.06, (PLY + dTop) / 2, dTop - 0.06]) add(rodGeo(V(tip.x, yy, tip.z), V(hinge.x, yy, hinge.z), 0.02), bam);
  // small barred window right of the peg, wooden shutter open
  const wx0 = 1.85, wx1 = 2.55, wy0 = 1.3, wy1 = 1.95;
  add(quad(V(wx0, wy0, fz), V(wx1, wy0, fz), V(wx1, wy1, fz), V(wx0, wy1, fz)), glow);
  for (let i = 0; i <= 4; i++) { const xx = wx0 + ((wx1 - wx0) * i) / 4; add(rodGeo(V(xx, wy0 - 0.05, HUT_Z + 0.04), V(xx, wy1 + 0.05, HUT_Z + 0.04), i % 4 ? 0.016 : 0.035), bam); }
  for (const yy of [wy0 - 0.04, wy1 + 0.04]) add(rodGeo(V(wx0 - 0.08, yy, HUT_Z + 0.05), V(wx1 + 0.08, yy, HUT_Z + 0.05), 0.03), bam);
  add(boxGeo(V(wx1 + 0.05, wy0, HUT_Z + 0.03), V(wx1 + 0.08, wy1, HUT_Z + 0.68)), VM.wood());
  // the empty bamboo peg (hook shot)
  // (the peg is built by buildPeg: both houses have it)
  // hip roof: eaves x +-3.5, z -2.8 .. 3.3 at y 2.55, ridge x +-0.45 at z .25, y 3.98; sheets run down the slope
  const EY = 2.55, RY = 3.98, RZ = 0.25, TT = 2.43, run = Math.hypot(3.05, RY - EY) / TT;
  const e = [V(-3.5, EY, 3.3), V(3.5, EY, 3.3), V(3.5, EY, -2.8), V(-3.5, EY, -2.8)], rl = V(-0.45, RY, RZ), rr = V(0.45, RY, RZ);
  add(polyGeo([e[0], e[1], rr, rl], [[-3.5 / TT, 0], [3.5 / TT, 0], [0.45 / TT, run], [-0.45 / TT, run]], V(0, 1, 1)), VM.tin());
  add(polyGeo([e[2], e[3], rl, rr], [[3.5 / TT, 0], [-3.5 / TT, 0], [-0.45 / TT, run], [0.45 / TT, run]], V(0, 1, -1)), VM.tin());
  add(polyGeo([e[3], e[0], rl], [[-2.8 / TT, 0], [3.3 / TT, 0], [RZ / TT, run]], V(-1, 1, 0)), VM.tin());
  add(polyGeo([e[1], e[2], rr], [[3.3 / TT, 0], [-2.8 / TT, 0], [RZ / TT, run]], V(1, 1, 0)), VM.tin());
  add(rodGeo(rl.clone().add(V(-0.05, 0.03, 0)), rr.clone().add(V(0.05, 0.03, 0)), 0.06, 0.06, 8), VM.tinCap());
  for (const [c, rp] of [[e[0], rl], [e[3], rl], [e[1], rr], [e[2], rr]] as const) add(rodGeo(c, rp.clone().add(V(0, 0.03, 0)), 0.045, 0.045, 6), VM.tinCap());
  for (const [a, c] of [[e[0], e[1]], [e[1], e[2]], [e[2], e[3]], [e[3], e[0]]] as const) add(rodGeo(a.clone().add(V(0, -0.04, 0)), c.clone().add(V(0, -0.04, 0)), 0.035, 0.035, 6), VM.wood());
  // veranda: bamboo posts at the front corners, rafters under the overhang
  for (const sx of [-1, 1]) add(rodGeo(V(sx * 3.3, PLY, 3.12), V(sx * 3.3, 2.62, 3.12), 0.055, 0.05), bam);
  for (let i = 0; i < 7; i++) { const xx = -3.0 + i; add(rodGeo(V(xx, WALL_TOP + 0.03, HUT_Z), V(xx, EY - 0.03, 3.28), 0.03), bam); }
};

// ---------------- fence, pond, fields ----------------
const PRX = 4.5, PRZ = 4.0; // pond semi-axes (POND is the centre)
const pondE = (x: number, z: number) => Math.hypot((x - POND[0]) / PRX, (z - POND[2]) / PRZ);
const pondH = (x: number, z: number) => -0.6 * sstep(1.2, 0.72, pondE(x, z));
const FENCE = { x0: -6.4, x1: 7.0, z0: -4.5, z1: 12.5, gate: [1.7, 4.3] as const, ghat: [9.0, 11.0] as const };
/** one 2 m bera panel from (ax, az) to (bx, bz) with posts and rails (left out if it blocks a lens) */
const fencePanel = (b: Batch, ax: number, az: number, bx: number, bz: number) => {
  if (inTheWay(Math.min(ax, bx) - 0.05, Math.max(ax, bx) + 0.05, 0, 1.4, Math.min(az, bz) - 0.05, Math.max(az, bz) + 0.05, true)) return;
  const L = Math.hypot(bx - ax, bz - az);
  b.add(quad(V(ax, 0.02, az), V(bx, 0.02, bz), V(bx, 1.32, bz), V(ax, 1.32, az), L / 2, 1), VM.bera());
  for (const [x, z] of [[ax, az], [bx, bz]]) b.add(rodGeo(V(x, -0.05, z), V(x, 1.45, z), 0.032, 0.028), VM.bamboo());
  for (const y of [0.42, 1.02]) b.add(rodGeo(V(ax, y, az), V(bx, y, bz), 0.025), VM.bamboo());
};
const fenceRun = (b: Batch, ax: number, az: number, bx: number, bz: number) => {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2));
  for (let i = 0; i < n; i++) fencePanel(b, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, ax + ((bx - ax) * (i + 1)) / n, az + ((bz - az) * (i + 1)) / n);
};
/** ground around the pond: a 0.4 m height grid with the basin dug in; wet mud where it dips below 7 cm */
const pondGround = (b: Batch, x0: number, x1: number, z0: number, z1: number) => {
  const st = 0.4, nx = Math.round((x1 - x0) / st), nz = Math.round((z1 - z0) / st), pos: number[] = [], uv: number[] = [], hs: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * st, z = z0 + j * st, y = pondH(x, z);
    pos.push(x, y, z); uv.push(x / 4, z / 4); hs.push(y);
  }
  const dry: number[] = [], wet: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, c = a + nx + 1;
    ((hs[a] + hs[a + 1] + hs[c] + hs[c + 1]) / 4 < -0.07 ? wet : dry).push(a, c, a + 1, a + 1, c, c + 1);
  }
  for (const [list, mat] of [[dry, VM.grass()], [wet, VM.bank()]] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(list); g.computeVertexNormals();
    b.add(g, mat);
  }
};
/** a jute plot: dense stalks (un-inked) under a lumpy leaf canopy at 2.2-2.9 m (inked) */
const jutePlot = (b: Batch, nb: Batch, x0: number, x1: number, z0: number, z1: number, seed: number, keep: (x: number) => boolean) => {
  const r = rng(seed);
  for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.6) for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.6) {
    const px = x + (r() - 0.5) * 0.3, pz = z + (r() - 0.5) * 0.3, th = vU(r, 2.3, 2.8);
    if (!keep(px)) continue;
    b.add(lobeGeo(2), leafMat(2), new THREE.Matrix4().compose(V(px, th, pz), yawQ(r() * vTAU), V(vU(r, 0.34, 0.42), vU(r, 0.45, 0.6), vU(r, 0.34, 0.42))));
    for (let k = 0; k < 2; k++) { const sx = px + (r() - 0.5) * 0.4, sz = pz + (r() - 0.5) * 0.4; nb.add(rodGeo(V(sx, 0, sz), V(sx, th - 0.1, sz), 0.014, 0.01, 5), VM.juteStalk()); }
  }
};

// ---------------- the village ----------------
/** tuning knobs for tree cover (wide frames target ~60 % trees; measured with the tree-mask render) */
export const VILLAGE_TUNE = { groveTarget: 263, // 229 homestead trees before the review, +15 %
  groveMax: 230, groveTries: 2600, pathStep: [7, 12] as [number, number], pathMango: 0.5, islands: 30, islandDensity: 0.7 };
export const buildVillage = (root: THREE.Object3D, rays: Ray[] = []) => {
  sight = rays;
  const r = rng(29), b = new Batch(), tb = new Batch(), nb = new Batch(), ib = new Batch(), tkb = new Batch(), ncb = new Batch(), spots: Tuft[] = [], TN = VILLAGE_TUNE;
  trunkSink = tkb;
  // ib: flat ground decals and low ridges (no ink: their outlines read as black boxes); tkb: palm trunks (no shadows)
  const glow = new THREE.MeshBasicMaterial({ map: glowTex(), color: GLOW_OFF.clone() }), spill: THREE.Mesh[] = [];
  // ---- ground: grass around the homestead, the dug pond grid, fields from z = 16 northward ----
  const PG = [-22, -2, 1, 16] as const, FZ = 16;
  b.add(flatUp(-600, 600, -600, PG[2], 0, 4), VM.grass());
  b.add(flatUp(-600, PG[0], PG[2], FZ, 0, 4), VM.grass());
  b.add(flatUp(PG[1], 600, PG[2], FZ, 0, 4), VM.grass());
  pondGround(b, PG[0], PG[1], PG[2], PG[3]);
  const water = new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2).scale(PRX * 1.16, 1, PRZ * 1.16);
  b.add(water, VM.pond(), new THREE.Matrix4().makeTranslation(POND[0], -0.22, POND[2]));
  // ghat: brick steps from the courtyard side down into the water, low side walls
  for (let i = 0; i < 6; i++) b.add(boxGeo(V(-6.75 - 0.4 * (i + 1), -0.8, FENCE.ghat[0] + 0.2), V(-6.75 - 0.4 * i, 0.03 - 0.12 * i, FENCE.ghat[1] - 0.2), 1), VM.brick());
  for (const zz of [FENCE.ghat[0] + 0.05, FENCE.ghat[1] - 0.2]) b.add(boxGeo(V(-9.2, -0.8, zz), V(-6.6, 0.18, zz + 0.15), 1), VM.brick());
  // fields: near plots (with ridges) either side of the path, then far patches to the horizon
  const PX = [-40, -20, 3, 22, 40], PZ = [FZ, 38, 60, 84, 106, 140];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) {
    const xa = PX[i], xb = PX[i + 1], za = PZ[k], zb = PZ[k + 1];
    const jute = (i === 1 && k === 0) || (i === 3 && k === 3), green = i === 2 && k === 2; // green = the bus-stop ground under the banyan
    b.add(flatUp(xa, xb, za, zb, 0, 4), jute ? VM.juteGround() : green ? VM.grass() : (i + k) % 2 ? VM.paddyA() : VM.paddyB());
    if (jute) jutePlot(b, nb, xa, xb, za, zb, 100 + i * 7 + k, (x) => Math.abs(x - 3) > 2.2);
    else if (!green) spots.push(...paddySpots(Math.max(xa, -14), Math.min(xb, 20), za + 0.3, zb - 0.3, 200 + i * 7 + k, (x) => Math.abs(x - 3) > 2.2 && Math.abs(x - 3) < 17));
  }
  const farMat = [VM.paddyA(), VM.paddyB(), VM.paddyA(), VM.paddyGold()];
  for (let z = 140; z < 700; z += 30) for (let x = -600; x < 600; x += 30) b.add(flatUp(x, x + 30, z, z + 30, 0, 4), farMat[Math.floor(r() * 4) % 4]);
  for (const [xa, xb] of [[-600, -40], [40, 600]]) for (let z = FZ; z < 140; z += 31) for (let x = xa; x < xb; x += 28)
    b.add(flatUp(x, Math.min(xb, x + 28), z, Math.min(140, z + 31), 0, 4), farMat[Math.floor(r() * 4) % 4]);
  // ---- homestead: courtyard, hut, fence, kaccha path ----
  b.add(flatUp(FENCE.x0, FENCE.x1, FENCE.z0, FENCE.z1, 0.012, 4), VM.uthan());
  const tinB = new Batch(), pucB = new Batch(), umB = new Batch();
  const pegB = new Batch();
  buildHut(tinB, glow); buildPucca(pucB, glow); buildPeg(pegB); buildUmbrella(umB);
  // dheki (rice-husking lever) in the courtyard: beam on a pivot, pestle over a clay mortar, bamboo frame + rope to hold
  {
    const [dx, , dz] = DHEKI, wood = lam("v_dhekiWood", () => ({ color: "#7d5532" })), bam = VM.bamboo();
    b.add(new THREE.BoxGeometry(2.7, 0.16, 0.18).applyMatrix4(new THREE.Matrix4().compose(V(dx + 1.2, 0.34, dz - 0.25), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.06), V(1, 1, 1))), wood);
    for (const s of [-1, 1]) b.add(boxGeo(V(dx + 0.85, 0, dz - 0.25 + s * 0.16 - 0.05), V(dx + 0.95, 0.42, dz - 0.25 + s * 0.16 + 0.05)), wood);
    b.add(boxGeo(V(dx + 2.25, 0.04, dz - 0.32), V(dx + 2.39, 0.42, dz - 0.18)), wood);
    b.add(new THREE.CylinderGeometry(0.2, 0.17, 0.08, 20).translate(dx + 2.32, 0.04, dz - 0.25), lam("v_mortar", () => ({ color: "#9a6a44" })));
    b.add(new THREE.CircleGeometry(0.13, 20).rotateX(-Math.PI / 2).translate(dx + 2.32, 0.082, dz - 0.25), VM.dark());
    for (const px of [dx - 0.6, dx + 0.7]) b.add(rodGeo(V(px, 0, dz - 0.5), V(px, 2.3, dz - 0.5), 0.04), bam); // posts behind her
    b.add(rodGeo(V(dx - 0.7, 2.25, dz - 0.5), V(dx + 0.8, 2.25, dz - 0.5), 0.035), bam);
    // hurricane lantern hanging from the crossbar (its flame is an effect in shot 3 only)
    const lx = dx + 0.45, lz = dz - 0.5, tin = lam("v_lanternTin", () => ({ color: "#4a4a44" }));
    b.add(rodGeo(V(lx, 2.24, lz), V(lx, 1.82, lz), 0.004, 0.004, 4), tin);
    b.add(new THREE.CylinderGeometry(0.05, 0.075, 0.06, 14).translate(lx, 1.79, lz), tin);
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 14, 1, true).translate(lx, 1.68, lz), lam("v_lanternGlass", () => ({ color: "#e9d39a", side: THREE.DoubleSide })));
    b.add(new THREE.CylinderGeometry(0.075, 0.08, 0.07, 14).translate(lx, 1.565, lz), tin);
  }
  // the neighbour's well: brick ring, dark water, a bucket on the rim
  {
    const [wx, , wz] = WELL;
    b.add(new THREE.CylinderGeometry(0.72, 0.75, 0.78, 40, 1, true).translate(wx, 0.39, wz), warmLam("v_wellBrick", { map: rep(wellBrickTex(), 6, 1), emissive: "#341810" }));
    b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.78, 32, 1, true).translate(wx, 0.39, wz), lam("v_wellIn", () => ({ color: "#5a4636", side: THREE.BackSide })));
    b.add(new THREE.RingGeometry(0.6, 0.75, 32).rotateX(-Math.PI / 2).translate(wx, 0.781, wz), lam("v_wellRim", () => ({ color: "#b8a68c" })));
    b.add(new THREE.CircleGeometry(0.6, 32).rotateX(-Math.PI / 2).translate(wx, 0.25, wz), lam("v_wellWater", () => ({ color: "#2d4a4a" })));
    const bam = VM.bamboo(), steel = lam("v_bucket", () => ({ color: "#8f969d" }));
    for (const s of [-1, 1]) b.add(rodGeo(V(wx, 0, wz + s * 0.95), V(wx, 2.0, wz + s * 0.95), 0.045), bam);
    b.add(rodGeo(V(wx, 1.95, wz - 1.0), V(wx, 1.95, wz + 1.0), 0.04), bam);
    b.add(new THREE.TorusGeometry(0.07, 0.015, 6, 16).translate(wx, 1.87, wz), lam("v_pulley", () => ({ color: "#6b4a2e" })));
    b.add(rodGeo(V(wx, 1.82, wz), V(wx, 1.2, wz), 0.006, 0.006, 4), lam("v_rope", () => ({ color: "#b8a27a" })));
    b.add(new THREE.TorusGeometry(0.12, 0.006, 4, 16, Math.PI).translate(wx, 1.13, wz), steel); // bucket handle
    b.add(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 16).translate(wx, 1.02, wz), steel);
    b.add(flatUp(wx - 1.6, wx + 1.6, wz - 1.6, wz + 1.6, 0.01, 2), VM.uthan());
  }
  spill.push(spillMesh(HUT[0] - 1.7, HUT[0] + 1.3, HUT[2] + HUT_Z + 0.01, HUT[2] + 3.4, PLY + 0.004), spillMesh(HUT[0] - 2.8, HUT[0] + 2.4, HUT[2] + 3.4, HUT[2] + 7.8, 0.018));
  fenceRun(b, FENCE.x0, FENCE.z0, FENCE.x1, FENCE.z0);
  fenceRun(b, FENCE.x1, FENCE.z0, FENCE.x1, FENCE.z1);
  fenceRun(b, FENCE.x0, FENCE.z0, FENCE.x0, FENCE.ghat[0]);
  fenceRun(b, FENCE.x0, FENCE.ghat[1], FENCE.x0, FENCE.z1);
  fenceRun(b, FENCE.x0, FENCE.z1, FENCE.gate[0], FENCE.z1);
  fenceRun(b, FENCE.gate[1], FENCE.z1, FENCE.x1, FENCE.z1);
  for (const gx of FENCE.gate) b.add(rodGeo(V(gx, -0.05, FENCE.z1), V(gx, 1.75, FENCE.z1), 0.04, 0.036), VM.bamboo());
  for (const [xa, xb] of [[0.8, 1.9], [4.1, 5.2]]) ib.add(flatUp(xa, xb, FZ, 420, 0.03, 4), VM.grass()); // grass verges
  ib.add(quad(V(1.9, 0.04, 420), V(4.1, 0.04, 420), V(4.1, 0.04, FENCE.z1), V(1.9, 0.04, FENCE.z1), 1, FENCE.z1 / 4, 0, 420 / 4), VM.kaccha());
  // ---- trees ----
  const placed: [number, number, number][] = [];
  const radOf = (kind: string, h: number) => (kind === "mango" ? 0.44 * h : kind === "banyan" ? 9 : kind === "coconut" ? 1.6 : kind === "betel" ? 1.0 : 1.3);
  const free = (x: number, z: number, rad: number) => placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) > (pr + rad) * 0.7);
  const plant = (kind: string, x: number, z: number, h: number, q = 0, sink: Batch = tb) => {
    const rad = radOf(kind, h), trunkOnly = kind === "coconut" || kind === "betel" || kind === "banyan";
    if (trunkOnly ? inTheWay(x - 0.5, x + 0.5, 0, h * 0.8, z - 0.5, z + 0.5, true) : inTheWay(x - rad, x + rad, 0, h, z - rad, z + rad, true)) return false;
    const seed = x * 92.7 + z * 31.3;
    if (kind === "mango") addVeg(sink, r() < 0.6 ? "fat" : "round", x, 0, z, h, seed, q);
    else if (kind === "coconut") coconut(sink, x, 0, z, h, seed, q);
    else if (kind === "betel") betel(sink, x, 0, z, h, seed, q);
    else if (kind === "banana") bananaClump(sink, x, 0, z, h, seed);
    else if (kind === "banyan") banyan(sink, x, 0, z, h, seed);
    else addVeg(sink, "bush", x, 0, z, h, seed, q);
    placed.push([x, z, rad]);
    return true;
  };
  const inYard = (x: number, z: number, m: number) => x > FENCE.x0 - m && x < FENCE.x1 + m && z > FENCE.z0 - m && z < FENCE.z1 + m;
  const nearPond = (x: number, z: number, m: number) => Math.hypot((x - POND[0]) / (PRX * 1.25 + m), (z - POND[2]) / (PRZ * 1.25 + m)) < 1;
  // bus stop: the banyan beside the path
  plant("banyan", BUS_STOP[0] + 7, BUS_STOP[2] + 3, 15, 0, ncb); // no cast: its low skirt threw a dark blob across the path in the return walk (f3500)
  // homestead grove (x -45..45, z -50..16): mango and palms behind and beside the hut, bananas and betel near the fence
  const KINDS: [string, number, number, number][] = [["mango", 0.38, 8, 12], ["coconut", 0.2, 11, 16], ["betel", 0.12, 9, 13], ["banana", 0.2, 2.6, 3.6], ["bush", 0.1, 1.4, 2.2]];
  let grove = 0;
  for (let t = 0; t < (TN.groveTarget ? 9000 : TN.groveTries) && (TN.groveTarget ? grove < TN.groveTarget : placed.length < TN.groveMax); t++) {
    const x = vU(r, -45, 45), z = vU(r, -50, FZ - 1.5);
    let u = r(), k = 0;
    while (k < KINDS.length - 1 && u > KINDS[k][1]) { u -= KINDS[k][1]; k++; }
    const [kind, , h0, h1] = KINDS[k], h = vU(r, h0, h1), rad = radOf(kind, h);
    const edge = kind === "banana" || kind === "betel" || kind === "bush" ? 0.6 : rad + 0.8;
    if (Math.hypot(x - WELL[0], z - WELL[2]) < rad + 2.2 || inYard(x, z, edge) || nearPond(x, z, kind === "mango" ? rad * 0.6 : 0.3) || (x > -rad && x < 6 + rad && z > FENCE.z1 - 1) || !free(x, z, rad)) continue;
    if (plant(kind, x, z, h)) grove++;
  }
  console.log("village: grove trees", grove);
  // palms and the odd banana clump lining the path through the fields
  for (let z = FZ + 3, side = 1; z < 160; z += vU(r, TN.pathStep[0], TN.pathStep[1]), side = -side) {
    if (z > 62 && z < 84 && side > 0) continue;
    const x = 3 + side * vU(r, 2.1, 3.2), u = r(), kind = u < 0.15 ? "banana" : u < 0.55 ? "coconut" : "betel";
    plant(kind, x, z, kind === "banana" ? vU(r, 2.6, 3.4) : kind === "coconut" ? vU(r, 11, 15) : vU(r, 9, 12), 0, ncb);
    if (r() < TN.pathMango) plant("mango", 3 - side * vU(r, 5, 8), z + vU(r, -3, 3), vU(r, 8, 11), 0, ncb);
  }
  for (const [x, z, k, h] of [[14, 64, "betel", 11], [15.5, 81, "betel", 12], [-5, 77, "mango", 9], [-6.5, 68, "coconut", 13]] as const) plant(k, x, z, h, 0, ncb);
  // tree islands (other villages) across the fields and around: dense round crowns with palms rising above
  const clusters: [number, number, number][] = [];
  for (let i = 0; i < TN.islands; i++) clusters.push([vU(r, -220, 220), vU(r, 150, 250), vU(r, 16, 32)]);
  for (const sx of [-1, 1]) for (let z = FZ + 4; z < 140; z += vU(r, 6, 10)) plant(r() < 0.7 ? "mango" : "coconut", sx * vU(r, 42, 46), z, vU(r, 8, 13), 1);
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) clusters.push([s * vU(r, 70, 150), vU(r, -20, 150), vU(r, 12, 24)]);
  for (let i = 0; i < 8; i++) clusters.push([vU(r, -200, 200), vU(r, -90, -190), vU(r, 14, 26)]);
  for (const [cx, cz, R] of clusters) for (let i = 0, n = Math.round(R * TN.islandDensity); i < n; i++) {
    const a = r() * vTAU, d = Math.sqrt(r()) * R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, u = r();
    if (u < 0.72) plant("mango", x, z, vU(r, 9, 14), 2); else plant(u < 0.88 ? "coconut" : "betel", x, z, vU(r, 13, 17), 2);
  }
  // ---- assemble ----
  b.build(root);
  const flat = new THREE.Group(); ib.build(flat, false); flat.traverse((o) => o.layers.set(NOINK)); root.add(flat);
  const trees = new THREE.Group(); trees.name = "trees"; tb.build(trees); tkb.build(trees, false); ncb.build(trees, false); root.add(trees);
  for (const m of spill) root.add(m);
  const tinG = new THREE.Group(), pucG = new THREE.Group(), umG = new THREE.Group();
  tinB.build(tinG); pucB.build(pucG); umB.build(umG, false); pucG.visible = umG.visible = false; root.add(tinG, pucG, umG);
  pegB.build(root, false); // peg + umbrella cast no hard shadows (their hook read as a hand on the wall); a soft plain one instead
  { const n = pegAt(0.83); umG.add(softShadow(n.x + 0.1, n.y - 0.36, HUT[2] + HUT_Z + 0.013, 0.13, 0.78, 0.2, false)); }
  const crops = new THREE.Group(); nb.build(crops, false); crops.traverse((o) => o.layers.set(NOINK)); root.add(crops);
  root.add(tuftMesh(spots));
  sight = []; trunkSink = null;
  /** warm light inside the hut on/off (rain and night shots): doorway + window glow and the pool of light outside */
  return {
    setGlow: (level: 0 | 1 | 2) => { glow.color.copy(level === 2 ? GLOW_ON : level === 1 ? GLOW_DUSK : GLOW_OFF); for (const m of spill) m.visible = level === 2; },
    /** which house stands at HUT (pucca = rebuilt, shots 20-22) and whether the umbrella hangs on the peg */
    setHouse: (house: "tin" | "pucca", umbrella: boolean) => { tinG.visible = house === "tin"; pucG.visible = house === "pucca"; umG.visible = umbrella; },
  };
};

// ---------------- foliage tint per light ----------------
// Under the rain grade the painted greens stayed too fresh: tree / palm / banana materials are multiplied by a darker,
// bluer colour in rain (and a warm-dim one by the lamp). Materials are shared (cached), so this is set once per frame.
const FOLIAGE_TINT: Record<Light, THREE.Color> = {
  day: new THREE.Color(1, 1, 1), golden: new THREE.Color(1, 1, 1), rain: new THREE.Color(0.5, 0.6, 0.86), lamp: new THREE.Color(0.8, 0.72, 0.62),
};
const FOLIAGE_KEYS = ["leafHD0", "leafHD1", "leafHD2", "leafHD3", "leafHD4", "v_coco", "v_betel", "v_dry", "v_bananaLeaf", "v_shaft", "v_tulsi"];
export const setFoliage = (light: Light) => {
  for (const k of FOLIAGE_KEYS) { const m = mats.get(k) as THREE.MeshLambertMaterial | undefined; if (m) m.color.copy(FOLIAGE_TINT[light]); }
};

// ======================================================================================================
// HUT INTERIOR (stage 3a): a 4 m x 3.5 m room at INT. Built as a set: walls face inward (single-sided), so a lens
// outside the front wall sees straight in; the shell casts no shadows, so the lamp key ("lamp" preset) reaches the
// furniture; a dark outer box keeps the sky out. The kupi flame is an emissive card (HDR, blooms) that world.ts turns
// to the lens every frame. Furniture: chouki bed (right), low table with plates + book + kupi (centre), shelf with
// the rice tin (right wall above the bed), steel pot at the bed foot (POT), floor mat, gamcha on a line, back window.
// ======================================================================================================
/** lamp-lit metal: a matcap (view-space shading) with the kupi's small warm highlight, a soft warm sheen and a cool rim.
 *  The interior's two-tone key has no specular sparkle, so the steel / tin read flat without it. */
const metalCap = (key: string, base: string, dark: string, hi: string) => {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshMatcapMaterial({ matcap: ctex(key + "Cap", 256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, base); gr.addColorStop(0.75, mixHex(base, dark, 0.5)); gr.addColorStop(1, dark);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const sheen = g.createRadialGradient(90, 120, 0, 90, 120, 80); // broad warm sheen toward the lamp (left, near the equator: cylinders catch it)
      sheen.addColorStop(0, "rgba(255,200,130,0.35)"); sheen.addColorStop(1, "rgba(255,200,130,0)");
      g.fillStyle = sheen; g.fillRect(0, 0, 256, 256);
      const spot = g.createRadialGradient(74, 116, 0, 74, 116, 18); // the small hot highlight: a vertical glint on cylinder sides
      spot.addColorStop(0, hi); spot.addColorStop(1, "rgba(255,230,180,0)");
      g.fillStyle = spot; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(150,170,200,0.35)"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 120, 0.1, 1.5); g.stroke(); // cool rim
    }) });
    mats.set(key, m);
  }
  return m;
};
const steelMat = () => metalCap("v_steelCap", "#8a8f97", "#2d3037", "#fff1d0");
const plankTex = () => ctex("v_plank", 256, 256, (g, r) => {
  g.fillStyle = "#8a5a34"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) { g.fillStyle = "rgba(50,28,14,0.45)"; g.fillRect(0, y, 256, 2); }
  g.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) { const y = r() * 256; g.strokeStyle = r() < 0.5 ? "rgba(170,120,75,0.35)" : "rgba(70,40,20,0.3)"; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + (r() - 0.5) * 8, 170, y + (r() - 0.5) * 8, 256, y); g.stroke(); }
});
/** kantha quilt: faded red with rows of white running stitches and a border */
const kanthaTex = () => ctex("v_kantha", 256, 256, (g) => {
  g.fillStyle = "#9a5e50"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#4f6572"; g.fillRect(0, 0, 256, 18); g.fillRect(0, 238, 256, 18);
  g.strokeStyle = "rgba(236,226,206,0.55)"; g.lineWidth = 2; g.setLineDash([6, 5]);
  for (let y = 26; y < 236; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.setLineDash([]);
});
/** gamcha: red / white / green check towel */
const gamchaTex = () => ctex("v_gamcha", 128, 128, (g) => {
  g.fillStyle = "#c8443a"; g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 128; k += 32) { g.fillStyle = "rgba(245,240,225,0.8)"; g.fillRect(k + 4, 0, 6, 128); g.fillRect(0, k + 4, 128, 6); g.fillStyle = "rgba(40,110,60,0.7)"; g.fillRect(k + 16, 0, 4, 128); g.fillRect(0, k + 16, 128, 4); }
});
/** kupi flame: white-yellow core, orange body, soft transparent edge (teardrop) */
const flameTex = () => ctex("v_flame", 64, 128, (g) => {
  const im = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = (x + 0.5) / 32 - 1, v = 1 - (y + 0.5) / 128, w = 0.85 * Math.sin(Math.PI * Math.min(1, v * 1.05)) ** 0.7 * (1 - 0.35 * v);
    const d = Math.abs(u) / Math.max(0.01, w), a = Math.max(0, 1 - d) ** 0.8 * Math.min(1, v * 6), core = Math.max(0, 1 - d * 1.6) * (v < 0.55 ? 1 : 0.5), i = (y * 64 + x) * 4;
    im.data[i] = 255; im.data[i + 1] = Math.round(255 * (0.55 + 0.45 * core)); im.data[i + 2] = Math.round(255 * (0.15 + 0.85 * core * core)); im.data[i + 3] = Math.round(255 * a);
  }
  g.putImageData(im, 0, 0);
});
const haloTexV = () => ctex("v_halo", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.3, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
/** pati (sitalpati) floor mat: fine split-cane weave with two dyed border stripes, one image over the mat */
const patiTex = () => ctex("v_pati", 512, 288, (g, r) => {
  g.fillStyle = "#cbb07a"; g.fillRect(0, 0, 512, 288);
  for (let y = 0; y < 288; y += 4) { g.fillStyle = (y / 4) % 2 ? "rgba(120,90,50,0.16)" : "rgba(255,240,205,0.12)"; g.fillRect(0, y, 512, 2); }
  for (let x = 0; x < 512; x += 6) { g.fillStyle = "rgba(90,65,35,0.08)"; g.fillRect(x, 0, 1, 288); }
  for (const y of [18, 258]) { g.fillStyle = "#8c3b33"; g.fillRect(0, y, 512, 10); g.fillStyle = "#2f5f6a"; g.fillRect(0, y + 12, 512, 4); }
  for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(90,65,35,0.1)"; g.fillRect(r() * 512, r() * 288, 20 + r() * 40, 2); }
});
/** hut floor: smoothed mud, darker and less saturated than the plinth (the lamp light already warms it) */
const floorTex = () => ctex("v_floorIn", 512, 512, (g, r) => {
  g.fillStyle = "#7a6048"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) wrapAt(512, 512, r() * 512, r() * 512, 70, (x, y) => ell(g, x, y, 20 + r() * 50, 8 + r() * 16, r() < 0.5 ? "rgba(150,120,90,0.16)" : "rgba(60,45,32,0.16)"));
});
export const ROOM = { X: 2, Z: 1.75, WALL: 2.3, RIDGE: 3.0 };
export const buildInterior = (root: THREE.Object3D) => {
  const b = new Batch(), sb = new Batch(), r = rng(41);
  const P = (x: number, y: number, z: number) => V(INT[0] + x, y, INT[2] + z);
  const { X, Z, WALL: WH, RIDGE } = ROOM, mud = VM.mud(), wood = lam("v_plankM", () => ({ map: plankTex() }));
  const box = (bb: Batch, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 0) => bb.add(boxGeo(P(x0, y0, z0), P(x1, y1, z1), tile, true), mat);
  // ---- shell (no shadows): mud floor, mud walls facing in, gable ends, tin roof underside with bamboo rafters ----
  sb.add(quad(P(-X, 0, Z), P(X, 0, Z), P(X, 0, -Z), P(-X, 0, -Z), 2, 1.75), lam("v_floorIn", () => ({ map: floorTex() })));
  sb.add(quad(P(-X, 0, -Z), P(X, 0, -Z), P(X, WH, -Z), P(-X, WH, -Z), 2, 0.92), mud);
  sb.add(quad(P(X, 0, Z), P(-X, 0, Z), P(-X, WH, Z), P(X, WH, Z), 2, 0.92), mud);
  sb.add(quad(P(-X, 0, Z), P(-X, 0, -Z), P(-X, WH, -Z), P(-X, WH, Z), 1.75, 0.92), mud);
  sb.add(quad(P(X, 0, -Z), P(X, 0, Z), P(X, WH, Z), P(X, WH, -Z), 1.75, 0.92), mud);
  sb.add(tri(P(-X, WH, Z), P(-X, WH, -Z), P(-X, RIDGE, 0)), mud);
  sb.add(tri(P(X, WH, -Z), P(X, WH, Z), P(X, RIDGE, 0)), mud);
  sb.add(quad(P(-X, WH, -Z), P(X, WH, -Z), P(X, RIDGE, 0), P(-X, RIDGE, 0), 4 / 2.43, 1.9 / 2.43), VM.tin());
  sb.add(quad(P(X, WH, Z), P(-X, WH, Z), P(-X, RIDGE, 0), P(X, RIDGE, 0), 4 / 2.43, 1.9 / 2.43), VM.tin());
  const bam = VM.bamboo();
  sb.add(rodGeo(P(-X, RIDGE - 0.06, 0), P(X, RIDGE - 0.06, 0), 0.05), bam);
  for (const s of [-1, 1]) {
    sb.add(rodGeo(P(-X, WH - 0.04, s * (Z - 0.05)), P(X, WH - 0.04, s * (Z - 0.05)), 0.045), bam);
    for (let x = -1.6; x <= 1.61; x += 0.8) sb.add(rodGeo(P(x, WH - 0.02, s * (Z - 0.04)), P(x, RIDGE - 0.07, 0), 0.03), bam);
  }
  // back window (night outside, bamboo bars) and the closed side door on the left wall
  sb.add(quad(P(-0.65, 1.3, -Z + 0.01), P(0.0, 1.3, -Z + 0.01), P(0.0, 1.9, -Z + 0.01), P(-0.65, 1.9, -Z + 0.01)), lam("v_nightWin", () => ({ color: "#1b2640" })));
  for (let i = 0; i <= 4; i++) { const x = -0.65 + (0.65 * i) / 4; sb.add(rodGeo(P(x, 1.25, -Z + 0.04), P(x, 1.95, -Z + 0.04), i % 4 ? 0.014 : 0.03), bam); }
  sb.add(quad(P(-X + 0.01, 0, 0.7), P(-X + 0.01, 0, -0.2), P(-X + 0.01, 1.85, -0.2), P(-X + 0.01, 1.85, 0.7), 2.5, 5), VM.weave());
  for (const z of [-0.23, 0.73]) sb.add(rodGeo(P(-X + 0.04, 0, z), P(-X + 0.04, 1.92, z), 0.035), bam);
  sb.add(rodGeo(P(-X + 0.05, 1.9, -0.3), P(-X + 0.05, 1.9, 0.8), 0.03), bam);
  // a framed calendar on the back wall
  sb.add(quad(P(0.75, 1.35, -Z + 0.012), P(1.05, 1.35, -Z + 0.012), P(1.05, 1.75, -Z + 0.012), P(0.75, 1.75, -Z + 0.012)), lam("v_calendar", () => ({ color: "#e6d6aa" })));
  // ---- furniture (casts shadows) ----
  // chouki bed along the right wall: legs, frame, planks, kantha quilt, rolled bedding at the head
  for (const [x, z] of [[0.66, -1.66], [1.91, -1.66], [0.66, 0.31], [1.91, 0.31]]) box(b, wood, x - 0.04, x + 0.04, 0, 0.4, z - 0.04, z + 0.04);
  box(b, wood, 0.62, 1.95, 0.36, 0.42, -1.7, 0.35);
  box(b, wood, 0.62, 1.95, 0.42, 0.45, -1.7, 0.35, 0.5);
  box(b, lam("v_kanthaM", () => ({ map: kanthaTex() })), 0.66, 1.91, 0.45, 0.5, -1.25, 0.3, 1.2);
  b.add(hedgeGeo(), lam("v_bedding", () => ({ color: "#e4ddcd" })), new THREE.Matrix4().compose(P(1.28, 0.5, -1.47), new THREE.Quaternion(), V(0.55, 0.13, 0.32)));
  // steel pot (dekchi) at the bed foot: catches the drips in shot 5
  const pot = new THREE.CylinderGeometry(0.15, 0.12, 0.24, 28, 1, true).translate(0, 0.12, 0);
  sb.add(pot, steelMat(), new THREE.Matrix4().makeTranslation(INT[0] + 1.1, 0, INT[2] + 0.8)); // the pot casts no hard shadow (a soft decal below)
  sb.add(new THREE.CircleGeometry(0.12, 28).rotateX(-Math.PI / 2).translate(0, 0.012, 0), steelMat(), new THREE.Matrix4().makeTranslation(INT[0] + 1.1, 0, INT[2] + 0.8));
  sb.add(new THREE.TorusGeometry(0.15, 0.012, 8, 32).rotateX(Math.PI / 2).translate(0, 0.24, 0), steelMat(), new THREE.Matrix4().makeTranslation(INT[0] + 1.1, 0, INT[2] + 0.8));
  sb.add(new THREE.CircleGeometry(0.142, 28).rotateX(-Math.PI / 2).translate(0, 0.15, 0), lam("v_potWater2", () => ({ color: "#8aa2b4" })), new THREE.Matrix4().makeTranslation(INT[0] + 1.1, 0, INT[2] + 0.8));
  // shelf on the right wall above the bed: plank, brackets, the rice tin, a clay jar, a bottle
  box(b, wood, 1.62, 1.98, 1.07, 1.1, -1.65, -0.75);
  for (const z of [-1.55, -0.85]) box(b, wood, 1.9, 1.98, 0.92, 1.07, z - 0.02, z + 0.02);
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 28).translate(0, 0.11, 0), metalCap("v_riceTinCap", "#9d9474", "#3b3628", "#fff0c8"), new THREE.Matrix4().makeTranslation(INT[0] + 1.79, 1.1, INT[2] - 1.2));
  b.add(new THREE.CylinderGeometry(0.104, 0.104, 0.025, 28).translate(0, 0.232, 0), steelMat(), new THREE.Matrix4().makeTranslation(INT[0] + 1.79, 1.1, INT[2] - 1.2));
  b.add(lobeGeo(1), lam("v_clayJar", () => ({ color: "#a8603a" })), new THREE.Matrix4().compose(P(1.8, 1.21, -1.5), new THREE.Quaternion(), V(0.09, 0.11, 0.09)));
  b.add(new THREE.CylinderGeometry(0.03, 0.035, 0.18, 14).translate(0, 0.09, 0), lam("v_bottle", () => ({ color: "#6d8a6a" })), new THREE.Matrix4().makeTranslation(INT[0] + 1.78, 1.1, INT[2] - 0.92));
  // low table at TABLE: top, legs, two steel plates, an exercise book, the kupi
  box(b, wood, -0.45, 0.45, 0.41, 0.45, -0.3, 0.3, 0.5);
  for (const [x, z] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) box(b, wood, x - 0.025, x + 0.025, 0, 0.41, z - 0.025, z + 0.025);
  for (const [x, z] of [[-0.2, 0.08], [0.12, 0.1]]) b.add(new THREE.CylinderGeometry(0.12, 0.1, 0.018, 28).translate(0, 0.459, 0), metalCap("v_plateCap2", "#9aa0a8", "#5a5f67", "#f2e6cc"), new THREE.Matrix4().makeTranslation(INT[0] + x, 0, INT[2] + z));
  box(b, lam("v_book", () => ({ color: "#3f6fb5" })), -0.38, -0.14, 0.45, 0.47, -0.24, -0.06);
  const kx = 0.3, kz = -0.17, tin = metalCap("v_kupiCap", "#6c6860", "#25231f", "#ffe2a8");
  b.add(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 16).translate(0, 0.49, 0), tin, new THREE.Matrix4().makeTranslation(INT[0] + kx, 0, INT[2] + kz));
  b.add(new THREE.CylinderGeometry(0.011, 0.014, 0.035, 10).translate(0, 0.547, 0), tin, new THREE.Matrix4().makeTranslation(INT[0] + kx, 0, INT[2] + kz));
  // floor mat (pati) in front of the table, gamcha drying on a line along the left wall
  sb.add(quad(P(-0.9, 0.006, 1.3), P(0.9, 0.006, 1.3), P(0.9, 0.006, 0.35), P(-0.9, 0.006, 0.35), 1, 1), lam("v_patiM", () => ({ map: patiTex() })));
  sb.add(rodGeo(P(-1.95, 1.95, -1.6), P(-1.95, 1.95, -0.5), 0.006, 0.006, 5), lam("v_rope", () => ({ color: "#b8a27a" })));
  b.add(quad(P(-1.93, 1.45, -0.75), P(-1.93, 1.45, -1.35), P(-1.93, 1.95, -1.35), P(-1.93, 1.95, -0.75), 1, 1), lam("v_gamchaM", () => ({ map: gamchaTex(), side: THREE.DoubleSide })));
  sb.build(root, false);
  b.build(root, true);
  root.add(softShadow(INT[0] + 1.1, 0.006, INT[2] + 0.8, 0.46, 0.4, 0.28, true)); // under the pot
  // outer dark box: nothing outside the room (no sky through the open fourth wall)
  const dark = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 14), new THREE.MeshBasicMaterial({ color: "#07060a", side: THREE.BackSide, fog: false }));
  dark.position.copy(P(0, 3, 0)); dark.layers.set(NOINK); root.add(dark);
  // kupi flame (emissive card, HDR -> bloom) + a soft warm halo
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.075), new THREE.MeshBasicMaterial({ map: flameTex(), color: new THREE.Color(5, 3.3, 1.3), transparent: true, depthWrite: false, fog: false }));
  flame.position.copy(P(kx, 0.6, kz)); flame.layers.set(NOINK); flame.renderOrder = 9; root.add(flame);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: haloTexV(), color: new THREE.Color(1.0, 0.6, 0.25), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.copy(P(kx, 0.6, kz)); halo.layers.set(NOINK); halo.renderOrder = 9; root.add(halo);
  void r;
  /** turn the flame + halo to the lens and flicker (deterministic per frame) */
  return {
    face: (cam: THREE.Camera, f: number) => {
      const k = 1 + 0.07 * Math.sin(f * 1.7) + 0.04 * Math.sin(f * 4.3 + 1);
      for (const m of [flame, halo]) m.quaternion.copy(cam.quaternion);
      flame.scale.set(1, k, 1); flame.position.y = 0.6 + 0.0375 * (k - 1);
    },
  };
};

// ======================================================================================================
// TOWN (stage 3b): a Bangladeshi district-town street around STREET (x 200, running along z): tin and brick shops on
// both sides, rickshaws and a CNG, poles with sagging wires, street trees; side lanes to the bank (z 69-79), the mess
// (z 41-45) and the medical college gate (z 109-121); the mess room at MESS is a set open toward its cameras (like the
// hut interior); ROOF is the top of a 4-storey block with water tanks. No legible text anywhere (signboards are shapes).
// ======================================================================================================
// muted (about half the old pastel saturation): weathered cream, sage, dusty rose, grey-blue, off-white, ochre, sand, grey-green
const T_WALLS = ["#d9cfb9", "#c6cdc4", "#d3c1b9", "#c2c8cf", "#d9d5cc", "#c8b296", "#cbc1aa", "#bcc4ba"];
const T_SIGNS = ["#2f6a43", "#c0353a", "#2f5f8a", "#d98a2e", "#6b3f8a", "#1f7a7a"];
/** plaster facade with damp streaks, barred windows per floor (2.9 m), optional shop front with a rolling shutter */
const townFacade = (key: string, wm: number, hm: number, wall: string, shop: boolean, sign: string) => {
  const ppm = 48, W = Math.round(wm * ppm), H = Math.round(hm * ppm);
  return ctex("tf_" + key, W, H, (g, r) => {
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    for (let i = 0; i < Math.round(wm * 1.5); i++) { // damp streaks running down from the roof and the sills
      const x = r() * W, y0 = r() < 0.5 ? 0 : r() * H * 0.6, len = 40 + r() * 140;
      const gr = g.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, "rgba(70,70,60,0.22)"); gr.addColorStop(1, "rgba(70,70,60,0)");
      g.fillStyle = gr; g.fillRect(x, y0, 8 + r() * 26, len);
    }
    const floors = Math.max(1, Math.round(hm / 2.9)), n = Math.max(1, Math.floor(wm / 2.4));
    for (let f = shop ? 1 : 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const cx = ((i + 0.5) / n) * W, yb = H - (f * 2.9 + 0.95) * ppm, ww = 1.15 * ppm, wh = 1.3 * ppm;
      g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(cx - ww / 2 - 4, yb - wh - 4, ww + 8, wh + 10);
      g.fillStyle = "#3a4250"; g.fillRect(cx - ww / 2, yb - wh, ww, wh);
      g.fillStyle = "rgba(160,190,215,0.25)"; g.fillRect(cx - ww / 2, yb - wh, ww / 2, wh);
      g.strokeStyle = "#f2efe8"; g.lineWidth = 2.5;
      for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(cx - ww / 2 + (k * ww) / 5, yb - wh); g.lineTo(cx - ww / 2 + (k * ww) / 5, yb); g.stroke(); }
      g.beginPath(); g.moveTo(cx - ww / 2, yb - wh / 2); g.lineTo(cx + ww / 2, yb - wh / 2); g.stroke();
      g.fillStyle = "#cfc8b8"; g.fillRect(cx - ww / 2 - 6, yb, ww + 12, 6);
    }
    if (shop) {
      const sh = 2.4 * ppm;
      g.fillStyle = "#20232a"; g.fillRect(6, H - sh, W - 12, sh);                       // dark shop interior
      for (let y = H - sh; y < H - sh + 0.9 * ppm; y += 6) { g.fillStyle = y % 12 ? "#9aa0a8" : "#7d838c"; g.fillRect(6, y, W - 12, 6); } // half-raised shutter
      for (let i = 0; i < 26; i++) { g.fillStyle = pick2(r, ["#d9a93a", "#c0353a", "#2f6fb5", "#e8e2d0", "#3a8a4a"]); g.fillRect(14 + r() * (W - 40), H - 1.3 * ppm + r() * 0.9 * ppm, 10 + r() * 16, 10 + r() * 14); }
      g.fillStyle = sign; g.fillRect(0, H - sh - 0.75 * ppm, W, 0.7 * ppm);                // signboard: colour + Bangla-like letter shapes
      banglaish(g, r, 16, H - sh - 0.62 * ppm, W - 32, 0.42 * ppm, "rgba(255,250,235,0.92)");
    }
  });
};
const asphaltTex = () => ctex("v_asphalt", 512, 512, (g, r) => {
  g.fillStyle = "#56585c"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) wrapAt(512, 512, r() * 512, r() * 512, 80, (x, y) => ell(g, x, y, 30 + r() * 60, 20 + r() * 40, r() < 0.5 ? "rgba(40,40,44,0.25)" : "rgba(120,118,112,0.18)"));
  for (let i = 0; i < 2000; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"; g.fillRect(r() * 512, r() * 512, 2, 2); }
});
const pavingTex = () => ctex("v_paving", 256, 256, (g, r) => {
  g.fillStyle = "#b8b0a2"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 64) { g.fillStyle = jit(r, "#bdb4a5", 0.06); g.fillRect(x + ((y / 32) % 2) * 32 + 1, y + 1, 62, 30); }
});
const brickPaveTex = () => ctex("v_brickpave", 256, 256, (g, r) => {
  g.fillStyle = "#7a4a34"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 32) { g.fillStyle = jit(r, "#a85d3e", 0.1); g.fillRect(x + ((y / 16) % 2) * 16 + 1, y + 1, 30, 14); }
});
const TM = {
  asphalt: () => lam("t_asphalt", () => ({ map: asphaltTex() })),
  paving: () => lam("t_paving", () => ({ map: pavingTex() })),
  brickPave: () => lam("t_brickPave", () => ({ map: brickPaveTex() })),
  curb: () => lam("t_curb", () => ({ color: "#d6d0c4" })),
  side: (c: string) => lam("t_side" + c, () => ({ color: mixHex(c, "#7a7268", 0.18) })),
  roof: () => lam("t_roof", () => ({ color: "#9a958c" })),
  tank: () => lam("t_tank", () => ({ color: "#2b2b30" })),
  pole: () => lam("t_pole", () => ({ color: "#a8a49a" })),
  wire: () => lam("t_wire", () => ({ color: "#1d1b20" })),
  glass: () => lam("t_glass", () => ({ color: "#5d7f9c" })),
};
const mixHex = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
type Face = "+x" | "-x" | "+z" | "-z";
/** a town building: front facade texture on `face`, plain plaster sides, flat roof with a parapet and a water tank */
const tBlock = (b: Batch, x0: number, x1: number, z0: number, z1: number, h: number, face: Face, wall: string, shop: boolean, sign: string, tank = true) => {
  if (inTheWay(x0, x1, 0, h, z0, z1)) return;
  const front = Math.round(face === "+x" || face === "-x" ? z1 - z0 : x1 - x0), key = `${wall}${h}${front}${shop ? sign : ""}`;
  const fm = lam("tfm_" + key, () => ({ map: townFacade(key, front, h, wall, shop, sign) }));
  const sm = lam("tsm_" + wall + h, () => ({ map: townFacade("s" + wall + h, 8, h, wall, false, "#000000") }));
  const P = { "+x": [V(x1, 0, z1), V(x1, 0, z0)], "-x": [V(x0, 0, z0), V(x0, 0, z1)], "+z": [V(x0, 0, z1), V(x1, 0, z1)], "-z": [V(x1, 0, z0), V(x0, 0, z0)] } as const;
  const wallQ = (a: THREE.Vector3, c: THREE.Vector3, mat: THREE.Material, len: number) => b.add(quad(a, c, V(c.x, h, c.z), V(a.x, h, a.z), mat === fm ? 1 : Math.max(1, Math.round(len / 8)), 1), mat);
  for (const f of ["+x", "-x", "+z", "-z"] as Face[]) { const [a, c] = P[f]; wallQ(a, c, f === face ? fm : sm, a.distanceTo(c)); }
  b.add(flatUp(x0, x1, z0, z1, h, 4), TM.roof());
  for (const [a, c] of [[V(x0, h, z0), V(x1, h, z0 + 0.2)], [V(x0, h, z1 - 0.2), V(x1, h, z1)], [V(x0, h, z0), V(x0 + 0.2, h, z1)], [V(x1 - 0.2, h, z0), V(x1, h, z1)]] as const)
    b.add(boxGeo(V(a.x, h, a.z), V(c.x, h + 0.9, c.z), 0, false), TM.side(wall));
  if (tank) b.add(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 18).translate((x0 + x1) / 2 + 0.8, h + 1.0, (z0 + z1) / 2), TM.tank());
  if (shop && (face === "+x" || face === "-x")) { // awning over the footpath (striped cloth or tin), a blade signboard sticking out
    const o = 1.3, y0 = 3.1, y1 = 2.75, fx = face === "+x" ? x1 : x0, sx = face === "+x" ? 1 : -1, cloth = (Math.round(z0 * 7) % 2) === 0;
    const aw = cloth ? lam("t_awning" + sign, () => ({ map: awningTex(sign), side: THREE.DoubleSide })) : VM.tin();
    b.add(face === "+x" ? quad(V(fx, y0, z0), V(fx, y0, z1), V(fx + o, y1, z1), V(fx + o, y1, z0), 1, 1) : quad(V(fx, y0, z1), V(fx, y0, z0), V(fx - o, y1, z0), V(fx - o, y1, z1), 1, 1), aw);
    if (cloth) b.add(face === "+x" ? quad(V(fx + o, y1, z0), V(fx + o, y1, z1), V(fx + o, y1 - 0.25, z1), V(fx + o, y1 - 0.25, z0), 1, 0.15) : quad(V(fx - o, y1, z1), V(fx - o, y1, z0), V(fx - o, y1 - 0.25, z0), V(fx - o, y1 - 0.25, z1), 1, 0.15), aw);
    if ((Math.round(z0 * 13) % 3) !== 0) { // blade sign: perpendicular to the facade, both faces painted
      const zc = z0 + 0.6, bm = lam("t_blade" + sign, () => ({ map: bladeTex(sign), side: THREE.DoubleSide }));
      b.add(quad(V(fx + sx * 0.25, 3.45, zc), V(fx + sx * 1.15, 3.45, zc), V(fx + sx * 1.15, 4.25, zc), V(fx + sx * 0.25, 4.25, zc)), bm);
      b.add(rodGeo(V(fx, 4.3, zc), V(fx + sx * 1.2, 4.3, zc), 0.015, 0.015, 5), TM.wire());
    }
  }
};
/** a single-storey tin shop: corrugated walls and pent roof, open front with goods on shelves */
const tinShop = (b: Batch, x0: number, x1: number, z0: number, z1: number, face: "+x" | "-x", seed: number) => {
  if (inTheWay(x0, x1, 0, 3.4, z0, z1)) return;
  const r = rng(seed), tin = VM.tin(), fx = face === "+x" ? x1 : x0, bx = face === "+x" ? x0 : x1, s = face === "+x" ? 1 : -1;
  b.add(quad(V(bx, 0, face === "+x" ? z0 : z1), V(bx, 0, face === "+x" ? z1 : z0), V(bx, 3.0, face === "+x" ? z1 : z0), V(bx, 3.0, face === "+x" ? z0 : z1), 1, 1), tin);
  for (const z of [z0, z1]) b.add(quad(V(z === z0 ? fx : bx, 0, z), V(z === z0 ? bx : fx, 0, z), V(z === z0 ? bx : fx, z === z0 ? 3.0 : 3.0, z), V(z === z0 ? fx : bx, 3.0, z), 1, 1), tin);
  b.add(quad(V(bx, 3.0, z0), V(bx, 3.0, z1), V(fx + s * 1.2, 2.7, z1), V(fx + s * 1.2, 2.7, z0)), tin);
  b.add(quad(V(bx + s * 0.05, 0, face === "+x" ? z1 : z0), V(bx + s * 0.05, 0, face === "+x" ? z0 : z1), V(bx + s * 0.05, 2.9, face === "+x" ? z0 : z1), V(bx + s * 0.05, 2.9, face === "+x" ? z1 : z0)), VM.dark());
  for (const y of [0.8, 1.4, 2.0]) {
    b.add(boxGeo(V(Math.min(bx, bx + s * 0.6), y - 0.03, z0 + 0.1), V(Math.max(bx, bx + s * 0.6), y, z1 - 0.1)), VM.wood());
    for (let z = z0 + 0.25; z < z1 - 0.25; z += 0.28) b.add(boxGeo(V(Math.min(bx + s * 0.1, bx + s * 0.4), y, z), V(Math.max(bx + s * 0.1, bx + s * 0.4), y + 0.15 + r() * 0.15, z + 0.2)), lam("t_goods" + (Math.floor(r() * 5)), () => ({ color: pick2(rng(seed), ["#d9a93a", "#c0353a", "#2f6fb5", "#e8e2d0", "#3a8a4a"]) })));
  }
  b.add(boxGeo(V(Math.min(fx, fx - s * 0.5), 0, z0 + 0.2), V(Math.max(fx, fx - s * 0.5), 0.8, z1 - 0.2)), VM.wood()); // counter
  b.add(quad(V(fx + s * 0.02, 3.0, face === "+x" ? z1 : z0), V(fx + s * 0.02, 3.0, face === "+x" ? z0 : z1), V(fx + s * 0.02, 3.6, face === "+x" ? z0 : z1), V(fx + s * 0.02, 3.6, face === "+x" ? z1 : z0)), lam("t_sign" + (seed % 6), () => ({ color: T_SIGNS[seed % 6] })));
};
/** cycle rickshaw (local: +z forward): three wheels, frame, bench seat, folding hood, decorated back panel */
const rickshaw = (b: Batch, x: number, z: number, yaw: number, seed: number) => {
  if (inTheWay(x - 1.2, x + 1.2, 0, 2, z - 1.2, z + 1.2, true)) return;
  const m = new THREE.Matrix4().compose(V(x, 0, z), yawQ(yaw), V(1, 1, 1)), col = ["#2f6fb5", "#c0353a", "#3a7a4a", "#d98a2e"][seed % 4];
  const add = (g: THREE.BufferGeometry, mat: THREE.Material) => b.add(g, mat, m), metal = lam("t_rickMetal", () => ({ color: "#3a3d45" }));
  const wheel = (wx: number, wz: number) => add(new THREE.TorusGeometry(0.33, 0.028, 6, 22).rotateY(Math.PI / 2).translate(wx, 0.35, wz), metal);
  wheel(-0.48, -0.45); wheel(0.48, -0.45); wheel(0, 0.85);
  add(rodGeo(V(-0.48, 0.35, -0.45), V(0.48, 0.35, -0.45), 0.02), metal);
  add(rodGeo(V(0, 0.45, -0.3), V(0, 0.55, 0.85), 0.035), metal);
  add(rodGeo(V(0, 0.55, 0.85), V(0, 1.05, 0.7), 0.025), metal);
  add(rodGeo(V(-0.25, 1.05, 0.7), V(0.25, 1.05, 0.7), 0.02), metal);
  add(boxGeo(V(-0.12, 0.85, 0.35), V(0.12, 0.92, 0.6)), lam("t_rickSaddle", () => ({ color: "#2a2228" })));
  add(boxGeo(V(-0.5, 0.75, -0.75), V(0.5, 0.95, -0.25)), lam("t_rickSeat" + col, () => ({ color: col })));
  add(boxGeo(V(-0.5, 0.95, -0.78), V(0.5, 1.4, -0.68)), lam("t_rickBack", () => ({ color: "#e8d8a0" })));
  add(boxGeo(V(-0.45, 0.45, -0.25), V(0.45, 0.5, 0.05)), metal);
  add(new THREE.CylinderGeometry(0.55, 0.55, 1.05, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.85, 1).translate(0, 1.35, -0.55), lam("t_rickHood" + col, () => ({ color: mixHex(col, "#111111", 0.35), side: THREE.DoubleSide })));
};
const cng = (b: Batch, x: number, z: number, yaw: number) => {
  if (inTheWay(x - 1.5, x + 1.5, 0, 2, z - 1.5, z + 1.5, true)) return;
  const m = new THREE.Matrix4().compose(V(x, 0, z), yawQ(yaw), V(1, 1, 1)), add = (g: THREE.BufferGeometry, mat: THREE.Material) => b.add(g, mat, m);
  const green = lam("t_cng", () => ({ color: "#2f8a4f" })), metal = lam("t_rickMetal", () => ({ color: "#3a3d45" }));
  add(boxGeo(V(-0.65, 0.35, -1.1), V(0.65, 1.15, 0.9)), green);
  add(boxGeo(V(-0.66, 1.15, -1.1), V(0.66, 1.75, 0.9)), lam("t_cngCage", () => ({ color: "#2a2d2f" })));
  add(boxGeo(V(-0.62, 1.75, -1.12), V(0.62, 1.82, 0.95)), green);
  for (const [wx, wz] of [[-0.6, -0.7], [0.6, -0.7], [0, 1.0]]) add(new THREE.TorusGeometry(0.24, 0.07, 6, 18).rotateY(Math.PI / 2).translate(wx, 0.25, wz), metal);
};
/** a concrete pole every span, with four sagging wires to the next one */
const polesAlong = (b: Batch, x: number, z0: number, z1: number, step: number) => {
  const poles: number[] = [];
  for (let z = z0; z <= z1; z += step) { poles.push(z); b.add(boxGeo(V(x - 0.1, 0, z - 0.1), V(x + 0.1, 8.5, z + 0.1)), TM.pole()); b.add(boxGeo(V(x - 0.9, 7.9, z - 0.06), V(x + 0.9, 8.0, z + 0.06)), TM.pole()); }
  for (let i = 0; i + 1 < poles.length; i++) for (const [dx, y] of [[-0.8, 7.95], [-0.3, 7.95], [0.3, 7.95], [0.8, 7.95]] as const) {
    const n = 6, sag = 0.55, pts: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push(V(x + dx, y - sag * 4 * t * (1 - t), poles[i] + (poles[i + 1] - poles[i]) * t)); }
    for (let k = 0; k < n; k++) b.add(rodGeo(pts[k], pts[k + 1], 0.011, 0.011, 4), TM.wire());
  }
};

export const buildTownSet = (root: THREE.Object3D, rays: Ray[] = []) => {
  sight = rays;
  const r = rng(53), b = new Batch(), tb = new Batch(), fl = new Batch();
  const [SX, , SZ0] = STREET; void SZ0;
  const W0 = SX - 6, W1 = SX - 4, E0 = SX + 4, E1 = SX + 6; // footpath edges: west row front at 194, street 196..204, east row front at 206
  // ---- ground: grass everywhere, asphalt street + lanes, paved footpaths with curbs ----
  b.add(flatUp(SX - 300, SX + 300, -300, 400, 0, 4), VM.grass());
  fl.add(flatUp(W1, E0, -60, 220, 0.02, 6), TM.asphalt());
  for (const [a, c] of [[W0, W1], [E0, E1]]) { fl.add(flatUp(a, c, -60, 220, 0.15, 2), TM.paving()); b.add(boxGeo(V(a === W0 ? W1 - 0.15 : E0, 0, -60), V(a === W0 ? W1 : E0 + 0.15, 0.16, 220), 0), TM.curb()); }
  fl.add(flatUp(160, W0, 70, 78, 0.02, 6), TM.asphalt());                 // bank lane
  fl.add(flatUp(E1, MESS[0] + 3, 41, 45, 0.03, 3), TM.brickPave());       // mess lane
  fl.add(flatUp(150, W0, 110, 120, 0.02, 6), TM.asphalt());               // medical college road
  // ---- west row (fronts face +x at x = 194) and east row (fronts face -x at x = 206) ----
  const row = (face: "+x" | "-x", zs: [number, number][]) => {
    for (const [za, zb] of zs) for (let z = za; z < zb - 3; ) {
      const w = Math.min(zb - z, 4.5 + r() * 4), wall = T_WALLS[Math.floor(r() * T_WALLS.length) % T_WALLS.length], sign = T_SIGNS[Math.floor(r() * 6) % 6];
      const [xa, xb] = face === "+x" ? [W0 - 8, W0] : [E1, E1 + 8];
      if (r() < 0.3) tinShop(b, face === "+x" ? xb - 4.5 : xa, face === "+x" ? xb : xa + 4.5, z + 0.1, z + w - 0.1, face, Math.floor(r() * 1000));
      else tBlock(b, xa, xb, z, z + w, [3.4, 6.2, 9.1, 12, 14.9][Math.floor(r() * 5) % 5], face, wall, true, sign);
      z += w;
    }
  };
  row("+x", [[-40, 56], [79, 80], [90, 108.5], [121, 200]]);
  row("-x", [[-40, 33], [46, 200]]);
  // ---- bank: front faces the lane (+z) at z = 69 ----
  {
    const x0 = 181, x1 = W0, z0 = 56, z1 = 69, h = 12;
    const bankTex = ctex("t_bank", 624, 576, (g) => {
      g.fillStyle = "#eeeae2"; g.fillRect(0, 0, 624, 576);
      g.fillStyle = "#5d7f9c"; g.fillRect(20, 456, 584, 120);                         // glass ground floor
      g.strokeStyle = "#8ea3b6"; g.lineWidth = 3; for (let x = 20; x <= 604; x += 73) { g.beginPath(); g.moveTo(x, 456); g.lineTo(x, 576); g.stroke(); }
      g.fillStyle = "rgba(230,236,242,0.18)"; for (let x = 30; x < 600; x += 73) g.fillRect(x, 470, 18, 100); // soft reflections
      g.fillStyle = "#1f3f6e"; g.fillRect(0, 400, 624, 48);                            // sign band (emblem shapes only)
      g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(60, 424, 16, 0, vTAU); g.fill(); g.fillStyle = "#ffffff"; g.fillRect(100, 416, 320, 6); g.fillRect(100, 428, 220, 6);
      for (let f = 0; f < 3; f++) { g.fillStyle = "#4d6a86"; g.fillRect(20, 300 - f * 130, 584, 70); g.strokeStyle = "#eeeae2"; g.lineWidth = 6; for (let x = 20; x <= 604; x += 52) { g.beginPath(); g.moveTo(x, 300 - f * 130); g.lineTo(x, 370 - f * 130); g.stroke(); } }
    });
    tBlock(b, x0, x1, z0, z1, h, "+z", "#eeeae2", false, "#1f3f6e");
    b.add(quad(V(x0, 0, z1 + 0.02), V(x1, 0, z1 + 0.02), V(x1, h, z1 + 0.02), V(x0, h, z1 + 0.02)), lam("t_bankM", () => ({ map: bankTex })));
    b.add(boxGeo(V(185, 0, z1), V(191.5, 0.18, z1 + 0.9)), TM.curb());
    b.add(boxGeo(V(186.2, 0.18, z1), V(190.8, 0.34, z1 + 0.45)), TM.curb());
    const steelD = lam("t_doorSteel", () => ({ color: "#3a414c" })), glassD = lam("t_glassDoor", () => ({ color: "#86a9c6" }));
    b.add(quad(V(188.6, 0.34, z1 + 0.05), V(191.4, 0.34, z1 + 0.05), V(191.4, 2.6, z1 + 0.05), V(188.6, 2.6, z1 + 0.05)), glassD);
    for (const x of [188.55, 190.0, 191.45]) b.add(boxGeo(V(x - 0.05, 0.34, z1 + 0.03), V(x + 0.05, 2.65, z1 + 0.1)), steelD);
    b.add(boxGeo(V(188.5, 2.6, z1 + 0.03), V(191.5, 2.7, z1 + 0.1)), steelD);
    for (const x of [189.85, 190.15]) b.add(rodGeo(V(x, 1.1, z1 + 0.13), V(x, 1.6, z1 + 0.13), 0.012, 0.012, 6), lam("t_handle", () => ({ color: "#c9ced4" })));
    b.add(boxGeo(V(187.8, 2.82, z1), V(192.2, 2.92, z1 + 1.3)), lam("t_awningBank", () => ({ color: "#1f3f6e" })));
    b.add(boxGeo(V(187.8, 2.8, z1 + 1.26), V(192.2, 2.94, z1 + 1.34)), lam("t_awningEdge", () => ({ color: "#f2c14e" })));
    b.add(quad(V(187.4, 3.0, z1 + 0.06), V(192.6, 3.0, z1 + 0.06), V(192.6, 3.95, z1 + 0.06), V(187.4, 3.95, z1 + 0.06)), lam("t_bankSign", () => ({ map: bankSignTex() })));
    const stool = lam("t_stool", () => ({ color: "#c0353a" }));
    b.add(new THREE.CylinderGeometry(0.17, 0.15, 0.04, 16).translate(191.65, 0.6, z1 + 0.75), stool);
    for (const [ox, oz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) b.add(rodGeo(V(191.65 + ox, 0.18, z1 + 0.75 + oz), V(191.65 + ox * 0.7, 0.58, z1 + 0.75 + oz * 0.7), 0.015, 0.012, 5), stool);
  }
  // ---- under construction behind the engineer (west row z 80-90): columns, slabs, bamboo scaffold ----
  {
    const x0 = W0 - 7, x1 = W0, z0 = 80.5, z1 = 89.5, conc = lam("t_concrete", () => ({ color: "#b9b4aa" }));
    for (const y of [0, 3, 6, 9]) b.add(boxGeo(V(x0, y, z0), V(x1, y + 0.22, z1), 2), conc);
    for (const x of [x0 + 0.3, x1 - 0.3]) for (const z of [z0 + 0.3, (z0 + z1) / 2, z1 - 0.3]) b.add(boxGeo(V(x - 0.18, 0, z - 0.18), V(x + 0.18, 9.2, z + 0.18)), conc);
    for (let z = z0; z <= z1 + 0.01; z += 1.5) b.add(rodGeo(V(x1 + 0.6, 0, z), V(x1 + 0.6, 10.5, z), 0.04), VM.bamboo());
    for (let y = 1; y < 10.5; y += 1.5) b.add(rodGeo(V(x1 + 0.6, y, z0), V(x1 + 0.6, y, z1), 0.035), VM.bamboo());
    for (let z = z0; z < z1; z += 3) b.add(rodGeo(V(x1 + 0.6, 0.5, z), V(x1 + 0.6, 6, z + 3), 0.03), VM.bamboo());
    b.add(boxGeo(V(x0 + 1, 0, z0 + 1), V(x0 + 2.5, 0.6, z0 + 2.2)), lam("t_bricks", () => ({ color: "#b5543c" })));
  }
  // ---- the mess house: a room open toward its cameras (walls face in), floor above, narrow barred window ----
  {
    const [mx, , mz] = MESS, X0 = mx - 2, X1 = mx + 2.5, Z0 = mz - 2.5, Z1 = mz + 2.2, H = 2.8, sb = new Batch();
    const plaster = lam("t_messWall", () => ({ map: townFacade("messIn", 4, 2.8, "#9fc4b8", false, "#000000") })), floor = lam("t_cement", () => ({ color: "#8f8b84" }));
    sb.add(quad(V(X0, 0.01, Z1), V(X1, 0.01, Z1), V(X1, 0.01, Z0), V(X0, 0.01, Z0)), floor);
    sb.add(quad(V(X0, 0, Z0), V(X1, 0, Z0), V(X1, H, Z0), V(X0, H, Z0)), lam("t_messPlain", () => ({ color: "#9fc4b8" })));
    sb.add(quad(V(X1, 0, Z1), V(X0, 0, Z1), V(X0, H, Z1), V(X1, H, Z1)), plaster);
    sb.add(quad(V(X0, 0, Z1), V(X0, 0, Z0), V(X0, H, Z0), V(X0, H, Z1)), lam("t_messPlain", () => ({ color: "#9fc4b8" })));
    sb.add(quad(V(X1, 0, Z0), V(X1, 0, Z1), V(X1, H, Z1), V(X1, H, Z0)), lam("t_messPlain", () => ({ color: "#9fc4b8" })));
    sb.add(quad(V(X0, H, Z0), V(X1, H, Z0), V(X1, H, Z1), V(X0, H, Z1)), lam("t_ceiling", () => ({ color: "#d9d4c8" })));
    // the narrow window in the back wall: bright outside, bars
    sb.add(quad(V(mx + 0.2, 1.05, Z0 + 0.01), V(mx + 0.7, 1.05, Z0 + 0.01), V(mx + 0.7, 2.25, Z0 + 0.01), V(mx + 0.2, 2.25, Z0 + 0.01)), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.8) }));
    for (let i = 0; i <= 3; i++) sb.add(rodGeo(V(mx + 0.2 + (0.5 * i) / 3, 1.0, Z0 + 0.04), V(mx + 0.2 + (0.5 * i) / 3, 2.3, Z0 + 0.04), 0.012), TM.wire());
    // cot along the left wall (Nusrat and Rahat sit on it), thin mattress, pillow, a trunk under it
    const cx0 = mx - 1.6, cx1 = mx + 1.7, cz0 = Z0 + 0.1, cz1 = Z0 + 1.2;
    for (const [x, z] of [[cx0 + 0.05, cz0 + 0.05], [cx1 - 0.05, cz0 + 0.05], [cx0 + 0.05, cz1 - 0.05], [cx1 - 0.05, cz1 - 0.05]]) b.add(boxGeo(V(x - 0.04, 0, z - 0.04), V(x + 0.04, 0.38, z + 0.04)), VM.wood());
    b.add(boxGeo(V(cx0, 0.38, cz0), V(cx1, 0.45, cz1), 1), VM.wood());
    b.add(boxGeo(V(cx0 + 0.03, 0.45, cz0 + 0.03), V(cx1 - 0.03, 0.5, cz1 - 0.03), 0, false), lam("t_mattress", () => ({ color: "#c8b48a" })));
    b.add(hedgeGeo(), lam("v_bedding", () => ({ color: "#e4ddcd" })), new THREE.Matrix4().compose(V(cx1 - 0.4, 0.5, (cz0 + cz1) / 2), new THREE.Quaternion(), V(0.45, 0.12, 0.3)));
    b.add(boxGeo(V(cx0 + 0.4, 0, cz0 + 0.15), V(cx0 + 1.2, 0.32, cz1 - 0.15)), lam("t_trunk", () => ({ color: "#3f5f7a" })));
    // a small study table with books on the right wall, a hanging bulb, a shirt on a line
    b.add(boxGeo(V(X1 - 0.75, 0.72, Z0 + 1.6), V(X1 - 0.1, 0.76, Z0 + 2.5)), VM.wood());
    for (const [x, z] of [[X1 - 0.7, Z0 + 1.65], [X1 - 0.15, Z0 + 1.65], [X1 - 0.7, Z0 + 2.45], [X1 - 0.15, Z0 + 2.45]]) b.add(boxGeo(V(x - 0.03, 0, z - 0.03), V(x + 0.03, 0.72, z + 0.03)), VM.wood());
    for (let i = 0; i < 4; i++) b.add(boxGeo(V(X1 - 0.6, 0.76 + i * 0.04, Z0 + 1.8), V(X1 - 0.3, 0.8 + i * 0.04, Z0 + 2.2)), lam("t_book" + i, () => ({ color: ["#3f6fb5", "#c0353a", "#2f6a43", "#d9a93a"][i] })));
    sb.add(rodGeo(V(mx, H, mz - 0.2), V(mx, H - 0.45, mz - 0.2), 0.006, 0.006, 4), TM.wire());
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2.1) }));
    bulb.position.set(mx, H - 0.5, mz - 0.2); bulb.layers.set(NOINK); root.add(bulb);
    sb.add(rodGeo(V(X0 + 0.05, 2.1, Z0 + 0.4), V(X0 + 0.05, 2.1, Z0 + 2.4), 0.005, 0.005, 4), lam("v_rope", () => ({ color: "#b8a27a" })));
    b.add(quad(V(X0 + 0.07, 1.5, Z0 + 1.0), V(X0 + 0.07, 1.5, Z0 + 1.6), V(X0 + 0.07, 2.08, Z0 + 1.6), V(X0 + 0.07, 2.08, Z0 + 1.0)), lam("t_shirt", () => ({ color: "#e6e1d6", side: THREE.DoubleSide })));
    // the floor above + outer walls (no shadows: the sun has to reach into the open room)
    const ob = new Batch();
    ob.add(boxGeo(V(X0 - 0.25, H, Z0 - 0.25), V(X1 + 0.25, H + 3.1, Z1 + 0.25), 0, true), TM.side("#9fc4b8"));
    for (const [a, c] of [[V(X0 - 0.25, 0, Z1 + 0.25), V(X0 - 0.25, 0, Z0 - 0.25)], [V(X0 - 0.25, 0, Z0 - 0.25), V(X1 + 0.25, 0, Z0 - 0.25)], [V(X1 + 0.25, 0, Z0 - 0.25), V(X1 + 0.25, 0, Z1 + 0.25)]] as const)
      ob.add(quad(c, a, V(a.x, H, a.z), V(c.x, H, c.z)), TM.side("#9fc4b8"));
    sb.build(root, false); ob.build(root, false);
  }
  // ---- the rooftop block (ROOF = its roof, y 11): parapet, water tanks on stands, stair room, washing line, plant tubs ----
  {
    const [rx, ry, rz] = ROOF, x0 = rx - 6.5, x1 = rx + 7, z0 = rz - 8, z1 = rz + 8;
    tBlock(b, x0, x1, z0, z1, ry, "+z", "#e6e1d6", false, "#000000", false);
    for (const [tx, tz] of [[rx + 4.5, rz - 4.5], [rx - 3.5, rz - 5]]) {
      b.add(boxGeo(V(tx - 0.7, ry, tz - 0.7), V(tx + 0.7, ry + 0.5, tz + 0.7)), TM.side("#b9b4aa"));
      b.add(new THREE.CylinderGeometry(0.65, 0.65, 1.3, 20).translate(tx, ry + 1.15, tz), TM.tank());
      b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12).translate(tx, ry + 1.86, tz), TM.tank());
    }
    b.add(boxGeo(V(x0 + 0.2, ry, z1 - 3.6), V(x0 + 3.4, ry + 2.5, z1 - 0.2), 2), TM.side("#e6e1d6"));
    b.add(quad(V(x0 + 3.41, ry, z1 - 2.6), V(x0 + 3.41, ry, z1 - 1.6), V(x0 + 3.41, ry + 2.0, z1 - 1.6), V(x0 + 3.41, ry + 2.0, z1 - 2.6)), VM.wood());
    const line0 = V(rx - 4.0, ry + 1.75, rz + 0.2), line1 = V(rx - 6.2, ry + 1.75, rz - 3.4); // left-behind her from the S17 cameras
    b.add(rodGeo(line0, line1, 0.006, 0.006, 4), lam("v_rope", () => ({ color: "#b8a27a" })));
    for (const [t0, t1, kind, col, hgt] of [[0.08, 0.3, "shirt", "#4f7fa8", 0.62], [0.34, 0.56, "shirt", "#e4ddd0", 0.62], [0.6, 0.95, "saree", "#b8504a", 1.15]] as const) {
      const p0 = line0.clone().lerp(line1, t0), p1 = line0.clone().lerp(line1, t1);
      b.add(quad(V(p0.x, p0.y - hgt, p0.z), V(p1.x, p1.y - hgt, p1.z), p1, p0), lam("t_wash" + kind + col, () => ({ map: kind === "shirt" ? shirtTex(col) : sareeTex(col), alphaTest: 0.5, side: THREE.DoubleSide })));
    }
    { // second line, to her right from the S17 lens (never across her), shirts on it; a plant tub at her left
      const l0 = V(rx + 1.0, ry + 1.85, rz - 0.6), l1 = V(rx - 0.4, ry + 1.85, rz - 2.6);
      b.add(rodGeo(l0, l1, 0.006, 0.006, 4), lam("v_rope", () => ({ color: "#b8a27a" })));
      for (const [t0, t1, col] of [[0.1, 0.4, "#d98a2e"], [0.5, 0.82, "#3f8a5a"]] as const) {
        const p0 = l0.clone().lerp(l1, t0), p1 = l0.clone().lerp(l1, t1);
        b.add(quad(V(p0.x, p0.y - 0.6, p0.z), V(p1.x, p1.y - 0.6, p1.z), p1, p0), lam("t_washshirt" + col, () => ({ map: shirtTex(col), alphaTest: 0.5, side: THREE.DoubleSide })));
      }
      b.add(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 12).translate(rx - 1.4, ry + 0.2, rz + 0.6), lam("t_tub", () => ({ color: "#b5603a" })));
      addVeg(tb, "bush", rx - 1.4, ry + 0.35, rz + 0.6, 0.95, 991, 1);
    }
    for (let i = 0; i < 4; i++) {
      const tx = x0 + 1 + i * 1.6, tz = z0 + 0.8;
      b.add(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 12).translate(tx, ry + 0.2, tz), lam("t_tub", () => ({ color: "#b5603a" })));
      addVeg(tb, "bush", tx, ry + 0.35, tz, 0.9, i * 77, 1);
    }
  }
  // ---- medical college: boundary wall with railings along z 108, gate pillars + arch at MED_GATE, a red-brick block, lawn trees ----
  {
    const [gx, , gz] = MED_GATE, brickM = lam("t_mcBrick", () => ({ map: rep(brick(), 2, 2) })), white = lam("t_white", () => ({ color: "#f1ede4" }));
    for (const [a, c] of [[150, gx - 2.4], [gx + 2.4, 187]]) {
      b.add(boxGeo(V(a, 0, gz - 0.2), V(c, 1.2, gz + 0.2), 1), brickM);
      for (let x = a; x < c; x += 0.5) b.add(rodGeo(V(x, 1.2, gz), V(x, 2.2, gz), 0.015, 0.015, 4), TM.wire());
      b.add(rodGeo(V(a, 2.2, gz), V(c, 2.2, gz), 0.02, 0.02, 4), TM.wire());
    }
    for (const s of [-1, 1]) { b.add(boxGeo(V(gx + s * 2.4 - 0.45, 0, gz - 0.5), V(gx + s * 2.4 + 0.45, 4.6, gz + 0.5), 1), white); b.add(boxGeo(V(gx + s * 2.4 - 0.58, 4.6, gz - 0.62), V(gx + s * 2.4 + 0.58, 4.85, gz + 0.62)), lam("t_capRed", () => ({ color: "#b5543c" }))); }
    b.add(boxGeo(V(gx - 2.9, 3.7, gz - 0.3), V(gx + 2.9, 4.4, gz + 0.3)), white);
    b.add(quad(V(gx - 1.95, 3.75, gz + 0.31), V(gx + 1.95, 3.75, gz + 0.31), V(gx + 1.95, 4.35, gz + 0.31), V(gx - 1.95, 4.35, gz + 0.31)), lam("t_mcSign", () => ({ map: ctex("t_mcSignT", 512, 48, (g) => {
      g.fillStyle = "#2f6a43"; g.fillRect(0, 0, 512, 48); g.fillStyle = "#c0353a"; g.beginPath(); g.arc(30, 24, 16, 0, vTAU); g.fill();
      g.fillStyle = "#f6f2e6"; g.fillRect(64, 14, 380, 6); g.fillRect(64, 28, 300, 6);
    }) })));
    b.add(boxGeo(V(gx + 3.6, 0, gz - 2.4), V(gx + 5.2, 2.4, gz - 0.8), 1), white); // guard booth (inside the wall)
    const mcFacade = lam("t_mcFacade", () => ({ map: townFacade("mc", 30, 12, "#b5543c", false, "#000000") }));
    b.add(boxGeo(V(155, 0, 86), V(185, 12, 96), 0, false), TM.side("#b5543c"));
    b.add(quad(V(155, 0, 96.02), V(185, 0, 96.02), V(185, 12, 96.02), V(155, 12, 96.02)), mcFacade);
    for (let i = 0; i < 4; i++) b.add(boxGeo(V(155, 2.9 * i + 2.7, 96), V(185, 2.9 * i + 2.9, 96.25)), white);
    fl.add(flatUp(gx - 1.9, gx + 1.9, 96, gz, 0.02, 3), TM.brickPave());
    for (let i = 0; i < 16; i++) { const x = 152 + r() * 34, z = 98 + r() * 9; if (Math.abs(x - gx) > 4) addVeg(tb, r() < 0.5 ? "round" : "fat", x, 0, z, 7 + r() * 3, x * 13 + z, 1); }
  }
  // ---- background blocks for the skyline (away from the street, the lanes and the campus) ----
  for (let i = 0; i < 160; i++) {
    const x = SX + (r() < 0.5 ? -1 : 1) * (16 + r() * 90), z = -40 + r() * 230, w = 6 + r() * 7, d = 6 + r() * 7, h = [6, 9, 12, 15, 18, 22][Math.floor(r() * 6) % 6];
    const near = (cx: number, cz: number, R: number) => Math.abs(x - cx) < R + w && Math.abs(z - cz) < R + d;
    if (near(MESS[0], MESS[2], 6) || near(ROOF[0], ROOF[2], 9) || near(170, 100, 22) || near(185, 74, 6) || (x > 150 && x < 188 && z > 80 && z < 125)) continue;
    tBlock(b, x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, x < SX ? "+x" : "-x", T_WALLS[i % T_WALLS.length], false, "#000000", r() < 0.6);
  }
  // ---- street furniture: trees on both footpaths, poles + wires, rickshaws, a CNG ----
  for (let z = -30; z < 200; z += 7 + r() * 3) for (const x of [W0 + 0.7, E1 - 0.7]) {
    if ((z > 66 && z < 81 && x < SX) || (z > 106 && z < 123 && x < SX) || (z > 38 && z < 47 && x > SX)) continue;
    const h = 7 + r() * 3, rad = 0.44 * h;
    if (!inTheWay(x - rad, x + rad, 0, h, z - rad, z + rad, false)) addVeg(tb, r() < 0.5 ? "fat" : "round", x, 0.15, z, h, x * 31 + z * 7, 1);
  }
  polesAlong(b, E1 - 0.25, -30, 200, 26);
  polesAlong(b, W0 + 0.25, -17, 200, 26);
  for (let z = -17; z < 200; z += 26) crossWire(b, W0 + 0.25, E1 - 0.25, z, z + 13);
  for (const [x, z, yaw, k] of [[W1 + 0.8, 18, 0.1, 0], [W1 + 0.9, 31, -0.2, 1], [E0 - 1.0, 24, Math.PI + 0.15, 2], [E0 - 0.9, 52, Math.PI, 3], [W1 + 1.0, 60, 0, 1], [E0 - 1.1, 88, Math.PI - 0.1, 0], [178, 75.5, Math.PI / 2, 2], [E0 - 1.2, 115, Math.PI, 3]] as const) rickshaw(b, x, z, yaw, k);
  cng(b, E0 - 1.3, 36, Math.PI);
  for (const [x, z, yaw, k] of [[W1 + 0.9, 84, 0.15, 2], [E0 - 1.0, 79, Math.PI - 0.2, 1], [W1 + 1.0, 96.5, -0.1, 3], [E0 - 0.9, 40.5, Math.PI + 0.1, 0], [W1 + 0.8, 46, 0.05, 2], [E0 - 1.1, 101, Math.PI, 1], [W1 + 0.9, 108, 0.2, 0], [E0 - 1.0, 29, Math.PI, 3]] as const) rickshaw(b, x, z, yaw, k);
  b.build(root);
  const flat = new THREE.Group(); fl.build(flat, false); flat.traverse((o) => o.layers.set(NOINK)); root.add(flat);
  const trees = new THREE.Group(); trees.name = "trees"; tb.build(trees); root.add(trees);
  sight = [];
};

// ---------------- the peg, the umbrella, the pucca house ----------------
// The peg sticks out of the front wall right of the door at (1.1, 1.25) on both houses: a bamboo peg (node ring, a notch
// near the tip where a hook sits, rounded end), warm matcap so the night grade never turns it blue-grey.
const PEG_A = () => V(HUT[0] + 1.1, 1.25, HUT[2] + HUT_Z - 0.06), PEG_B = () => V(HUT[0] + 1.1, 1.31, HUT[2] + HUT_Z + 0.27);
const pegAt = (t: number) => PEG_A().lerp(PEG_B(), t);
const buildPeg = (b: Batch) => {
  const a = PEG_A(), c = PEG_B(), d = c.clone().sub(a), L = d.length(), R = 0.023;
  // profile along the peg (y = 0 at the wall end): shaft, a node ring, the shaft again, a V notch, a rounded tip
  const prof: [number, number][] = [[0.0001, 0], [R, 0], [R, 0.12 * L], [R * 1.18, 0.15 * L], [R, 0.18 * L], [R * 0.97, 0.78 * L], [R * 0.55, 0.83 * L], [R * 0.97, 0.88 * L]];
  for (let i = 1; i <= 6; i++) { const a2 = (i / 6) * (Math.PI / 2); prof.push([R * 0.97 * Math.cos(a2) + 0.0001, 0.88 * L + (0.12 * L) * Math.sin(a2)]); }
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)));
  b.add(g, pegMat());
};
/** a closed black umbrella hanging by its J handle from the peg's notch (the callback in the rain finale) */
const buildUmbrella = (b: Batch) => {
  const n = pegAt(0.83), hook = 0.034, wood = lam("v_umbHandle", () => ({ color: "#6b4226" })), cloth = lam("v_umbCloth", () => ({ color: "#20232c" }));
  b.add(new THREE.TorusGeometry(hook, 0.01, 8, 18, Math.PI).translate(n.x, n.y + 0.012, n.z), wood); // the hook over the notch
  const top = V(n.x - hook, n.y + 0.012, n.z), sh = V(n.x - hook, n.y - 0.11, n.z);
  b.add(rodGeo(top, sh, 0.01, 0.01, 8), wood);
  // folded canopy: a slim lathe from the handle down to the ferrule (tip just above the plinth)
  const H = 0.62, prof: [number, number][] = [[0.0001, 0], [0.012, 0.01], [0.03, 0.06], [0.05, 0.2], [0.055, 0.32], [0.045, 0.48], [0.02, 0.6], [0.006, H]];
  const can = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, -y)), 18).translate(sh.x, sh.y, sh.z);
  b.add(can, cloth);
  b.add(new THREE.TorusGeometry(0.052, 0.008, 6, 18).rotateX(Math.PI / 2).translate(sh.x, sh.y - 0.3, sh.z), lam("v_umbStrap", () => ({ color: "#3a3f4c" })));
  b.add(rodGeo(V(sh.x, sh.y - H, sh.z), V(sh.x, sh.y - H - 0.05, sh.z), 0.005, 0.004, 6), lam("v_umbTip", () => ({ color: "#9aa0a8" })));
};
/** plastered brick wall, painted: cream with a grey-green skirting, faint damp marks (2 m x 2.8 m tile) */
const puccaWallTex = () => ctex("v_puccaWall", 512, 717, (g, r) => {
  g.fillStyle = "#ead9b6"; g.fillRect(0, 0, 512, 717);
  for (let i = 0; i < 18; i++) wrapAt(512, 717, r() * 512, r() * 717, 80, (x, y) => ell(g, x, y, 30 + r() * 60, 20 + r() * 40, "rgba(160,140,110,0.08)"));
  g.fillStyle = "#8fa592"; g.fillRect(0, 640, 512, 77);
  g.fillStyle = "rgba(60,70,60,0.35)"; g.fillRect(0, 636, 512, 5);
});
/** the rebuilt pucca house on the same footprint: plastered brick on a concrete plinth, flat roof slab with a parapet,
 *  a veranda slab on two square columns, a wooden door frame, a window with a blue frame and white grill */
const buildPucca = (b: Batch, glow: THREE.Material) => {
  const m = new THREE.Matrix4().makeTranslation(HUT[0], HUT[1], HUT[2]), add = (g: THREE.BufferGeometry, mat: THREE.Material) => b.add(g, mat, m);
  const conc = lam("v_puccaConcrete", () => ({ color: "#c9c2b4" })), wall = warmLam("v_puccaWallM", { map: puccaWallTex(), emissive: "#2a2014" }), trim = lam("v_puccaTrim", () => ({ color: "#f3ede2" }));
  const blue = lam("v_puccaBlue", () => ({ color: "#2f6f9a" })), door = lam("v_puccaDoor", () => ({ color: "#6b4226" })), WT = 3.05;
  add(boxGeo(V(-3.6, -0.05, -2.9), V(3.6, PLY, 3.4), 2), conc);
  const w = (ax: number, az: number, bx: number, bz: number, len: number) => add(quad(V(ax, PLY, az), V(bx, PLY, bz), V(bx, WT, bz), V(ax, WT, az), len / 2, 1), wall);
  w(-HUT_X, HUT_Z, HUT_X, HUT_Z, 6); w(HUT_X, -HUT_Z, -HUT_X, -HUT_Z, 6); w(-HUT_X, -HUT_Z, -HUT_X, HUT_Z, 4.6); w(HUT_X, HUT_Z, HUT_X, -HUT_Z, 4.6);
  // roof slab + parapet, cornice band
  add(boxGeo(V(-3.25, WT, -2.55), V(3.25, WT + 0.2, 2.55), 2, true), conc);
  for (const [x0, x1, z0, z1] of [[-3.25, 3.25, -2.55, -2.4], [-3.25, 3.25, 2.4, 2.55], [-3.25, -3.1, -2.55, 2.55], [3.1, 3.25, -2.55, 2.55]]) add(boxGeo(V(x0, WT + 0.2, z0), V(x1, WT + 0.75, z1)), trim);
  add(boxGeo(V(-3.08, WT - 0.18, HUT_Z), V(3.08, WT - 0.05, HUT_Z + 0.08)), trim);
  // veranda slab on two square columns
  add(boxGeo(V(-3.6, 2.82, HUT_Z), V(3.6, 2.97, 3.45), 2, true), conc);
  for (const sx of [-1, 1]) add(boxGeo(V(sx * 3.32 - 0.13, PLY, 3.07), V(sx * 3.32 + 0.13, 2.82, 3.33)), trim);
  // door: lit opening (same glow as the hut), wooden frame, one leaf open against the wall
  const fz = HUT_Z + 0.012, dx0 = -0.65, dx1 = 0.25, dTop = 2.25;
  add(quad(V(dx0, PLY, fz), V(dx1, PLY, fz), V(dx1, dTop, fz), V(dx0, dTop, fz)), glow);
  for (const [x0, x1] of [[dx0 - 0.1, dx0], [dx1, dx1 + 0.1]]) add(boxGeo(V(x0, PLY, HUT_Z), V(x1, dTop + 0.1, HUT_Z + 0.07)), door);
  add(boxGeo(V(dx0 - 0.1, dTop, HUT_Z), V(dx1 + 0.1, dTop + 0.1, HUT_Z + 0.07)), door);
  const hinge = V(dx0 - 0.05, 0, HUT_Z + 0.07), open = deg(15), tip = V(hinge.x - 0.88 * Math.cos(open), 0, hinge.z + 0.88 * Math.sin(open));
  add(new THREE.BoxGeometry(0.88, dTop - PLY - 0.06, 0.04).applyMatrix4(new THREE.Matrix4().compose(V((hinge.x + tip.x) / 2, (PLY + dTop) / 2, (hinge.z + tip.z) / 2), yawQ(-open), V(1, 1, 1))), door);
  // window: lit opening, blue frame, white grill, blue shutters open
  const wx0 = 1.85, wx1 = 2.55, wy0 = 1.3, wy1 = 1.95;
  add(quad(V(wx0, wy0, fz), V(wx1, wy0, fz), V(wx1, wy1, fz), V(wx0, wy1, fz)), glow);
  for (const [x0, x1, y0, y1] of [[wx0 - 0.07, wx0, wy0 - 0.07, wy1 + 0.07], [wx1, wx1 + 0.07, wy0 - 0.07, wy1 + 0.07], [wx0, wx1, wy0 - 0.07, wy0], [wx0, wx1, wy1, wy1 + 0.07]]) add(boxGeo(V(x0, y0, HUT_Z), V(x1, y1, HUT_Z + 0.06)), blue);
  for (let i = 1; i < 5; i++) add(rodGeo(V(wx0 + ((wx1 - wx0) * i) / 5, wy0, HUT_Z + 0.04), V(wx0 + ((wx1 - wx0) * i) / 5, wy1, HUT_Z + 0.04), 0.008), trim);
  add(rodGeo(V(wx0, (wy0 + wy1) / 2, HUT_Z + 0.04), V(wx1, (wy0 + wy1) / 2, HUT_Z + 0.04), 0.008), trim);
  add(boxGeo(V(wx1 + 0.07, wy0, HUT_Z + 0.06), V(wx1 + 0.1, wy1, HUT_Z + 0.42)), blue);
  add(boxGeo(V(wx0 - 0.1, wy0, HUT_Z + 0.06), V(wx0 - 0.07, wy1, HUT_Z + 0.42)), blue);
  add(boxGeo(V(wx0 - 0.12, wy0 - 0.12, HUT_Z), V(wx1 + 0.12, wy0 - 0.07, HUT_Z + 0.16)), trim); // sill
};

// ---------------- town signage helpers ----------------
/** Bangla-like letter shapes (a matra headline with hanging glyph strokes, loops and hooks): reads as Bangla signage,
 *  spells nothing (the video carries no readable text) */
const banglaish = (g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, w: number, h: number, col: string) => {
  g.strokeStyle = col; g.fillStyle = col; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = Math.max(2, h * 0.12);
  let x = x0;
  while (x < x0 + w - h * 0.6) {
    const n = 2 + Math.floor(r() * 4), wordW = n * h * 0.62;
    if (x + wordW > x0 + w) break;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + wordW, y0); g.stroke(); // matra
    for (let i = 0; i < n; i++) {
      const gx = x + i * h * 0.62 + h * 0.08, k = Math.floor(r() * 5);
      g.beginPath();
      if (k === 0) { g.moveTo(gx + h * 0.42, y0); g.lineTo(gx + h * 0.42, y0 + h * 0.85); g.moveTo(gx + h * 0.42, y0 + h * 0.3); g.arc(gx + h * 0.2, y0 + h * 0.48, h * 0.2, -0.3, Math.PI * 1.6); }
      else if (k === 1) { g.arc(gx + h * 0.24, y0 + h * 0.55, h * 0.22, Math.PI * 1.5, Math.PI * 3.3); g.moveTo(gx + h * 0.46, y0); g.lineTo(gx + h * 0.46, y0 + h * 0.8); }
      else if (k === 2) { g.moveTo(gx + h * 0.05, y0); g.quadraticCurveTo(gx + h * 0.05, y0 + h * 0.7, gx + h * 0.3, y0 + h * 0.72); g.quadraticCurveTo(gx + h * 0.52, y0 + h * 0.7, gx + h * 0.48, y0 + h * 0.4); }
      else if (k === 3) { g.moveTo(gx + h * 0.4, y0); g.lineTo(gx + h * 0.4, y0 + h * 0.85); g.moveTo(gx + h * 0.4, y0 + h * 0.45); g.lineTo(gx + h * 0.08, y0 + h * 0.62); g.arc(gx + h * 0.12, y0 + h * 0.4, h * 0.1, Math.PI * 0.5, Math.PI * 2.2); }
      else { g.arc(gx + h * 0.25, y0 + h * 0.42, h * 0.2, Math.PI, Math.PI * 2.8); g.moveTo(gx + h * 0.25, y0 + h * 0.62); g.lineTo(gx + h * 0.3, y0 + h * 0.88); }
      g.stroke();
    }
    x += wordW + h * 0.45;
  }
};
const awningTex = (col: string) => ctex("t_awn" + col, 128, 128, (g) => {
  for (let x = 0; x < 128; x += 32) { g.fillStyle = col; g.fillRect(x, 0, 16, 128); g.fillStyle = "#e9e3d4"; g.fillRect(x + 16, 0, 16, 128); }
  g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 112, 128, 16);
});
/** a hanging blade signboard: coloured board, pale border, two lines of Bangla-like shapes, a small emblem */
const bladeTex = (col: string) => ctex("t_bladeT" + col, 256, 224, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 256, 224);
  g.strokeStyle = "rgba(255,248,228,0.85)"; g.lineWidth = 8; g.strokeRect(8, 8, 240, 208);
  g.fillStyle = "rgba(255,248,228,0.9)"; g.beginPath(); g.arc(128, 60, 26, 0, vTAU); g.fill();
  banglaish(g, r, 26, 116, 204, 38, "rgba(255,250,235,0.95)");
  banglaish(g, r, 46, 170, 164, 28, "rgba(255,250,235,0.8)");
});
/** wires across the street between the two pole lines, sagging */
const crossWire = (b: Batch, xa: number, xb: number, za: number, zb: number) => {
  const n = 8, pts: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) { const t = k / n; pts.push(V(xa + (xb - xa) * t, 7.9 - 0.7 * 4 * t * (1 - t), za + (zb - za) * t)); }
  for (let k = 0; k < n; k++) b.add(rodGeo(pts[k], pts[k + 1], 0.011, 0.011, 4), TM.wire());
};

// ---------------- washing on the rooftop line ----------------
/** a shirt hung by its shoulders (cut-out): body, sleeves, collar, buttons */
const shirtTex = (col: string) => ctex("t_shirtT" + col, 128, 128, (g) => {
  g.fillStyle = col;
  g.beginPath(); g.moveTo(34, 4); g.lineTo(94, 4); g.lineTo(126, 26); g.lineTo(112, 52); g.lineTo(96, 42); g.lineTo(96, 124); g.lineTo(32, 124); g.lineTo(32, 42); g.lineTo(16, 52); g.lineTo(2, 26); g.closePath(); g.fill();
  g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(62, 10, 3, 112); g.fillRect(32, 116, 64, 8);
  g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.moveTo(48, 4); g.lineTo(64, 16); g.lineTo(80, 4); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.8)"; for (let y = 30; y < 110; y += 20) { g.beginPath(); g.arc(70, y, 2.5, 0, vTAU); g.fill(); }
});
/** a saree folded over the line: long cloth with a wide border and a small motif, wavy hem (cut-out) */
const sareeTex = (col: string) => ctex("t_sareeT" + col, 256, 256, (g) => {
  g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 0);
  for (let x = 256; x >= 0; x -= 16) g.lineTo(x, 236 + Math.sin(x * 0.09) * 10); g.closePath(); g.fill();
  g.fillStyle = "#e2b04a"; g.fillRect(0, 196, 256, 22); g.fillStyle = "#2f5a3e"; g.fillRect(0, 186, 256, 8);
  g.fillStyle = "rgba(255,240,210,0.5)"; for (let y = 30; y < 170; y += 34) for (let x = 20 + (y % 68 ? 17 : 0); x < 256; x += 34) { g.beginPath(); g.arc(x, y, 4, 0, vTAU); g.fill(); }
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 30; x < 256; x += 48) g.fillRect(x, 0, 6, 186); // folds
});

/** a soft shadow decal: a blurred dark ellipse, flat on the ground (flat = true) or upright on a wall facing +z */
const softShadow = (x: number, y: number, z: number, w: number, h: number, opacity: number, flat: boolean) => {
  const tex = ctex("v_softShadow", 128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.55, "rgba(0,0,0,0.6)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: "#1a1424", transparent: true, opacity, depthWrite: false }));
  if (flat) m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z); m.layers.set(NOINK); m.renderOrder = 1;
  return m;
};

/** well bricks: one red-brown, small per-brick variation, pale mortar (512 x 128 = 6 tiles around the ring) */
const wellBrickTex = () => ctex("v_wellBrickT", 512, 128, (g, r) => {
  g.fillStyle = "#c9b59c"; g.fillRect(0, 0, 512, 128);
  for (let row = 0; row < 8; row++) for (let x = (row % 2) * -24; x < 512; x += 48) { g.fillStyle = jit(r, "#9c4a33", 0.05, 2, 0.05); g.fillRect(x + 2, row * 16 + 2, 44, 12); }
});
/** the bank's signboard: dark blue, an emblem, two lines of Bangla-like shapes (no readable text) */
const bankSignTex = () => ctex("t_bankSignT", 640, 120, (g, r) => {
  g.fillStyle = "#1f3f6e"; g.fillRect(0, 0, 640, 120);
  g.strokeStyle = "#f2c14e"; g.lineWidth = 5; g.strokeRect(6, 6, 628, 108);
  g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(64, 60, 34, 0, vTAU); g.fill(); g.fillStyle = "#1f3f6e"; g.beginPath(); g.arc(64, 60, 18, 0, vTAU); g.fill();
  banglaish(g, r, 120, 30, 480, 40, "rgba(255,255,255,0.95)");
  banglaish(g, r, 160, 82, 380, 22, "rgba(242,193,78,0.9)");
});

// ======================================================================================================
// ROUND 7 SETS, each small and far from the rest, open toward its cameras (+z): the bangle stall at a village market
// (day), the computer shop of Rahat's night job, Rahat's engineering office (day) and the bedroom of the new house
// (night, rain on the window). Signboards carry Bangla-like shapes only (no readable text).
// ======================================================================================================
const r7 = rng(707);
const plainTex = (key: string, base: string, spots: string, n = 30) => ctex(key, 256, 256, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) wrapAt(256, 256, r() * 256, r() * 256, 60, (x, y) => ell(g, x, y, 20 + r() * 50, 14 + r() * 36, spots));
});
const tileTex = (key: string, a: string, b: string, n = 8) => ctex(key, 256, 256, (g, r) => {
  const t = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = jit(r, (i + j) % 2 ? a : b, 0.03); g.fillRect(i * t, j * t, t, t); }
  g.strokeStyle = "rgba(60,50,40,0.25)"; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(256, i * t); g.stroke(); }
});
/** a room shell (no shadows): floor, back wall, side walls, ceiling; the front (+z) open; a dark box round it */
const roomShell = (root: THREE.Object3D, o: V3, X: number, Zb: number, Zf: number, H: number, wall: THREE.Material, floor: THREE.Material, ceil = true) => {
  const sb = new Batch(), P = (x: number, y: number, z: number) => V(o[0] + x, y, o[2] + z);
  sb.add(quad(P(-X, 0, Zf), P(X, 0, Zf), P(X, 0, Zb), P(-X, 0, Zb), (2 * X) / 1.2, (Zf - Zb) / 1.2), floor);
  sb.add(quad(P(-X, 0, Zb), P(X, 0, Zb), P(X, H, Zb), P(-X, H, Zb), 1, 1), wall);
  sb.add(quad(P(-X, 0, Zf), P(-X, 0, Zb), P(-X, H, Zb), P(-X, H, Zf), 1, 1), wall);
  sb.add(quad(P(X, 0, Zb), P(X, 0, Zf), P(X, H, Zf), P(X, H, Zb), 1, 1), wall);
  if (ceil) sb.add(quad(P(-X, H, Zb), P(X, H, Zb), P(X, H, Zf), P(-X, H, Zf), 1, 1), wall);
  sb.build(root, false);
  const dark = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 16), new THREE.MeshBasicMaterial({ color: "#07060a", side: THREE.BackSide, fog: false }));
  dark.position.set(o[0], 3, o[2]); dark.layers.set(NOINK); root.add(dark);
};
/** a warm light source: an HDR card (bloom) and an additive halo, facing +z (all its cameras look from +z) */
const glow = (root: THREE.Object3D, x: number, y: number, z: number, w: number, halo: number, col = new THREE.Color(5, 3.4, 1.6), hcol = new THREE.Color(1.0, 0.62, 0.28), op = 0.32) => {
  const c = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 20), new THREE.MeshBasicMaterial({ color: col, fog: false }));
  c.position.set(x, y, z); c.layers.set(NOINK); root.add(c);
  const h = new THREE.Mesh(new THREE.PlaneGeometry(halo, halo), new THREE.MeshBasicMaterial({ map: haloTexV(), color: hcol, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  h.position.set(x, y, z + 0.01); h.layers.set(NOINK); h.renderOrder = 9; root.add(h);
};
const screenMat = (key: string, tex: () => THREE.Texture) => {
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: tex(), color: new THREE.Color(1.15, 1.15, 1.15) }); mats.set(key, m); }
  return m;
};

// ---- the bangle stall (village market, day) ----
const bangleRack = (b: Batch, x: number, y: number, z: number, col: string, n: number) => {
  const m = lam("x_glass" + col, () => ({ color: col, emissive: col, emissiveIntensity: 0.25 }));
  b.add(rodGeo(V(x, y, z), V(x, y + 0.04 + n * 0.014, z), 0.008), VM.bamboo());
  for (let i = 0; i < n; i++) b.add(new THREE.TorusGeometry(0.034, 0.006, 6, 18).rotateX(Math.PI / 2).translate(x, y + 0.02 + i * 0.014, z), m);
};
const buildStall = (root: THREE.Object3D) => {
  const b = new Batch(), sb = new Batch(), tb = new Batch(), [ox, , oz] = STALL, P = (x: number, y: number, z: number) => V(ox + x, y, oz + z);
  const box = (bb: Batch, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 0) => bb.add(boxGeo(P(x0, y0, z0), P(x1, y1, z1), tile, true), mat);
  sb.add(quad(P(-20, 0, 20), P(20, 0, 20), P(20, 0, -20), P(-20, 0, -20), 16, 16), lam("x_yard", () => ({ map: plainTex("x_yardT", "#bfa47a", "rgba(120,92,60,0.18)") })));
  const wood = lam("v_plankM", () => ({ map: plankTex() })), bam = VM.bamboo();
  // counter: plank box, a cloth on top
  box(b, wood, -0.75, 0.75, 0, 0.84, -0.25, 0.25, 0.6);
  box(b, lam("x_counterCloth", () => ({ color: "#8e4a3c" })), -0.78, 0.78, 0.84, 0.855, -0.28, 0.28);
  // posts, a sloping tin roof, a woven back wall
  for (const [x, z] of [[-0.9, 0.35], [0.9, 0.35], [-0.9, -1.0], [0.9, -1.0]]) b.add(rodGeo(P(x, 0, z), P(x, z > 0 ? 2.15 : 2.45, z), 0.04), bam);
  sb.add(quad(P(-1.1, 2.18, 0.55), P(1.1, 2.18, 0.55), P(1.1, 2.48, -1.15), P(-1.1, 2.48, -1.15), 1, 1), VM.tin()); // no shadow band across the counter
  sb.add(quad(P(-0.9, 0, -1.0), P(0.9, 0, -1.0), P(0.9, 2.4, -1.0), P(-0.9, 2.4, -1.0), 1.8, 2.4), VM.weave());
  // glass bangles: red and green stacks on the counter and on a pole with arms
  for (let i = 0; i < 4; i++) bangleRack(b, ox + 0.38 + i * 0.09, 0.855, oz - 0.12 + (i % 2) * 0.06, i % 2 ? "#2f8a4a" : "#c0353a", 9);
  b.add(rodGeo(P(0.62, 0.855, -0.18), P(0.62, 1.95, -0.18), 0.018), bam);
  for (const [y, s] of [[1.8, 1], [1.55, -1], [1.3, 1]] as const) {
    b.add(rodGeo(P(0.62, y, -0.18), P(0.62 + 0.28 * s, y, -0.18), 0.01), bam);
    for (let i = 0; i < 7; i++) b.add(new THREE.TorusGeometry(0.034, 0.006, 6, 18).translate(ox + 0.62 + s * (0.06 + i * 0.03), y - 0.034, oz - 0.18),
      lam("x_glass" + (i % 2 ? "#2f8a4a" : "#c0353a"), () => ({ color: i % 2 ? "#2f8a4a" : "#c0353a", emissive: i % 2 ? "#2f8a4a" : "#c0353a", emissiveIntensity: 0.25 })));
  }
  // a mirror and a cash tin on the counter, baskets by the post
  box(b, lam("x_mirror", () => ({ color: "#bcd0de" })), -0.65, -0.45, 0.855, 1.1, -0.2, -0.18);
  b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 18).translate(ox - 0.3, 0.885, oz - 0.12), steelMat());
  for (const [x, z] of [[-1.25, 0.1], [1.2, 0.4]]) b.add(new THREE.CylinderGeometry(0.22, 0.17, 0.26, 16, 1, true).translate(ox + x, 0.13, oz + z), lam("x_basket", () => ({ map: weaveTex(), side: THREE.DoubleSide })));
  // the market behind: tin shop fronts, a neighbouring stall, trees
  for (let i = 0; i < 6; i++) {
    const x0 = -9 + i * 3.2, h = 2.6 + r7() * 0.8, z = -5.5 - r7() * 1.2;
    sb.add(quad(P(x0, 0, z), P(x0 + 3, 0, z), P(x0 + 3, h, z), P(x0, h, z), 1.5, 1.2), i % 2 ? VM.tin() : lam("x_shopWall" + i, () => ({ color: ["#c8b296", "#b9c4b2", "#d3c1b9"][i % 3] })));
    sb.add(quad(P(x0 + 0.3, h - 0.05, z + 0.02), P(x0 + 2.7, h - 0.05, z + 0.02), P(x0 + 2.7, h + 0.55, z + 0.02), P(x0 + 0.3, h + 0.55, z + 0.02)), lam("x_mSign" + (i % 4), () => ({ map: marketSignTex(i % 4) })));
  }
  for (let i = 0; i < 9; i++) addVeg(tb, i % 3 ? "round" : "fat", ox - 12 + i * 3 + r7() * 1.5, 0, oz - 9 - r7() * 4, 5 + r7() * 3, 700 + i);
  for (let i = 0; i < 4; i++) addVeg(tb, "bush", ox - 3.5 + i * 2.4, 0, oz - 3.2, 0.8 + r7() * 0.4, 720 + i);
  sb.build(root, false); b.build(root, false); // the stall props cast no sun shadow: the pole arms threw a dark band across the counter close-up
  const trees = new THREE.Group(); tb.build(trees); root.add(trees);
};
const marketSignTex = (k: number) => ctex("x_mSignT" + k, 384, 96, (g, r) => {
  g.fillStyle = ["#2f6a43", "#c0353a", "#2f5f8a", "#d98a2e"][k]; g.fillRect(0, 0, 384, 96);
  banglaish(g, r, 20, 22, 344, 48, "rgba(255,250,235,0.92)");
});

// ---- the computer shop (Rahat's night job) ----
const shopScreenTex = () => ctex("x_shopScreen", 256, 192, (g) => {
  g.fillStyle = "#dfe9f5"; g.fillRect(0, 0, 256, 192);
  g.fillStyle = "#2f5f8a"; g.fillRect(0, 0, 256, 22);
  g.fillStyle = "#ffffff"; for (let i = 0; i < 6; i++) { g.fillRect(16, 34 + i * 24, 140, 14); g.fillStyle = "#9fb3c8"; g.fillRect(170, 34 + i * 24, 70, 14); g.fillStyle = "#ffffff"; }
  g.fillStyle = "#3f8a5a"; g.fillRect(170, 168, 70, 16);
});
const buildShop = (root: THREE.Object3D) => {
  const b = new Batch(), [ox, , oz] = SHOP, P = (x: number, y: number, z: number) => V(ox + x, y, oz + z);
  const box = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 0) => b.add(boxGeo(P(x0, y0, z0), P(x1, y1, z1), tile, true), mat);
  roomShell(root, SHOP, 1.6, -1.4, 1.2, 2.6, lam("x_shopWall", () => ({ map: plainTex("x_shopWallT", "#c9c2a8", "rgba(90,80,60,0.08)") })), lam("x_shopFloor", () => ({ map: tileTex("x_shopTile", "#b9b4aa", "#a9a39a") })));
  const wood = lam("x_counterWood", () => ({ color: "#6e4a30" })), dark = lam("x_plastic", () => ({ color: "#2b2e34" })), beige = lam("x_beige", () => ({ color: "#d8d2c2" }));
  box(wood, -0.75, 0.75, 0, 0.8, -0.25, 0.08);                                   // counter
  box(lam("x_counterTop", () => ({ color: "#8a6240" })), -0.78, 0.78, 0.8, 0.83, -0.28, 0.11);
  // monitor (angled to the lens), keyboard, the CPU, a printer
  const mon = new THREE.Group(); mon.position.copy(P(-0.28, 0.83, -0.12)); mon.rotation.y = 0.3; root.add(mon);
  const mb = new Batch();
  mb.add(boxGeo(V(-0.04, 0, -0.06), V(0.04, 0.12, -0.02)), dark); mb.add(boxGeo(V(-0.24, 0.1, -0.06), V(0.24, 0.42, -0.02)), dark);
  mb.add(quad(V(-0.22, 0.12, -0.015), V(0.22, 0.12, -0.015), V(0.22, 0.4, -0.015), V(-0.22, 0.4, -0.015)), screenMat("x_shopScr", shopScreenTex));
  mb.build(mon, true);
  box(beige, -0.2, 0.18, 0.83, 0.85, -0.02, 0.1); // keyboard
  box(dark, 0.5, 0.72, 0, 0.45, -0.22, 0.05);      // CPU under the counter end
  box(beige, 0.28, 0.6, 0.83, 0.97, -0.2, 0.02);   // printer
  // desk lamp: base, arm, shade, warm bulb
  const lx = 0.62, lz = -0.02, tin = lam("x_lampTin", () => ({ color: "#3a5a4a" }));
  b.add(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16).translate(ox + lx, 0.84, oz + lz), tin);
  b.add(rodGeo(P(lx, 0.84, lz), P(lx - 0.05, 1.12, lz), 0.008), tin);
  b.add(new THREE.ConeGeometry(0.08, 0.1, 18, 1, true).translate(ox + lx - 0.08, 1.12, oz + lz), lam("x_shade", () => ({ color: "#3a5a4a", side: THREE.DoubleSide })));
  glow(root, ox + lx - 0.08, 1.075, oz + lz + 0.02, 0.035, 0.8);
  // shelves of boxed parts, a signboard (shapes only), a calendar
  for (const y of [1.1, 1.55, 2.0]) {
    box(wood, -1.3, 1.3, y, y + 0.03, -1.38, -1.1);
    for (let i = 0; i < 9; i++) { const w = 0.14 + r7() * 0.12, x = -1.25 + i * 0.28; box(lam("x_carton" + (i % 5), () => ({ color: ["#c9a46a", "#5f7fa8", "#d8d2c2", "#a8483c", "#3f6b55"][i % 5] })), x, x + w, y + 0.03, y + 0.12 + r7() * 0.2, -1.36, -1.16); }
  }
  b.add(quad(P(-1.0, 2.15, -1.39), P(1.0, 2.15, -1.39), P(1.0, 2.5, -1.39), P(-1.0, 2.5, -1.39)), lam("x_shopSign", () => ({ map: marketSignTex(2) })));
  b.build(root, true);
  glow(root, ox, 2.55, oz - 0.3, 0.12, 1.4, new THREE.Color(3.2, 3.1, 2.7), new THREE.Color(0.7, 0.7, 0.62), 0.18); // tube light
  glow(root, ox - 0.28 + 0.08, 1.09, oz - 0.08, 0.001, 0.9, new THREE.Color(1, 1, 1), new THREE.Color(0.35, 0.5, 0.75), 0.25); // screen glow
};

// ---- Rahat's office (day): CAD screen, drawings, a gear, a piston, a safety helmet, a lathe ----
const cadTex = () => ctex("x_cad", 320, 240, (g) => {
  g.fillStyle = "#1d2733"; g.fillRect(0, 0, 320, 240);
  g.fillStyle = "#2c3a4a"; g.fillRect(0, 0, 320, 18); g.fillRect(0, 18, 26, 222);
  for (let i = 0; i < 7; i++) { g.fillStyle = "#56708c"; g.fillRect(6, 26 + i * 26, 14, 14); }
  const cx = 168, cy = 128, R = 70, n = 14;
  g.strokeStyle = "#9fe0ff"; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i <= n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2, rr = i % 4 < 2 ? R : R - 12; const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.setLineDash([6, 4]); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#ffd36a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - R, cy + R + 14); g.lineTo(cx + R, cy + R + 14); g.moveTo(cx - R, cy + R + 8); g.lineTo(cx - R, cy + R + 20); g.moveTo(cx + R, cy + R + 8); g.lineTo(cx + R, cy + R + 20); g.stroke();
  g.strokeStyle = "rgba(159,224,255,0.25)"; g.lineWidth = 1; for (let x = 30; x < 320; x += 20) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 240); g.stroke(); }
  g.fillStyle = "#56708c"; g.fillRect(260, 30, 52, 90);
});
const drawingsTex = () => ctex("x_drawings", 128, 128, (g) => {
  g.fillStyle = "#e9eef3"; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#3f6fb5"; g.lineWidth = 2; g.strokeRect(10, 10, 108, 108); g.beginPath(); g.arc(64, 60, 28, 0, Math.PI * 2); g.stroke(); g.strokeRect(80, 96, 34, 18);
});
const buildOffice = (root: THREE.Object3D) => {
  const b = new Batch(), [ox, , oz] = OFFICE, P = (x: number, y: number, z: number) => V(ox + x, y, oz + z);
  const box = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 0) => b.add(boxGeo(P(x0, y0, z0), P(x1, y1, z1), tile, true), mat);
  roomShell(root, OFFICE, 2.2, -2.1, 1.6, 2.9, lam("x_offWall", () => ({ map: plainTex("x_offWallT", "#dfe3e2", "rgba(90,100,100,0.06)") })), lam("x_offFloor", () => ({ map: tileTex("x_offTile", "#b8bcbf", "#aeb3b6", 4) })));
  // window on the back wall (bright day outside) with its bars
  b.add(quad(P(-1.9, 1.1, -2.09), P(-0.7, 1.1, -2.09), P(-0.7, 2.3, -2.09), P(-1.9, 2.3, -2.09)), screenMat("x_offSky", () => ctex("x_offSkyT", 64, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "#9cc6ea"); gr.addColorStop(1, "#e6f0f6"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })));
  for (let i = 0; i <= 3; i++) box(lam("x_frame", () => ({ color: "#f0f0ea" })), -1.92 + i * 0.4, -1.88 + i * 0.4, 1.1, 2.3, -2.08, -2.04);
  // desk and chair
  const desk = lam("x_desk", () => ({ color: "#b98a5a" })), metal = lam("x_deskLeg", () => ({ color: "#4a4f57" })), dark = lam("x_plastic", () => ({ color: "#2b2e34" }));
  box(desk, -0.72, 0.72, 0.72, 0.76, -0.38, 0.36);
  for (const [x, z] of [[-0.68, -0.33], [0.68, -0.33], [-0.68, 0.31], [0.68, 0.31]]) box(metal, x - 0.02, x + 0.02, 0, 0.72, z - 0.02, z + 0.02);
  box(dark, -0.05, 0.35, 0.42, 0.47, -0.78, -0.42); box(dark, -0.03, 0.33, 0.47, 0.95, -0.82, -0.76); // chair
  // monitor angled to the lens, the gear drawing on it; keyboard, mouse
  const mon = new THREE.Group(); mon.position.copy(P(-0.32, 0.76, -0.16)); mon.rotation.y = 0.45; root.add(mon);
  const mb = new Batch();
  mb.add(boxGeo(V(-0.05, 0, -0.08), V(0.05, 0.14, -0.03)), dark); mb.add(boxGeo(V(-0.3, 0.12, -0.07), V(0.3, 0.5, -0.03)), dark);
  mb.add(quad(V(-0.28, 0.14, -0.025), V(0.28, 0.14, -0.025), V(0.28, 0.48, -0.025), V(-0.28, 0.48, -0.025)), screenMat("x_cadScr", cadTex));
  mb.build(mon, true);
  box(lam("x_kb", () => ({ color: "#3a3d44" })), -0.15, 0.25, 0.76, 0.78, 0.0, 0.13);
  box(dark, 0.32, 0.38, 0.76, 0.785, 0.04, 0.12);
  // drawings: a paper stack and rolled sheets
  box(lam("x_drw", () => ({ map: drawingsTex() })), -0.7, -0.42, 0.76, 0.82, -0.36, -0.12); // behind the monitor, clear of him
  for (let i = 0; i < 3; i++) b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 12).rotateZ(Math.PI / 2).translate(ox - 0.5, 0.85 + i * 0.045, oz - 0.3 + i * 0.03), lam("x_roll", () => ({ color: "#e4e8ec" })));
  // machine parts on the desk: a small gear and a piston; the safety helmet
  const gx = 0.18, gz = 0.24;
  b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 24).translate(ox + gx, 0.771, oz + gz), steelMat());
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add(new THREE.BoxGeometry(0.016, 0.022, 0.014).rotateY(-a).translate(ox + gx + 0.056 * Math.cos(a), 0.771, oz + gz + 0.056 * Math.sin(a)), steelMat()); }
  // (the piston is in his hands: the caliper close-up)
  b.add(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(ox + 0.55, 0.77, oz + 0.12), lam("x_helmet", () => ({ color: "#f2c230" })));
  b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24).translate(ox + 0.55, 0.775, oz + 0.12), lam("x_helmet", () => ({ color: "#f2c230" })));
  // the lathe behind him, painted machine green
  const mg = lam("x_machine", () => ({ color: "#3f6b55" }));
  box(mg, -1.9, -1.7, 0, 0.82, -1.75, -1.4); box(mg, -0.7, -0.5, 0, 0.82, -1.75, -1.4);
  box(mg, -1.95, -0.45, 0.82, 0.98, -1.78, -1.37);
  box(mg, -1.95, -1.55, 0.98, 1.38, -1.8, -1.35);
  b.add(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 20).rotateZ(Math.PI / 2).translate(ox - 1.48, 1.16, oz - 1.57), steelMat());
  box(mg, -0.8, -0.55, 0.98, 1.16, -1.7, -1.45);
  b.add(rodGeo(P(-1.42, 1.16, -1.57), P(-0.8, 1.07, -1.57), 0.02), steelMat());
  box(lam("x_cabinet", () => ({ color: "#9aa3a8" })), 1.4, 2.1, 0, 1.3, -2.05, -1.55);
  b.build(root, true);
};

// ---- the bedroom of the new house (night, rain on the window, a low warm lamp) ----
// The bed runs along the back wall, head at the left (x -1.05); she lies on her side facing the room, the quilt pulled to
// her chest; the bedside table and lamp at the head end; the window with blue shutters above the bed. Warm emissive lift on
// walls, floor and linen so the lamp grade reads warm cream, not lavender.
const buildBedroom = (root: THREE.Object3D) => {
  const b = new Batch(), sb = new Batch(), [ox, , oz] = BEDROOM, P = (x: number, y: number, z: number) => V(ox + x, y, oz + z);
  const box = (bb: Batch, mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 0) => bb.add(boxGeo(P(x0, y0, z0), P(x1, y1, z1), tile, true), mat);
  roomShell(root, BEDROOM, 2.4, -1.25, 3.2, 2.8, warmLam("x_plaster2", { map: plainTex("x_plasterT", "#efe2c6", "rgba(150,120,80,0.06)"), emissive: "#6a4a26" }),
    warmLam("x_bedFloor3", { map: tileTex("x_bedTile", "#c9b9a0", "#bfae94", 6), emissive: "#6a4a26" }));
  // window above the bed: the rainy night, a white frame and grill, blue shutters open to the sides
  sb.add(quad(P(0.15, 1.15, -1.24), P(0.85, 1.15, -1.24), P(0.85, 1.9, -1.24), P(0.15, 1.9, -1.24)), screenMat("x_night", () => ctex("x_nightT", 64, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "#1a2740"); gr.addColorStop(1, "#2c3d5a"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })));
  const frame = warmLam("x_winFrame2", { color: "#f2efe6", emissive: "#3a3022" }), shutter = lam("x_shutter", () => ({ map: shutterTex() }));
  box(b, frame, 0.11, 0.89, 1.11, 1.15, -1.25, -1.17); box(b, frame, 0.11, 0.89, 1.9, 1.94, -1.25, -1.17);
  box(b, frame, 0.11, 0.15, 1.11, 1.94, -1.25, -1.17); box(b, frame, 0.85, 0.89, 1.11, 1.94, -1.25, -1.17); box(b, frame, 0.48, 0.52, 1.15, 1.9, -1.25, -1.19);
  for (let i = 1; i < 4; i++) box(b, frame, 0.15, 0.85, 1.15 + i * 0.19 - 0.008, 1.15 + i * 0.19 + 0.008, -1.23, -1.21);
  for (const [x0, x1] of [[-0.25, 0.11], [0.89, 1.25]]) b.add(quad(P(x0, 1.11, -1.2), P(x1, 1.11, -1.2), P(x1, 1.94, -1.2), P(x0, 1.94, -1.2)), shutter);
  // the bed: wooden headboard and footboard, frame, legs, a white sheet, the white pillow, the kantha quilt over her body
  const wood = warmLam("x_bedWood2", { color: "#8a5a34", emissive: "#2a1608" });
  box(b, wood, -1.12, -1.04, 0, 1.0, -1.2, -0.28);                 // headboard
  box(b, wood, 0.96, 1.04, 0, 0.62, -1.2, -0.28);                  // footboard
  box(b, wood, -1.04, 0.96, 0.24, 0.36, -1.18, -0.3);              // frame
  for (const [x, z] of [[-1.0, -0.34], [0.92, -0.34]]) box(b, wood, x - 0.04, x + 0.04, 0, 0.24, z - 0.04, z + 0.04);
  const linen = warmLam("x_sheet", { color: "#f6f2ea", emissive: "#4a4032" });
  box(b, linen, -1.03, 0.95, 0.36, 0.5, -1.17, -0.31);             // mattress in a white sheet
  box(b, linen, -1.03, 0.95, 0.3, 0.5, -0.32, -0.3);               // the sheet hanging over the front edge
  b.add(hedgeGeo(), linen, new THREE.Matrix4().compose(P(-0.88, 0.55, -0.8), new THREE.Quaternion(), V(0.18, 0.06, 0.3))); // pillow (low: her cheek rests on it)
  { const bm = new THREE.Mesh(blanketGeo(ox, oz), warmLam("x_blanket", { map: blanketTex(), emissive: "#4a4434", side: THREE.DoubleSide })); bm.castShadow = false; bm.receiveShadow = false; root.add(bm); } // no shadow blotches on the soft blanket
  // bedside table at the head end, the low lamp (warm shade, glow), a photo and a clock on the wall
  box(b, wood, -1.62, -1.2, 0, 0.5, -1.15, -0.75);
  b.add(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 16).translate(ox - 1.41, 0.59, oz - 0.95), lam("x_lampBase", () => ({ color: "#c9a46a" })));
  b.add(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 20, 1, true).translate(ox - 1.41, 0.76, oz - 0.95), lam("x_lampShade", () => ({ color: "#f3d8a8", emissive: "#f0b060", emissiveIntensity: 0.9, side: THREE.DoubleSide })));
  glow(root, ox - 1.41, 0.74, oz - 0.84, 0.06, 1.8, new THREE.Color(4.4, 3.0, 1.4), new THREE.Color(1.0, 0.64, 0.3), 0.42);
  box(b, lam("x_photoFrame", () => ({ color: "#5a3b2a" })), -0.75, -0.42, 1.35, 1.65, -1.25, -1.22);
  box(b, lam("x_photo", () => ({ color: "#c9b48e" })), -0.72, -0.45, 1.38, 1.62, -1.22, -1.215);
  b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24).rotateX(Math.PI / 2).translate(ox + 1.65, 2.0, oz - 1.235), lam("x_clock", () => ({ color: "#f6f3ea" })));
  sb.build(root, false); b.build(root, true);
};
/** shot 15 only: a mess table beside Nusrat (steel plate, glass, a tiffin carrier) and a wall shelf behind her */
export const buildMessTable = (root: THREE.Object3D) => {
  const g = new THREE.Group(), b = new Batch(), [mx, , mz] = MESS, P = (x: number, y: number, z: number) => V(mx + x, y, mz + z);
  const box = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => b.add(boxGeo(P(x0, y0, z0), P(x1, y1, z1), 0, true), mat);
  const wood = lam("v_wood", () => ({ color: "#7a5636" }));
  box(wood, -1.25, -0.7, 0.68, 0.72, -1.25, -0.85);
  for (const [x, z] of [[-1.22, -1.22], [-0.73, -1.22], [-1.22, -0.88], [-0.73, -0.88]]) box(wood, x - 0.02, x + 0.02, 0, 0.68, z - 0.02, z + 0.02);
  b.add(new THREE.CylinderGeometry(0.12, 0.1, 0.018, 24).translate(mx - 1.0, 0.73, mz - 1.02), steelMat());
  b.add(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 16).translate(mx - 0.8, 0.77, mz - 1.15), steelMat());
  const tiff = (x: number, y: number, z: number) => {
    for (let i = 0; i < 3; i++) b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 20).translate(x, y + 0.035 + i * 0.075, z), steelMat());
    b.add(rodGeo(V(x - 0.085, y, z), V(x - 0.085, y + 0.3, z), 0.006), steelMat()); b.add(rodGeo(V(x + 0.085, y, z), V(x + 0.085, y + 0.3, z), 0.006), steelMat());
    b.add(rodGeo(V(x - 0.085, y + 0.3, z), V(x + 0.085, y + 0.3, z), 0.006), steelMat());
  };
  tiff(mx - 1.12, 0.72, mz - 1.12);
  box(wood, -0.85, 0.15, 1.38, 1.41, -2.5, -2.3); // wall shelf behind her
  tiff(mx - 0.55, 1.41, mz - 2.4);
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20).rotateX(Math.PI / 2 - 0.25).translate(mx - 0.15, 1.5, mz - 2.42), steelMat()); // a plate stood on the shelf
  b.build(g, true); root.add(g);
  return g;
};
/** a soft blanket over her (bedroom): a height field draped over the mattress, high along her body line (z -0.74), the
 *  chest end at x -0.52, lower over the legs, a small bump at the feet, shallow folds, the front edge hanging down */
const blanketGeo = (ox: number, oz: number) => {
  const X0 = -0.52, X1 = 0.97, Z0 = -1.18, Z1 = -0.22, nx = 60, nz = 30, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = X0 + ((X1 - X0) * i) / nx, z = Z0 + ((Z1 - Z0) * j) / nz, dz = z + 0.74;
    const body = Math.exp(-((dz / 0.26) ** 2));
    // height of her shape along the bed: the rolled edge at her chest, torso, hips, legs, a small bump at the feet
    const prof = 0.3 * Math.exp(-(((x + 0.44) / 0.13) ** 2)) + 0.22 * Math.exp(-(((x + 0.22) / 0.22) ** 2)) + 0.17 * Math.exp(-(((x - 0.18) / 0.2) ** 2)) + 0.1 * Math.exp(-(((x - 0.5) / 0.22) ** 2)) + 0.13 * Math.exp(-(((x - 0.8) / 0.08) ** 2));
    let y = 0.515 + prof * body;
    // (folds are painted in the texture: geometric ripples flip the two-tone shading into blotches)
    if (z > -0.32) y -= Math.min(0.13, (z + 0.32) * 1.3) ; // the front edge drapes over the side
    if (x > 0.93) y -= (x - 0.93) * 1.5;
    pos.push(ox + x, y, oz + z); uv.push((x - X0) * 1.6, (z - Z0) * 1.6);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b2 = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b2, b2, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
};
/** a light cream kantha: faded green running-stitch rows and small leaf motifs */
const blanketTex = () => ctex("x_blanketT", 256, 256, (g, r) => {
  g.fillStyle = "#ece4cc"; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(110,150,110,0.55)"; g.lineWidth = 2; g.setLineDash([6, 5]);
  for (let y = 10; y < 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.setLineDash([]); g.strokeStyle = "rgba(120,160,120,0.7)"; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const x = 20 + r() * 216, y = 20 + r() * 216; g.beginPath(); g.ellipse(x, y, 10, 5, r() * 3, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = "rgba(120,100,70,0.22)"; g.lineWidth = 5; // soft painted folds
  for (let i = 0; i < 5; i++) { const x = 30 + i * 50 + r() * 20; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 30 * (r() - 0.5), 128, x + 20 * (r() - 0.5), 256); g.stroke(); }
});
const shutterTex = () => ctex("x_shutterT", 64, 128, (g) => {
  g.fillStyle = "#2f6fb5"; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = "#245a94"; g.lineWidth = 3; for (let y = 8; y < 128; y += 10) { g.beginPath(); g.moveTo(6, y); g.lineTo(58, y); g.stroke(); }
  g.strokeStyle = "#1c4778"; g.lineWidth = 4; g.strokeRect(2, 2, 60, 124);
});

export const buildExtras = (root: THREE.Object3D) => { buildStall(root); buildShop(root); buildOffice(root); buildBedroom(root); };

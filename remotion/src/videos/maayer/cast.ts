// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, swingKid, soldier, townsfolk, OFFICER, KID, PARENT, fxNote, fxBurst, fxSplash, fxStars, fxCreak, fxRing, fxShadow, fxContact, fxPlank, fxDrum,
  Outfit, Expr, FrontOpts, SideOpts, villagerFront, villagerHeadOnly, villagerHeadY, familyHug, FAMILY_HUG_S, motherWithChild, bedRest, BED_PIVOT, Villager, VOpts, VPose,
} from "./toon";
import { FPS, SHOTS, V3, smooth, clamp01, Cast, ShotDef, toPlan, S2_POS, N7, STALL, SHOP, OFFICE, BED_HEAD, HUT, COURT, DHEKI, WELL, INT, BUS_STOP, STREET, MESS, BANK, MED_GATE, ROOF } from "./story";
import {
  D0, FILES, ROW_GAP, COUNT, PARK, SNAP, DROP0, DROP1, DROP_H, front, marchPhase, stomp, deckY, dropW, dropU, shapeZ, BridgeState,
  BRIDGE_FX, tauOf, crowdOf, townsOf,
} from "./legacy";
import { NOINK } from "./ink";
import { insertsFx } from "./inserts";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
  /** tilt back about the card's own x axis (sleepers lie back on the bed) */
  pitch?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const SOLDIER = [0, 1, 2, 3].map((v) => soldier(v));
const BARE = [0, 1, 2, 3].map((v) => soldier(v, { hat: null }));
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const SWAPS: Record<number, number[]> = { 4: [16.17, 17.3], 5: [19.48, 20.6], 6: [21.9, 23.7], 7: [29.4, 30.6], 8: [SNAP] };
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1, tail = true) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day" && tail) {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- crowd by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };

const exprMarch = (id: number, t: number, i: number, tau: number): { expr: Expr; look: number } => {
  const lau = i % 3 === 0, whi = i % 5 === 1, L = LEAD;
  switch (id) {
    case 1: return { expr: lau ? "laugh" : whi ? "whistle" : "grin", look: 0 };
    case 2: case 3: return { expr: i % 4 === 3 ? "smile_closed" : i % 2 ? "neutral" : "stern", look: 0 };
    case 4: return t < 16.17 - L ? { expr: i % 2 ? "neutral" : "stern", look: 0 } : t < 17.3 - L ? { expr: lau ? "shock" : "nervous", look: 0 } : { expr: "neutral", look: 0 };
    case 5: return { expr: t < 19.48 - L ? "neutral" : t < 20.6 - L ? "grin" : i % 2 ? "laugh" : "grin", look: 0 };
    case 6: return { expr: (i === 2 && t > 21.9 - L) || (t > 23.7 - L && i % 4 === 1) ? "whistle" : t > 23.7 - L && lau ? "laugh" : "grin", look: 0 };
    case 7: return t < 29.4 - L ? { expr: lau ? "laugh" : "grin", look: 0 } : t < 30.6 - L ? { expr: i % 2 ? "nervous" : "grin", look: -1 } : { expr: "nervous", look: 0 };
    case 8: return { expr: tau < SNAP - L ? "nervous" : "shock", look: tau < SNAP + 0.6 ? -1 : 0 };
    default: return { expr: whi ? "whistle" : "grin", look: 0 };
  }
};

/** the marching column (shots 1-8, 13) */
const column = (id: number, t: number, b: BridgeState, cam: CamInfo, out: Stage) => {
  const s = SHOTS[id - 1], tau = tauOf(s)(t);
  const stopT = SNAP + 0.3, walkT = id === 8 ? Math.min(tau, stopT) : tau;
  const F = front(walkT), ph = marchPhase(walkT), st = stomp(tau);
  const falling = id === 8 && tau >= DROP0;
  for (let i = 0; i < COUNT; i++) {
    const row = i >> 2, x0 = FILES[i & 3] + (hh(i) - 0.5) * 0.08, z = F + row * ROW_GAP + (hh(i, 2) - 0.5) * 0.1;
    let x = x0, y = Math.abs(z) <= 30 ? deckY(z, b) : D0;
    const who: Who = { i, o: SOLDIER[vOf(i)], okey: `s${vOf(i)}` };
    let { expr, look } = exprMarch(id, t, i, tau);
    let mode: "march" | "stand" | "fall" | "sit" = id === 8 && tau >= SNAP + 0.25 ? "stand" : "march";
    let tilt = 0;
    if (falling) {
      // the soldiers lag the falling deck a little (cartoon hang time), then sit in the water
      const lagY = D0 + b.bounce * shapeZ(z) - dropU(tau - 0.13) * DROP_H * dropW(z);
      const air = Math.max(0, lagY - y);
      y += air;
      const u = clamp01((tau - DROP0) / (DROP1 - DROP0));
      x = x0 + (hh(i, 3) - 0.5) * 0.7 * u;
      mode = tau < DROP1 + 0.13 ? "fall" : "sit";
      tilt = mode === "fall" ? (hh(i, 4) - 0.5) * 50 * u : 0;
      if (mode === "sit") expr = i % 3 ? "dazed" : "shock";
    }
    const view = viewOf(cam, x, z, 0, -1);
    const blink = expr !== "whistle" ? lidAt(t, i, SWAPS[id]) : 0;
    const fo: FrontOpts = { phase: mode === "march" ? ph : 0, expr, mode, look, blink, lift: 60 * st, tilt };
    // side views: the stance foot keeps pace with the column (0.8 m steps at 2 steps/s), foreshortened by the view
    const so: SideOpts = { phase: mode === "march" ? ph : 0, expr, mode: mode === "march" ? "march" : "stand", blink, stomp: st, stride: view.fs };
    out.places.push(person(cam, who, x, y, z, mode === "fall" || mode === "sit" ? { side: false, mirror: false } : view, fo, so));
    if (mode === "march" || mode === "stand") blob(out, x, y, z);
    // whistled notes drift up from whistlers near the lens
    if (expr === "whistle" && (id === 6 || id === 1 || id === 13) && cam.pos.distanceTo(tmp.set(x, y, z)) < 16) {
      for (let n = 0; n < 4; n++) {
        const age = ((t - 21.9 + n * 0.42 + hh(i, 5)) % 1.68) / 1.68;
        const pop = Math.min(1, age * 7) * (age > 0.82 ? (1 - age) / 0.18 : 1);
        if (pop <= 0.02) continue;
        const kind = (n + i) % 2, side = 0.16 + 0.32 * age + 0.05 * Math.sin(age * 9 + n);
        out.fx.push({ key: `note${kind}`, cw: 220, ch: 260, draw: (p) => fxNote(p, kind), x: x + cam.right.x * side, y: y + 1.5 + 0.85 * age, z: z + cam.right.z * side - 0.1,
          w: 0.17 * pop, h: 0.2 * pop, rot: 0.3 * Math.sin(age * 6 + n) });
      }
    }
  }
};

const sitters = (cam: CamInfo, t: number, out: Stage, spots: [number, number, number][], exprs: (i: number) => Expr, stars: (i: number) => boolean, water: boolean) => {
  spots.forEach(([x, y, z], i) => {
    const bare = i % 3 === 1;
    const v = vOf(i + 3), who: Who = { i, o: bare ? BARE[v] : SOLDIER[v], okey: `${bare ? "b" : "s"}${v}` };
    const expr = exprs(i), bob = water ? 0.03 * Math.sin(t * 2.2 + i) : 0;
    out.places.push(person(cam, who, x, y + bob, z, { side: false, mirror: false }, { mode: "sit", expr, blink: lidAt(t, i), look: 0 }, {}));
    if (stars(i)) {
      const u = (t * 0.9 + hh(i)) % 1;
      out.fx.push({ key: `stars${q(u, 30)}`, cw: 420, ch: 210, draw: (p) => fxStars(p, q(u, 30)), x, y: y + bob + 1.3, z, w: 0.75, h: 0.375 });
    }
    if (water) {
      const u = ((t + hh(i, 7) * 2) % 2.2) / 2.2;
      out.fx.push({ key: `ring${q(u, 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q(u, 30)), x, y: 0.03, z, w: 2.0, h: 2.0, flat: true });
      // darker water right where the body meets the surface (only the front arc shows below the card)
      out.fx.push({ key: `blob|contact|${WATERLINE}`, cw: 128, ch: 128, draw: (p) => fxContact(p, WATERLINE), x, y: 0.034 + bob * 0.3, z, w: 0.7, h: 0.5, flat: true });
      if (bare) out.fx.push({ key: "shako", cw: 200, ch: 200, draw: shakoAlone, x: x + 0.55 + 0.3 * hh(i, 8), y: 0.12 + 0.03 * Math.sin(t * 2 + i), z: z - 0.3, w: 0.42, h: 0.42, rot: -0.5 + hh(i, 6) });
    } else {
      out.fx.push({ key: "puddle", cw: 300, ch: 150, draw: puddle, x, y: D0 + 0.02, z: z - 0.05, w: 1.5, h: 0.75, flat: true });
      blob(out, x, y, z, 1.05, 0.8);
    }
  });
};
const WATERLINE = hexOf([0.3, 0.36, 0.52], 1);
/** flotsam in the near water of the river shots (9-10), so the bottom of the frame is not empty: hats, planks, a drum.
 *  World positions 2.5-5 m in front of both river cameras (z -27 / -25.4 looking +z); half under the surface, bobbing. */
const FLOAT: { kind: "shako" | "plank" | "drum"; x: number; z: number; s: number; r: number }[] = [
  // round-4 river cameras sit at z -24.6 / -24.2: the two nearest pieces were 0.7-1.5 m from the lens (cut-off blobs)
  { kind: "shako", x: -0.25, z: -22.5, s: 0.46, r: 0.6 }, // (drum removed: cut by the frame edge it read as a blob)
  { kind: "shako", x: 0.95, z: -24.6, s: 0.42, r: 0.25 }, // (near plank removed: cut by the frame edge)
];
const flotsam = (t: number, out: Stage) =>
  FLOAT.forEach((f, i) => {
    const bob = 0.03 * Math.sin(t * 1.9 + i * 1.7), r = f.r + 0.08 * Math.sin(t * 1.3 + i);
    const [cw, ch, draw, ar] = f.kind === "shako" ? [200, 200, shakoAlone, 1] as const : f.kind === "plank" ? [320, 110, fxPlank, 110 / 320] as const : [260, 240, fxDrum, 240 / 260] as const;
    const w = f.s, h = f.s * ar;
    out.fx.push({ key: f.kind, cw, ch, draw, x: f.x, y: 0.28 * h + bob, z: f.z, w, h, rot: r });
    out.fx.push({ key: `ring${q(((t * 0.45 + i * 0.3) % 1), 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q(((t * 0.45 + i * 0.3) % 1), 30)), x: f.x, y: 0.03, z: f.z, w: 1.1 * f.s + 0.5, h: 1.1 * f.s + 0.5, flat: true });
  });
const shakoAlone = (p: Pen) => {
  p.poly([[42, 160], [158, 160], [166, 50], [34, 50]], "#3a3d47", 8);
  p.ell(100, 158, 60, 10, "#16171b", 7, 0, 180);
  p.ell(100, 96, 14, 12, "#c9ccd2", 6);
  p.ell(100, 36, 14, 14, "#2b7a4b", 6);
};
const puddle = (p: Pen) => { p.ell(150, 75, 140, 58, "#6f97c6", 0); p.ell(120, 62, 60, 16, "#a9c9ea", 0); };

/** the extras hold still and only cheer on cue: "pride of the whole town", "like a crowd of tourists" */
const CHEER: [number, number][] = [[8.01 - LEAD, 9.45], [65.96 - LEAD, 67.5]];
const townsfolkAt = (cam: CamInfo, t: number, out: Stage) => {
  const spots: [number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const bank = i < 13 ? -1 : 1, k = i % 13, sx = k % 2 ? 1 : -1;
    spots.push([sx * (5.2 + (k >> 1) * 1.7 + hh(i) * 0.6), bank * (31.6 + hh(i, 2) * 3.2)]);
  }
  const on = CHEER.some(([a, b]) => t >= a && t < b);
  spots.forEach(([x, z], i) => {
    const kid = i % 5 === 2, o = kid ? KID : FOLK[i % 6], hop = kid && on ? Math.max(0, Math.sin(t * 7 + i)) * 0.18 : 0;
    const who: Who = { i: i + 200, o, okey: kid ? "kid" : `f${i % 6}` };
    const expr: Expr = (["smile", "grin", "laugh", "smile_closed"] as Expr[])[i % 4];
    const fo: FrontOpts = { mode: "stand", expr, wave: i % 3 === 2 || !on ? undefined : q(Math.sin(t * 9 + i * 1.3), 30), blink: lidAt(t, i + 40) };
    out.places.push(person(cam, who, x, D0 + hop, z, { side: false, mirror: false }, fo, {}, kid ? 0.72 : 1));
    blob(out, x, D0, z, kid ? 0.72 : 1, hop > 0 ? 0.6 : 1);
  });
};

/** soldiers strolling out of step across the rebuilt bridge (shot 15): own pace kept (sound), poses on ones */
const tourists = (cam: CamInfo, t: number, out: Stage) => {
  const t0 = 62.08;
  for (let i = 0; i < 24; i++) {
    const sp = 0.55 + hh(i) * 0.5, z = -4 + (i / 24) * 28 + hh(i, 2) * 1.5 - sp * (t - t0), x = (hh(i, 3) - 0.5) * 4.0;
    const bare = i % 5 === 2, v = vOf(i), who: Who = { i, o: bare ? BARE[v] : SOLDIER[v], okey: `${bare ? "b" : "s"}${v}` };
    const prop = i % 7 === 3 ? "icecream" : bare ? "shako" : null;
    const lick = prop === "icecream" && (t * 0.7 + hh(i, 4)) % 1 < 0.45;
    const expr: Expr = lick ? "lick" : (["smile", "smile_closed", "grin", "smile"] as Expr[])[i % 4];
    const phase = q(((t - t0) * sp / 1.4 + hh(i, 5)) % 1, 120); // cadence sp/1.4 Hz unchanged = 0.7 m per step
    const look = Math.round(Math.sin(t * 0.8 + i * 1.7) * 1.2);
    const fo: FrontOpts = { mode: "stroll", phase, expr, look: Math.max(-1, Math.min(1, look)), prop, blink: lidAt(t, i) };
    const view = viewOf(cam, x, z, 0, -1);
    const so: SideOpts = { mode: "march", phase, expr, stomp: 0.55, stride: 0.875 * view.fs };
    out.places.push(person(cam, who, x, D0, z, view, fo, so));
    blob(out, x, D0, z);
  }
};

// officer hammering the new rule onto a sign at the bridge end (shot 14)
export const HITS = [59.79, 60.33, 61.69];
export const SIGN_AT: V3 = [2.25, D0, -30.9];
/** 0 = hammer up, 1 = struck. Reference action timing: 4 f wind-up, held ~7 f at the top, a 1-frame strike on the word */
const hammerK = (t: number) => {
  let k = 1;
  for (const th of HITS) {
    const n = (t - th) * FPS; // frames to contact
    if (n >= -11 && n < -7) k = Math.min(k, 1 - smooth((n + 11) / 4));
    else if (n >= -7 && n < 0) k = 0;
  }
  return k;
};
const officer = (cam: CamInfo, t: number, out: Stage) => {
  const fo: FrontOpts = { mode: "stand", expr: "stern", prop: ["hammer", q(hammerK(t), 30)], blink: lidAt(t, 99), facing: 1 };
  out.places.push(person(cam, { i: 99, o: OFFICER, okey: "off" }, 3.35, D0, -31.55, { side: false, mirror: false }, fo, {}));
  blob(out, 3.35, D0, -31.55, 1.1);
  for (const th of HITS) if (t >= th && t < th + 5 / FPS) {
    const u = (t - th) / (5 / FPS);
    out.fx.push({ key: `burst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: 2.95, y: D0 + 1.55, z: -31.0, w: 0.9, h: 0.9 });
  }
};

// swing in the park (shot 12): pushes land at the back end of every swing, the arc grows
export const SWING_T = 1.55, PUSH0 = 48.79;
const pushes = [0, 1, 2, 3].map((k) => PUSH0 + k * SWING_T);
export const swingAmp = (t: number) => 6 + pushes.reduce((a, tp) => a + 11 * smooth((t - tp) / 0.3), 0);
export const swingAngle = (t: number) => -((swingAmp(t) * Math.PI) / 180) * Math.cos((2 * Math.PI * (t - PUSH0)) / SWING_T);
/** the swing kid's back (seat + ~.12 m, ~8 cm behind the rope) in world space when the swing is at angle th */
const kidBack = (th: number): [number, number] => {
  const lx = -0.083, ly = -2.174; // local to the swing card (pivot at the origin), card yawed by PI
  return [PARK[0] - (lx * Math.cos(th) - ly * Math.sin(th)), PARK[1] + 2.88 + lx * Math.sin(th) + ly * Math.cos(th)];
};
/** where the parent stands for push k: hands reach the kid's back at the back of the arc with the arms ~ straight */
const pushSpot = (k: number) => {
  const A = (swingAmp(pushes[k]) * Math.PI) / 180, [bx, by] = kidBack(-A);
  const cy = 975 - (by - D0) / SU, dy = cy - 515, dx = Math.sqrt(Math.max(120 * 120, 222 * 222 - dy * dy));
  return { px: bx + (53 + dx) * SU, hand: [300 + 53 + dx, cy] as [number, number] };
};
const park = (cam: CamInfo, t: number, out: Stage) => {
  const th = swingAngle(t), vel = Math.sin((2 * Math.PI * (t - PUSH0)) / SWING_T);
  const A = (swingAmp(t) * Math.PI) / 180, kick = q(0.35 + 0.55 * vel, 40);
  const expr: Expr = A < 0.35 ? "smile" : A < 0.6 ? "grin" : "laugh";
  const light = light2D(cam, true), lid = lidAt(t, 78);
  out.places.push({ key: `swing|${kick}|${expr}|${q(light)}|${lid}`, geo: "swing", x: PARK[0], y: PARK[1] + 2.88, z: PARK[2], yaw: Math.PI, roll: th,
    draw: (p) => swingKid(p, KID, kick, expr, light, lid), size: [490, 1610, 0.7] });
  const push = Math.max(0, ...pushes.map((tp) => 1 - Math.abs(t - tp + 0.05) / 0.32));
  // stand at this push's spot; step back to the next spot between pushes (the arc grows after every push)
  let k = 0;
  while (k < pushes.length - 1 && t > pushes[k] + 0.35) k++;
  const cur = pushSpot(k), prev = pushSpot(Math.max(0, k - 1));
  const step = k > 0 ? smooth((t - (pushes[k - 1] + 0.35)) / (SWING_T - 0.7)) : 1;
  const px = prev.px + (cur.px - prev.px) * step, pz = PARK[2] + 0.1;
  const so: SideOpts = { mode: "push", pose: q(push, 40), expr: push > 0.3 ? "grin" : "smile", blink: lidAt(t, 77), hand: cur.hand };
  out.places.push({ ...person(cam, { i: 77, o: PARENT, okey: "parent" }, px, D0, pz, { side: true, mirror: true }, {}, so), mirror: false, yaw: Math.PI });
  blob(out, px, D0, pz);
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, b: BridgeState, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light === "day" ? "day" : "golden"; // night / lamp / sunset: contact pools only, no long day tails
  findSun(cam, SUN);
  if (crowdOf(s) === "march" || crowdOf(s) === "fall") column(id, t, b, cam, out);
  if (townsOf(s)) townsfolkAt(cam, t, out);
  if (crowdOf(s) === "water") {
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) spots.push([FILES[i & 3] * 1.12 + (hh(i, 11) - 0.5) * 0.6, -0.6, -21.6 + (i >> 2) * 1.6 + (hh(i, 12) - 0.5) * 0.7]);
    const happy: Expr[] = ["relief", "relief_open", "smile", "relief"], hurt: Expr[] = ["pained", "dazed", "pained", "dazed"];
    sitters(cam, t, out, spots, (i) => (id === 9 ? happy : hurt)[i % 4], (i) => id === 10 && i % 4 === 1, true);
    flotsam(t, out);
  }
  if (crowdOf(s) === "bank") {
    const spots: [number, number, number][] = [[-7.2, D0, -33.6], [-6.1, D0, -32.1], [-5.0, D0, -34.3], [-4.3, D0, -31.6], [-3.4, D0, -33.2],
      [-2.4, D0, -31.9], [-6.8, D0, -35.4], [-4.1, D0, -35.6], [-1.9, D0, -34.6]];
    const ex: Expr[] = ["dazed", "relief", "smile_closed", "pained"];
    sitters(cam, t, out, spots, (i) => ex[i % 4], (i) => i % 4 === 0, false);
    officer(cam, t, out);
  }
  if (crowdOf(s) === "tourists") tourists(cam, t, out);
  if (BRIDGE_FX && id === 12) park(cam, t, out);
  family(id, Math.round(t * FPS), t, cam, out);
  rainFx(id, t, out);
  dripFx(id, t, out);
  lanternFx(id, out);
  insertsFx(id, Math.round(t * FPS), out);
  return out;
};

// ---------------- one-off effects ----------------
export const snapFx = (tau: number, at: V3, out: Stage) => {
  if (tau >= SNAP && tau < SNAP + 0.45) {
    const u = (tau - SNAP) / 0.45;
    out.fx.push({ key: `bigburst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: at[0], y: at[1] + 0.12, z: at[2] - 0.15, w: 1.5, h: 1.5 });
  }
};
export const splashFx = (tau: number, out: Stage) => {
  const u = (tau - DROP1) / 1.1;
  if (u < 0 || u >= 1) return;
  for (const [x, z, s] of [[-2.9, -24, 1], [2.9, -21, 0.9], [-2.9, -15, 0.85], [2.9, -9, 0.8], [0, -27.5, 1.2], [-2.9, -5, 0.6]] as const)
    out.fx.push({ key: `splash${q(u, 30)}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, q(u, 30)), x, y: 2.6 * s, z, w: 7 * s, h: 7 * s }); // base of the drawing on the water line
};
export const creakFx = (t: number, pts: V3[], out: Stage, size = 0.8) =>
  pts.forEach(([x, y, z], i) => {
    const u = q((t * 1.3 + i * 0.37) % 1, 30);
    out.fx.push({ key: `creak${u}`, cw: 300, ch: 300, draw: (p) => fxCreak(p, u), x, y, z, w: size, h: size, rot: i * 0.6 - 0.6 });
  });
export { FPS };

// ======================================================================================================
// মায়ের অবসর: the family, staged per shot (frame numbers are the story.ts estimates; retime with words.json).
// Fatema (mother), Nusrat, Rahat, Mim; the father only as a silhouette walking away in shot 1. Costume set by
// ShotDef.era. Expressions are held per beat until the voice exists; blinks run as in the template.
// ======================================================================================================
type Role = Exclude<Cast, "none">;
type Era = ShotDef["era"];
const SKIN_BD: Record<Role, string> = { mother: "#b87a4e", nusrat: "#c48a5c", rahat: "#b0744a", mim: "#cc9466", father: "#a26a44", seller: "#a8704a" };
const HAIR_BK = "#1c1618";
const ROLE_I: Record<Role, number> = { mother: 301, nusrat: 302, rahat: 303, mim: 304, father: 305, seller: 306 };
const castCache = new Map<string, { v: Villager; scale: number }>();
const villagerOf = (role: Role, era: Era): { v: Villager; scale: number } => {
  const key = role + era;
  let c = castCache.get(key);
  if (c) return c;
  const grown = era === "adult" || era === "old";
  switch (role) {
    case "mother": {
      const sari = era === "child" ? { body: "#2f6f5e", border: "#6e1f2b", blouse: "#6e1f2b" } : era === "teen" ? { body: "#5a4a86", border: "#2a2244", blouse: "#c7a24e" }
        : era === "adult" ? { body: "#8a4f34", border: "#2f3b2a", blouse: "#d8c08a" } : { body: "#ddd5c4", border: "#2f5a3e", blouse: "#c9c0ae" };
      c = { v: { skin: SKIN_BD.mother, hair: "anchal", hairCol: era === "old" ? "#8f8b88" : HAIR_BK, g: { kind: "sari", ...sari }, anchal: { col: sari.body, border: sari.border }, build: "adult", seed: 3, feet: "#5a3b2a" }, scale: 0.96 };
      break;
    }
    case "nusrat":
      c = era === "child" ? { v: { skin: SKIN_BD.nusrat, hair: "plaits", hairCol: HAIR_BK, ribbon: "#d23b3b", g: { kind: "frock", body: "#e07a5f", collar: "#f6f1e6" }, build: "kid", seed: 5, feet: "#6b4a2e" }, scale: 0.98 }
        : era === "teen" ? { v: { skin: SKIN_BD.nusrat, hair: "long", hairCol: HAIR_BK, g: { kind: "salwar", top: "#3f7fbf", pants: "#efe9dc", orna: "#f2c14e" }, build: "teen", seed: 5, feet: "#6b4a2e" }, scale: 0.97 }
        : { v: { skin: SKIN_BD.nusrat, hair: "bun", hairCol: HAIR_BK, g: { kind: "bank", blazer: "#2f3a5a", top: "#e8d6c0", pants: "#2f3a5a", lanyard: "#c0353a" }, build: "adult", seed: 5, feet: "#2a2228" }, scale: 0.95 };
      break;
    case "rahat":
      c = era === "child" ? { v: { skin: SKIN_BD.rahat, hair: "short", hairCol: HAIR_BK, g: { kind: "shirt", shirt: "#4f8fca", pants: "#3b3f52", shorts: true, check: "#78aee0" }, build: "kid", seed: 2, feet: "#6b4a2e" }, scale: 0.92 }
        : era === "teen" ? { v: { skin: SKIN_BD.rahat, hair: "short", hairCol: HAIR_BK, g: { kind: "fatua", top: "#c8a24a", pants: "#3b3f52" }, build: "teen", seed: 2, feet: "#6b4a2e" }, scale: 1.0 }
        : { v: { skin: SKIN_BD.rahat, hair: "short", hairCol: HAIR_BK, g: { kind: "shirt", shirt: "#e8eef4", pants: "#37425a" }, build: "adult", seed: 2, feet: "#2a2228" }, scale: 1.02 };
      break;
    case "mim":
      c = era === "child" ? { v: { skin: SKIN_BD.mim, hair: "bob", hairCol: HAIR_BK, g: { kind: "frock", body: "#f2c14e", collar: "#ffffff" }, build: "kid", seed: 6, feet: "#6b4a2e" }, scale: 0.78 }
        : era === "teen" ? { v: { skin: SKIN_BD.mim, hair: "plaits", hairCol: HAIR_BK, ribbon: "#ffffff", g: { kind: "uniform", shirt: "#f6f6f2", pinafore: "#2f6a43" }, build: "teen", seed: 6, feet: "#1f1b1e" }, scale: 0.9 }
        : { v: { skin: SKIN_BD.mim, hair: "long", hairCol: HAIR_BK, g: { kind: "kurti", top: "#b84a62", pants: "#efe9df", trim: "#f2c14e" }, build: "adult", seed: 6, feet: "#6b4a2e" }, scale: 0.93 };
      break;
    case "seller": // the village bangle seller: white topi, an open brown vest over a pale shirt, a checked lungi
      c = { v: { skin: SKIN_BD.seller, hair: "short", hairCol: "#2a2226", topi: "#f4f1e8", g: { kind: "lungi", shirt: "#e9e3d2", lungi: "#2f5a6e", vest: "#6b4a32" }, build: "adult", seed: 7, feet: "#3a2a20" }, scale: 1.0 };
      break;
    case "father":
      c = { v: { skin: SKIN_BD.father, hair: "short", hairCol: HAIR_BK, g: { kind: "lungi", shirt: "#d9d2c0", lungi: "#3b5b8a" }, build: "adult", seed: 4, feet: "#3a2a20", sil: "#1b1824" }, scale: 1.02 };
      break;
  }
  void grown;
  castCache.set(key, c);
  return c;
};

type Act = {
  role: Role; x: number; y?: number; z: number; mode?: VOpts["mode"]; pose?: VPose; poseT?: number; expr?: Expr; facing?: -1 | 0 | 1;
  look?: number; back?: boolean; sleep?: boolean; phase?: number; prop?: boolean;
  /** use expr even when a sentence mood is set */ force?: boolean;
  /** an office ID on a lanyard (shirt garments) */ lanyard?: string;
};
const actor = (cam: CamInfo, s: ShotDef, t: number, a: Act, out: Stage) => {
  const base = villagerOf(a.role, s.era), y = a.y ?? 0, i = ROLE_I[a.role], scale = base.scale;
  const v: Villager = a.lanyard && base.v.g.kind === "shirt" ? { ...base.v, g: { ...base.v.g, lanyard: a.lanyard } } : base.v;
  const d = cam.pos.distanceTo(tmp.set(a.x, y + 1.0, a.z)) / scale, [w, h, k] = tier(d);
  const vo: VOpts = {
    mode: a.mode ?? "stand", phase: q(a.phase ?? 0, 120), pose: a.pose ?? "none", poseT: q(a.poseT ?? 0, 40), expr: a.sleep ? "asleep" : (a.force ? a.expr : moodOf(a.role, t)) ?? a.expr ?? "gentle",
    look: a.look ?? 0, blink: a.sleep ? 0 : lidAt(t, i), facing: a.facing ?? 0, back: !!a.back, prop: a.prop ?? true, light: light2D(cam, false),
  };
  if (a.sleep) {
    const th = (80 * Math.PI) / 180, hcH = (975 - villagerHeadY(v)) * SU * scale, rl = Math.hypot(cam.right.x, cam.right.z) || 1;
    const ox = a.x + (cam.right.x / rl) * hcH * Math.sin(th), oz = a.z + (cam.right.z / rl) * hcH * Math.sin(th), oy = y - hcH * Math.cos(th);
    out.places.push({ key: `Z|${a.role}${s.era}|${fkey(vo)}`, x: ox, y: oy, z: oz, scale, draw: (p) => villagerHeadOnly(p, v, vo), size: [w, h, k], roll: th });
    return;
  }
  out.places.push({ key: `V|${a.role}${s.era}${a.lanyard ?? ""}|${fkey(vo)}`, x: a.x, y, z: a.z, scale, draw: (p) => villagerFront(p, v, vo), size: [w, h, k] });
  const seated = a.mode === "sit", indoor = s.place === "interior" || s.place === "shop" || s.place === "office" || s.place === "bedroom" || s.id === 12;
  blob(out, a.x, y, a.z, (seated ? 0.7 : 1) * scale, 1, !seated && !indoor);
};
const at = (b: V3, dx: number, dz: number) => [b[0] + dx, b[2] + dz] as const;

/** who stands where, doing what, in shot `id` at frame f */
const family = (id: number, f: number, t: number, cam: CamInfo, out: Stage) => {
  // frame tests below are in PLANNED frames (story.ts PLAN / toPlan), the frames the cameras were written in.
  // Faces: no gritted teeth; the mother is tired / gentle (shots 1-4 never smiling), moved with a tear at the end.
  const s = SHOTS[id - 1], pf = toPlan(id, f), A = (a: Act) => actor(cam, s, t, a, out), walk = (sp = 1.1) => (t * sp) % 1;
  const [hx, hz] = at(HUT, 0, 0), PLY = 0.45;
  switch (id) {
    case 1: { // night rain: the father walks off left without an umbrella; the family watches from the doorway
      if (pf >= 40 && pf < 150) { const u = (pf - 40) / 110; A({ role: "father", x: hx - 0.6 - 4.2 * u, z: hz + 4.6 + 1.0 * u, mode: "stroll", phase: walk(0.95), back: true }); }
      if (pf >= 40) {
        A({ role: "mother", x: hx - 0.2, y: PLY, z: hz + 2.75, expr: "tired" });
        A({ role: "nusrat", x: hx + 0.45, y: PLY, z: hz + 2.8, expr: "worried", facing: -1 });
        A({ role: "rahat", x: hx - 0.88, y: PLY, z: hz + 2.85, expr: "worried", facing: 1 });
        A({ role: "mim", x: hx + 0.12, y: PLY, z: hz + 3.05, expr: "crying" });
      }
      break;
    }
    case 2: { // the mother carries the water pot and Mim on her hips; Nusrat reads on the porch; Rahat plays with a stick
      if (pf < 345) { const u = clamp01((pf - 270) / 75); hipCarry(cam, s, t, -4.8 + 4.8 * u, 9.2 - 3.2 * u, "stroll", walk(0.9), out); }
      else hipCarry(cam, s, t, COURT[0], COURT[2], "stand", 0, out);
      const [px, py, pz] = S2_POS.porch, [rx, , rz] = S2_POS.rahat;
      A({ role: "nusrat", x: hx + px, y: py, z: hz + pz, mode: "sit", pose: "read", expr: "gentle" });
      A({ role: "rahat", x: rx, z: rz, pose: "stick", poseT: t, expr: "smile", facing: -1 });
      break;
    }
    case 3: { const [x, z] = at(DHEKI, 0, 0.05); A({ role: "mother", x, z, pose: "husk", poseT: t * 0.75, expr: "tired", facing: 1 }); break; }
    case 4: { const [x, z] = at(WELL, -0.61, 0.85); A({ role: "mother", x, z, pose: "water", expr: "tired", facing: 1 }); break; }
    case 5: {
      const [ix, iz] = at(INT, 0, 0);
      A({ role: "mother", x: ix - 0.56, z: iz + 0.55, mode: "sit", pose: "sew", poseT: t * 0.6, expr: "tired", facing: 1 }); // left of the pillow line of S5a
      A({ role: "nusrat", x: ix + 0.3, z: iz - 0.62, mode: "sit", pose: "write", poseT: t, prop: false, expr: "determined" });
      A({ role: "rahat", x: ix + 1.22, y: 0.72, z: iz - 1.38, sleep: true }); // head-only cards, rolled onto the pillow
      A({ role: "mim", x: ix + 1.72, y: 0.7, z: iz - 1.36, sleep: true });
      break;
    }
    case 6: {
      const [ix, iz] = at(INT, 0, 0);
      A({ role: "nusrat", x: ix - 0.45, z: iz - 0.6, expr: "softsad", facing: 1 });
      A({ role: "rahat", x: ix + 0.05, z: iz - 0.65, mode: "sit", pose: "eat", poseT: t * 0.8, prop: false, expr: "gentle" });
      A({ role: "mim", x: ix + 0.42, z: iz - 0.62, mode: "sit", pose: "eat", poseT: t * 0.8 + 0.4, prop: false, expr: "gentle" });
      A({ role: "mother", x: ix + 0.5, z: iz + 0.42, mode: "sit", expr: "softsad", facing: -1 }); // front-right corner: in the plates frame, out of the line to Nusrat's close-up
      break;
    }
    case 7: {
      const [ix, iz] = at(INT, 0, 0);
      A({ role: "nusrat", x: ix - 0.32, z: iz - 0.62, mode: "sit", pose: "write", poseT: t, prop: false, expr: "determined" });
      A({ role: "rahat", x: ix + 0.12, z: iz - 0.66, mode: "sit", pose: "write", poseT: t + 0.3, prop: false, expr: "determined" });
      A({ role: "mim", x: ix + 0.52, z: iz - 0.6, mode: "sit", pose: "write", poseT: t + 0.6, prop: false, expr: "gentle" });
      A({ role: "mother", x: ix - 1.25, z: iz + 0.25, mode: "sit", pose: "sew", poseT: t * 0.6, expr: "tired" });
      break;
    }
    case 8: { // the bangle stall: her gold bangles lie on the counter; the seller counts notes into her palm
      const [sx, sz] = at(STALL, 0, 0);
      if (pf < N7 + 2172) A({ role: "seller", x: sx + 0.22, z: sz - 0.48, pose: "notes", facing: -1, expr: "gentle", force: true }); // the close-up draws both their hands
      if (pf < N7 + 2172) A({ role: "mother", x: sx - 0.4, z: sz + 0.44, pose: "key", prop: false, facing: 1 }); // out of the counter close-up (she stands over the lens)
      break;
    }
    case 9: break; // the college form: a hands close-up on the table (inserts.ts)
    case 10: { // farewell (old 9): hand in hand, both crying; the money from her anchal (hands insert); then the mother alone as the bus leaves
      const [bx, bz] = at(BUS_STOP, 0, 0), ins = pf >= 1982 && pf < 2087;
      if (pf < 2152) {
        A({ role: "mother", x: bx + 0.34, z: bz + 0.2, pose: ins ? "none" : "holdhand", facing: -1, expr: "crying" });
        A({ role: "nusrat", x: bx - 0.34, z: bz + 0.12, pose: ins ? "none" : "holdhand", facing: 1, expr: "crying" });
      } else A({ role: "mother", x: bx, z: bz, expr: "crying" });
      break;
    }
    case 11: { const u = clamp01((pf - 2190) / 140); A({ role: "nusrat", x: STREET[0] + 0.3, z: STREET[2] + 10 - 4 * u, mode: "stroll", phase: walk(1), expr: "worried" }); break; }
    case 12: { // the mess: Nusrat writing, Rahat rubbing his eye, tired
      const [mx, mz] = at(MESS, 0, 0);
      A({ role: "nusrat", x: mx - 0.25, y: 0.45, z: mz - 1.85, mode: "sit", pose: "write", poseT: t, expr: "resolute", facing: 1 });
      A({ role: "rahat", x: mx + 0.36, y: 0.45, z: mz - 1.82, mode: "sit", pose: "rub", expr: "tired", facing: -1 });
      break;
    }
    case 13: { const u = clamp01((pf - 2450) / 130); A({ role: "rahat", x: STREET[0] + 0.2, z: STREET[2] + 26 + 5 * u, mode: "stroll", phase: walk(1.1), expr: "tired" }); break; }
    case 14: case 18: { // Mim shows her marks (old 13, split round the three-at-work cuts)
      const [cx, cz] = at(COURT, 0, 0);
      A({ role: "mother", x: cx + 0.3, z: cz + 0.1, facing: -1, expr: "tearsmile" });
      A({ role: "mim", x: cx - 0.45, z: cz + 0.2, pose: "paper", facing: 1, expr: "smile" });
      break;
    }
    case 15: { // "তিন জনই জানতো": Nusrat writing at the mess, focused
      const [mx, mz] = at(MESS, 0, 0);
      const r = f - s.a, up = r >= 20 && r < 31; // writing, a glance up with a small tired smile, back to the page
      A({ role: "nusrat", x: mx - 0.25, y: 0.45, z: mz - 1.85, mode: "sit", pose: up ? "write" : "scribble", poseT: t * 2.2, expr: up ? "gentle" : "focused", force: true, facing: 1 });
      break;
    }
    case 16: { // Rahat at the computer-shop counter at night, typing
      const [sx, sz] = at(SHOP, 0, 0);
      const r = f - s.a, rub = r >= 16 && r < 27; // typing, one rub of the eyes, typing again
      A({ role: "rahat", x: sx + 0.02, y: 0.5, z: sz - 0.55, mode: "sit", pose: rub ? "rub" : "type", poseT: t * 1.5, prop: false, expr: rub ? "tired" : "focused", force: true });
      break;
    }
    case 17: { // Mim studying at the lamp, her textbook open; the mother sewing beside her
      const [ix, iz] = at(INT, 0, 0);
      A({ role: "mim", x: ix + 0.1, z: iz - 0.62, mode: "sit", pose: "read", expr: "focused", force: true });
      A({ role: "mother", x: ix - 0.62, z: iz - 0.42, mode: "sit", pose: "sew", poseT: t * 1.8, expr: "gentle", force: true, facing: 1 }); // the needle hand keeps moving
      break;
    }
    case 19: A({ role: "nusrat", x: BANK[0], z: BANK[2], expr: "smile" }); break;
    case 20: { // the engineer: Rahat at the CAD screen, lanyard on (the caliper is a hands insert)
      const [ox, oz] = at(OFFICE, 0, 0);
      A({ role: "rahat", x: ox + 0.15, y: 0.47, z: oz - 0.58, mode: "sit", pose: "write", poseT: t * 1.6, prop: false, facing: -1, lanyard: "#2f5f8a" });
      break;
    }
    case 21: { const u = clamp01((pf - 2880) / 180); A({ role: "mim", x: MED_GATE[0] + 0.4 * u, z: MED_GATE[2] - 1.5 + 4 * u, mode: "stroll", phase: walk(1), expr: "proud" }); break; }
    case 22: A({ role: "nusrat", x: ROOF[0], y: ROOF[1], z: ROOF[2], pose: "phone", facing: 1, expr: "smile" }); break;
    case 23: A({ role: "mother", x: COURT[0], z: COURT[2], pose: "phone", facing: 1, expr: pf < 3290 ? "worried" : "moved" }); break;
    case 24: {
      if (pf < 3560) {
        const zc = 78 - 0.045 * (pf - 3360);
        A({ role: "nusrat", x: 2.15, z: zc + 3.5, mode: "stroll", phase: walk(1.15), expr: "smile" });
        A({ role: "mim", x: 3.0, z: zc + 3.5, mode: "stroll", phase: walk(1.15) + 0.6, expr: "smile" });
        A({ role: "rahat", x: 3.85, z: zc + 3.5, mode: "stroll", phase: walk(1.15) + 0.3, expr: "smile" });
      } else {
        // walk in along the court camera's line of sight (the gate itself is out of its narrow frame)
        const u = clamp01((pf - 3560) / 130), x = -0.15 - 0.55 * u, z = 10.8 - 2.3 * u;
        A({ role: "mother", x: COURT[0] - 0.6, z: COURT[2] + 0.6, facing: 1, expr: "tearsmile" });
        A({ role: "nusrat", x: x - 0.4, z, mode: "stroll", phase: walk(1.1), expr: "proud" });
        A({ role: "rahat", x: x + 0.45, z: z + 0.5, mode: "stroll", phase: walk(1.1) + 0.3, expr: "smile" });
        A({ role: "mim", x: x + 0.05, z: z + 0.9, mode: "stroll", phase: walk(1.1) + 0.6, expr: "proud" });
      }
      break;
    }
    case 25: { // the needle taken from her hand (insert), then Rahat drops the key into her palm; she has a tear
      const [cx, cz] = at(COURT, 0, 0), sew = pf < 3713;
      A({ role: "rahat", x: cx + 0.55, z: cz + 0.15, pose: sew ? "none" : "key", poseT: t, facing: -1, expr: "smile" });
      A({ role: "mother", x: cx - 0.3, z: cz, pose: sew ? "none" : "key", prop: false, facing: 1, expr: "tearsmile" });
      A({ role: "nusrat", x: cx + 1.3, z: cz + 0.6, expr: "proud", facing: -1 });
      A({ role: "mim", x: cx - 1.2, z: cz + 0.8, expr: "proud", facing: 1 });
      break;
    }
    case 26: { // the family hug (Nusrat: "তুমি আমাদের সবকিছু ছিলে"): one card, heads touching
      const [cx, cz] = at(COURT, 0, 0);
      groupHug(cam, s, t, cx, cz + 0.1, out);
      break;
    }
    case 27: // the rain finale: only the mother at the lit door, under the veranda (the kids are inside)
      A({ role: "mother", x: hx - 0.2, y: PLY, z: hz + 2.75, expr: "gentle" });
      break;
    case 28: bedMother(cam, s, f, out); break;
  }
};

/** shot 21: the four of them in one embrace (toon.ts familyHug) */
const groupHug = (cam: CamInfo, s: ShotDef, t: number, x: number, z: number, out: Stage) => {
  const M = villagerOf("mother", s.era), N = villagerOf("nusrat", s.era), Mi = villagerOf("mim", s.era), R = villagerOf("rahat", s.era), light = light2D(cam, false);
  const scale = M.scale / FAMILY_HUG_S, d = cam.pos.distanceTo(tmp.set(x, 1.0, z)) / scale, [w, h, k] = tier(d * 0.6);
  const vo = (role: Role, expr: Expr): VOpts => ({ expr: moodOf(role, t) ?? expr, blink: lidAt(t, ROLE_I[role]), light });
  const om = vo("mother", "tearsmile"), on = vo("nusrat", "gentle"), omi = vo("mim", "gentle"), or = vo("rahat", "gentle");
  out.places.push({ key: `FH|${s.era}|${fkey(om)}|${fkey(on)}|${fkey(omi)}|${fkey(or)}`, x, y: 0, z, scale, draw: (p) => familyHug(p, M.v, N.v, Mi.v, R.v, om, on, omi, or), size: [w, h, k] });
  for (const dx of [-0.5, 0, 0.5]) blob(out, x + dx, 0, z, M.scale);
};

/** shot 5: drops from the roof into the steel pot (on the drip kicks and between), ripple rings, the lamp's pool behind */
const DRIPS = [28.4, 30.1, 32.0]; // land on the sound's drips and the camera kicks (frames 852, 903, 960)
const FALL = 0.38, ROOF_Y = 0.85; // the drop enters at the top of the pot close-up (it sees ~0.6 m above the pot) and falls in ~11 frames
/** ripple on the pot water: thick enough to read at pot scale (the rain ring is drawn for puddles) */
const potRing = (p: Pen, u: number) => {
  const g = p.g;
  for (let k = 0; k < 2; k++) { const v = u - k * 0.28; if (v <= 0 || v >= 1) continue; g.beginPath(); g.ellipse(150, 150, 20 + 125 * v, 20 + 125 * v, 0, 0, Math.PI * 2); g.strokeStyle = k ? "rgba(200,218,236,0.55)" : "rgba(232,242,252,0.9)"; g.lineWidth = 12 * (1 - v) + 4; g.stroke(); }
};
/** a round blue-grey water drop with a small highlight and a thin dark rim */
const dropDraw = (p: Pen) => {
  const g = p.g;
  g.beginPath(); g.moveTo(64, 14); g.quadraticCurveTo(70, 46, 96, 78); g.arc(64, 84, 34, -0.18, Math.PI + 0.18); g.quadraticCurveTo(58, 46, 64, 14); g.closePath();
  g.fillStyle = "#8ea6bd"; g.fill(); g.lineWidth = 5; g.strokeStyle = "rgba(40,52,70,0.7)"; g.stroke();
  g.fillStyle = "rgba(240,248,255,0.9)"; g.beginPath(); g.ellipse(52, 76, 8, 12, -0.4, 0, Math.PI * 2); g.fill();
};
const lampPool = (p: Pen) => {
  const g = p.g, gr = g.createRadialGradient(128, 64, 4, 128, 64, 124);
  gr.addColorStop(0, "rgba(255,196,120,0.42)"); gr.addColorStop(1, "rgba(255,196,120,0)");
  g.save(); g.scale(1, 0.5); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill(); g.restore();
};
const dripFx = (id: number, t: number, out: Stage) => {
  if (id !== 5) return;
  const px = INT[0] + 1.1, pz = INT[2] + 0.8, wy = 0.15; // the water level in the pot (build.ts v_potWater2)
  for (const tk of DRIPS) {
    if (t >= tk - FALL && t < tk) { // falling: y from the roof to the water under gravity
      const e = (t - (tk - FALL)) / FALL;
      out.fx.push({ key: "drip2", cw: 128, ch: 128, draw: dropDraw, x: px, y: wy + 0.025 + (ROOF_Y - wy) * (1 - e * e), z: pz, w: 0.05, h: 0.05, soft: true });
    }
    if (t >= tk && t < tk + 1.2) { // ripple ring on the water
      const u = q((t - tk) / 1.2, 30);
      out.fx.push({ key: `potring${u}`, cw: 300, ch: 300, draw: (p) => potRing(p, u), x: px, y: wy + 0.012, z: pz, w: 0.27, h: 0.27, flat: true, soft: true });
    }
    if (t >= tk && t < tk + 0.32) { // two or three splash droplets thrown up and out
      const u = (t - tk) / 0.32;
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + 0.4, d = 0.03 + 0.05 * u;
        out.fx.push({ key: "splash2", cw: 128, ch: 128, draw: dropDraw, x: px + Math.cos(a) * d, y: wy + 0.01 + 0.09 * Math.sin(Math.PI * u) * (1 - 0.25 * k), z: pz + Math.sin(a) * d, w: 0.022, h: 0.022, soft: true });
      }
    }
  }
  out.fx.push({ key: "lampPool", cw: 256, ch: 128, draw: lampPool, x: INT[0] + 1.35, y: 0.012, z: INT[2] + 0.2, w: 1.9, h: 1.1, flat: true, soft: true, rot: -0.5 }); // behind the pot from S5b
};

// ---------------- rain on the ground: dark puddles with drop rings (shots with rain: true) ----------------
/** a puddle reflecting the night sky: translucent, soft edge, a pale sheen (drawn on the soft, see-through fx material) */
const puddleNight = (p: Pen) => {
  const g = p.g, gr = g.createRadialGradient(150, 75, 10, 150, 75, 142);
  gr.addColorStop(0, "rgba(160,178,210,0.42)"); gr.addColorStop(0.7, "rgba(150,168,200,0.3)"); gr.addColorStop(1, "rgba(150,168,200,0)");
  g.save(); g.scale(1, 0.42); g.fillStyle = gr; g.beginPath(); g.arc(150, 75 / 0.42, 142, 0, Math.PI * 2); g.fill(); g.restore();
  g.fillStyle = "rgba(200,214,236,0.35)"; g.beginPath(); g.ellipse(120, 62, 64, 7, -0.05, 0, Math.PI * 2); g.fill();
};
const rainRing = (p: Pen, u: number) => {
  const g = p.g;
  for (let k = 0; k < 2; k++) {
    const v = u - k * 0.3;
    if (v <= 0 || v >= 1) continue;
    g.beginPath(); g.ellipse(150, 150, 18 + 120 * v, 18 + 120 * v, 0, 0, Math.PI * 2);
    g.strokeStyle = k ? "rgba(190,206,230,0.45)" : "rgba(214,226,244,0.75)"; g.lineWidth = 2.2 * (1 - v) + 1.1; g.stroke();
  }
};
const rainFx = (id: number, t: number, out: Stage) => {
  const s = SHOTS[id - 1];
  if (!s.rain) return;
  const town = s.place === "town", [x0, x1, z0, z1] = town ? [STREET[0] - 3.6, STREET[0] + 3.6, STREET[2] + 22, STREET[2] + 38] : [HUT[0] - 3.4, HUT[0] + 3.8, HUT[2] + 3.6, HUT[2] + 11];
  const y = town ? 0.035 : 0.03;
  for (let i = 0; i < 6; i++) {
    const x = x0 + (x1 - x0) * hh(i, 21), z = z0 + (z1 - z0) * hh(i, 22), w = 0.7 + 1.0 * hh(i, 23);
    out.fx.push({ key: "puddleN2", cw: 300, ch: 150, draw: puddleNight, x, y, z, w, h: w * 0.5, flat: true, rot: hh(i, 24) * 3, soft: true });
    for (let k = 0; k < 1; k++) {
      const u = q((t * 1.4 + hh(i, 25 + k) + k * 0.5) % 1, 30);
      out.fx.push({ key: `rring2${u}`, cw: 300, ch: 300, draw: (p) => rainRing(p, u), x: x + (hh(i, 27 + k) - 0.5) * w * 0.4, y: y + 0.004, z: z + (hh(i, 29 + k) - 0.5) * w * 0.2, w: w * 0.45, h: w * 0.45, flat: true, soft: true });
    }
  }
  for (let i = 0; i < 10; i++) { // drops landing outside the puddles
    const u = q((t * 1.9 + hh(i, 31)) % 1, 30), x = x0 + (x1 - x0) * hh(i, 32), z = z0 + (z1 - z0) * hh(i, 33);
    out.fx.push({ key: `rring2${u}`, cw: 300, ch: 300, draw: (p) => rainRing(p, u), x, y: y + 0.002, z, w: 0.28, h: 0.28, flat: true, soft: true });
  }
};

// ---------------- expressions keyed to the voice (public/maayer/sentences.json, start times in s) ----------------
const SENT: number[] = [0,3.16,6.02,9.54,14.94,19.27,21.82,27.18,31.57,36.22,39.22,42.08,46.6,48.99,50.9,54.16,57.18,59.39,63.37,67.77,71.58,75.84,78.2,83.55,86.25,89.7,92.25,97.75,100.71,103.69,108.19,110.75,113.19,116.5,119.07,123.97,127.33,130.53,134.39,138.13,142.42,144.43,148.71,151.14,154.21,158.58,163.22,165.11,167.39,172.75];
/** the sentence playing at t (changes land LEAD = 2 frames before the sentence starts) */
const sentAt = (t: number) => { let i = 0; while (i + 1 < SENT.length && t + LEAD >= SENT[i + 1]) i++; return i; };
type Mood = Partial<Record<Role | "kids", Expr>>;
/** [first sentence, last sentence, faces]; the first matching row wins, so the specific rows come first */
const MOOD: [number, number, Mood][] = [
  [0, 1, { mim: "worried_tear", mother: "worried", kids: "worried" }],
  [2, 4, { mother: "tired" }],
  [8, 8, { mother: "resolute", kids: "sleepy" }],
  [5, 7, { mother: "resolute" }],
  [10, 10, { mother: "forced", kids: "worried" }],
  [9, 11, { mother: "softsad", kids: "worried" }],
  [15, 16, { nusrat: "determined" }],
  [12, 14, { nusrat: "worried" }],
  [17, 19, { mother: "gentle", kids: "gentle" }],
  [22, 22, { mother: "proudsad", nusrat: "tearful" }],
  [20, 21, { mother: "proudsad" }],
  [27, 29, { mim: "proud", mother: "tearsmile", kids: "resolute" }], // Mim shows her marks
  [23, 26, { mother: "resolute", kids: "resolute" }],
  [30, 33, { mother: "proud", kids: "proud" }],
  [34, 34, { nusrat: "proud", mother: "gentle" }],
  [35, 35, { nusrat: "proud", mother: "laughopen" }],
  [36, 36, { mother: "tearful" }],
  [37, 41, { mother: "proud", kids: "proud" }],
  [42, 43, { mother: "tearquiet", kids: "gentle" }],
  [44, 46, { mother: "tearsmile", nusrat: "tearsmile", kids: "gentle" }],
  [47, 48, { mother: "gentle", kids: "gentle" }],
  [49, 49, { mother: "sleepy" }],
];
const moodOf = (role: Role, t: number): Expr | undefined => {
  if (role === "father" || role === "seller") return undefined;
  const i = sentAt(t);
  for (const [a, b, m] of MOOD) if (i >= a && i <= b) { const e = m[role] ?? (role !== "mother" ? m.kids : undefined); if (e) return e; }
  return undefined;
};

/** shot 2: the mother with the water pot and Mim on her hips (toon.ts motherWithChild) */
const hipCarry = (cam: CamInfo, s: ShotDef, t: number, x: number, z: number, mode: VOpts["mode"], phase: number, out: Stage) => {
  const M = villagerOf("mother", s.era), C = villagerOf("mim", s.era), light = light2D(cam, false);
  const d = cam.pos.distanceTo(tmp.set(x, 1.0, z)) / M.scale, [w, h, k] = tier(d);
  const om: VOpts = { mode, phase: q(phase, 120), expr: moodOf("mother", t) ?? "tired", blink: lidAt(t, ROLE_I.mother), light };
  const oc: VOpts = { expr: moodOf("mim", t) ?? "smile", blink: lidAt(t, ROLE_I.mim), light };
  out.places.push({ key: `MC|${s.era}|${fkey(om)}|${fkey(oc)}`, x, y: 0, z, scale: M.scale, draw: (p) => motherWithChild(p, M.v, C.v, om, oc), size: [w, h, k] });
  blob(out, x, 0, z, M.scale);
};
/** shot 3: the hurricane lantern hanging over the dheki: its flame and a warm light falling on her */
const lanternFlame = (p: Pen) => {
  const g = p.g, gr = g.createRadialGradient(32, 80, 2, 32, 70, 40);
  gr.addColorStop(0, "rgba(255,250,220,1)"); gr.addColorStop(0.5, "rgba(255,190,90,0.95)"); gr.addColorStop(1, "rgba(255,150,60,0)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 10); g.quadraticCurveTo(58, 80, 32, 118); g.quadraticCurveTo(6, 80, 32, 10); g.fill();
};
const warmGlow = (p: Pen) => {
  const g = p.g, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,196,120,0.34)"); gr.addColorStop(0.5, "rgba(255,180,100,0.16)"); gr.addColorStop(1, "rgba(255,170,90,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
};
const lanternFx = (id: number, out: Stage) => {
  if (id !== 3) return;
  const [dx, , dz] = DHEKI;
  out.fx.push({ key: "lanternFlame", cw: 64, ch: 128, draw: lanternFlame, x: dx + 0.45, y: 1.6, z: dz - 0.5, w: 0.04, h: 0.08, soft: true });
  out.fx.push({ key: "lanternGlow", cw: 256, ch: 256, draw: warmGlow, x: dx + 0.2, y: 1.2, z: dz + 0.35, w: 2.6, h: 2.6, soft: true });
};

/** shot 28: in bed in the new house: she smiles (a tear), wipes it at the outer corner of her eye (~20 f), smiles, and
 *  her eyes close by 173.9 s. Head and shoulders on the pillows; the quilt (3D) covers the rest. */
const bedMother = (cam: CamInfo, s: ShotDef, f: number, out: Stage) => {
  const { v, scale } = villagerOf("mother", s.era), r = f - s.a;
  const wipe = q(clamp01((r - 14) / 22), 44), close = clamp01((r - 36) / 9);
  const expr: Expr = r >= 45 ? "sleepsmile" : r < 24 ? "tearsmile" : "gentle";
  const vo: VOpts = { expr, blink: r >= 45 ? 0 : q(close, 20), light: light2D(cam, false), facing: 0 };
  const rl = Math.hypot(cam.right.x, cam.right.z) || 1, dx = (300 - BED_PIVOT[0]) * SU * scale; // upright card; the figure lies inside it, head at BED_PIVOT
  const ox = BED_HEAD[0] + (cam.right.x / rl) * dx, oz = BED_HEAD[2] + (cam.right.z / rl) * dx, oy = BED_HEAD[1] - (975 - BED_PIVOT[1]) * SU * scale;
  const d = cam.pos.distanceTo(tmp.set(BED_HEAD[0], BED_HEAD[1], BED_HEAD[2])) / scale, [w, h, k] = tier(d * 0.7);
  out.places.push({ key: `BED|${fkey(vo)}|${wipe}`, x: ox, y: oy, z: oz, scale, draw: (p) => bedRest(p, v, vo, wipe), size: [w, h, k] });
};

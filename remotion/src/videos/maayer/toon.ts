// Our own flat 2D cartoon cast (riflemen, officer, townsfolk, kid, parent) + 2D effects, drawn on a canvas.
// Construction v2 (characters.md, our own cast): superellipse heads (pointed crown 1.75 / full jaw 2.3, chin taper,
// seeded side bulge + tilt), bean torsos, single-stroke limbs with ink-dot hands, a thick-thin plum outline weighted
// away from the light, soft painted crescents, deadpan lidded eyes, no blush, no catchlights.
// Design space 600 x 1000 units (soles at y = 975); the canvas transform scales it.
export const INK = "#241726";
export const SKIN = "#ffe2c2";
const WHITE = "#ffffff";
const MOUTH = "#5a1e28";
const TONGUE = "#e86e78";
type C3 = [number, number, number];
const SH_SKIN: C3 = [0.96, 0.86, 0.84]; // measured shadow/lit ratio on skin heads
const SH_CLOTH: C3 = [0.64, 0.66, 0.74]; // torsos: lit side -> far side ~0.65
const SH_FELT: C3 = [0.62, 0.62, 0.7];

export type Build = "adult" | "stout" | "kid" | "teen";
export type Outfit = {
  jacket: string; pants: string; boots: string; hat?: string | null; belt?: string | null; buttons?: string; rifle?: boolean;
  sash?: string; sword?: boolean; moustache?: string; skin?: string; head?: number; cap?: string; hair?: string; dress?: string;
  build?: Build;
};
type P2 = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const mul = (c: string, m: C3) => {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number, k: number) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255, m[0])}${ch((n >> 8) & 255, m[1])}${ch(n & 255, m[2])}`;
};
export const shade = (c: string, k: number) => mul(c, [k, k, k]);
export const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};
/** deterministic per-character random in [0, 1) */
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const rotPts = (pts: P2[], a: number, cx: number, cy: number): P2[] =>
  pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const rotAbout = (q: P2, a: number, c: P2): P2 => rotPts([q], a, c[0], c[1])[0];
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** smooth curve from a through (near) k to b, as a polyline */
const curve = (a: P2, k: P2, b: P2, n = 10): P2[] => {
  const c: P2 = [2 * k[0] - (a[0] + b[0]) / 2, 2 * k[1] - (a[1] + b[1]) / 2], out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return out;
};

export const RIFLEMAN: Outfit = { jacket: "#357650", pants: "#3d4440", boots: INK, hat: "shako", belt: "#f1efe6", buttons: "#d9dde0", rifle: true };
export const OFFICER: Outfit = { ...RIFLEMAN, hat: "shako_tall", buttons: "#e8c45a", sash: "#c0353a", sword: true, moustache: "#4a3020", rifle: false, belt: null, build: "stout" };
export const KID: Outfit = { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "cap", cap: "#e2453c", build: "kid" };
export const PARENT: Outfit = { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#5a3b2a" };
export const SKINS = [SKIN, "#f5c9a0", "#ecd0b6", "#c99067"];

export const soldier = (v = 0, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { ...RIFLEMAN, skin: SKINS[v % 4] };
  if (v % 4 === 1) o.moustache = "#4a3426";
  if (v % 4 === 3) o.moustache = "#2a201a";
  return { ...o, ...extra };
};

export const townsfolk = (v = 0): Outfit => {
  const coats = ["#3f6fb5", "#8c3b4a", "#5d7a3a", "#b5653f", "#2f5f6a", "#7b5ac9"];
  const o: Outfit = { jacket: coats[v % 6], pants: "#3b3f52", boots: "#4a3426", skin: SKINS[v % 4] };
  return v % 2 ? { ...o, hat: "bonnet", dress: ["#d9a441", "#c25a7a", "#5a8fc2"][v % 3] } : { ...o, hat: "tophat" };
};

export class Pen {
  g: CanvasRenderingContext2D;
  ol = 12;
  /** [angle, cx, cy] rotation about (cx, cy), optional post-translation [.., dx, dy] */
  rot: number[] | null = null;
  constructor(g: CanvasRenderingContext2D) { this.g = g; }
  P(x: number, y: number): P2 {
    if (!this.rot) return [x, y];
    const r = this.rot, a = r[0], cx = r[1], cy = r[2], dx = r.length > 3 ? r[3] : 0, dy = r.length > 4 ? r[4] : 0, c = Math.cos(a), s = Math.sin(a);
    return [cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy];
  }
  path(pts: P2[], close: boolean) {
    const g = this.g;
    g.beginPath();
    pts.forEach((p, i) => { const [x, y] = this.P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    if (close) g.closePath();
  }
  /** filled shape with an ink outline; fill=null draws the outline only */
  poly(pts: P2[], fill: string | null, ol?: number) {
    const g = this.g, w = ol ?? this.ol;
    this.path(pts, true);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); }
  }
  ell(cx: number, cy: number, rx: number, ry: number, fill: string | null, ol?: number, a0 = 0, a1 = 360, rot = 0) {
    this.poly(ellPts(cx, cy, rx, ry, a0, a1, rot), fill, ol);
  }
  /** thick round-capped limb with an ink rim (effects, rope) */
  line(pts: P2[], fill: string, w: number, ink = true) {
    const g = this.g;
    g.lineCap = "round"; g.lineJoin = "round";
    if (ink) { this.path(pts, false); g.strokeStyle = INK; g.lineWidth = w + 2 * this.ol * 0.9; g.stroke(); }
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  }
  stroke(pts: P2[], w: number, fill = INK) {
    const g = this.g;
    g.lineCap = "round"; g.lineJoin = "round";
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  }
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, fill = INK) {
    const pts: P2[] = [];
    for (let i = 0; i <= 24; i++) pts.push([cx + rx * Math.cos(rad(a0 + ((a1 - a0) * i) / 24)), cy + ry * Math.sin(rad(a0 + ((a1 - a0) * i) / 24))]);
    this.stroke(pts, w, fill);
  }
  dot(cx: number, cy: number, r: number, fill = INK) {
    const [x, y] = this.P(cx, cy);
    this.g.beginPath(); this.g.arc(x, y, r, 0, Math.PI * 2); this.g.fillStyle = fill; this.g.fill();
  }
  /** draw with a closed shape as clip */
  clip(pts: P2[], fn: () => void) { const g = this.g; g.save(); this.path(pts, true); g.clip(); fn(); g.restore(); }
  /** flat fill + soft crescent on the side away from the light (light = canvas angle the light comes FROM).
   *  Radial ramp centred `shift` R toward the light: flat out to ~0.6 R on the far side, full shadow by ~0.8 R. */
  shadedFill(pts: P2[], base: string, shadow: string, light: number, R: number, shift = 0.45, r0 = 1.05, r1 = 1.25) {
    const g = this.g, n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    const [gx, gy] = this.P(cx + Math.cos(light) * shift * R, cy + Math.sin(light) * shift * R);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r1 * R);
    gr.addColorStop(0, base); gr.addColorStop(r0 / r1, base); gr.addColorStop(1, shadow);
    this.path(pts, true); g.fillStyle = gr; g.fill();
  }
  /** broad gradient across a shape along the light: lit edge = base, far edge = shadow (torsos, coats) */
  gradFill(pts: P2[], base: string, shadow: string, light: number, flat = 0.22) {
    const g = this.g, dx = Math.cos(light), dy = Math.sin(light), n = pts.length;
    let cx = 0, cy = 0, lo = Infinity, hi = -Infinity;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; const d = x * dx + y * dy; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const dc = cx * dx + cy * dy;
    const [ax, ay] = this.P(cx + dx * (hi - dc), cy + dy * (hi - dc)), [bx, by] = this.P(cx + dx * (lo - dc), cy + dy * (lo - dc));
    const gr = g.createLinearGradient(ax, ay, bx, by);
    gr.addColorStop(0, base); gr.addColorStop(flat, base); gr.addColorStop(1, shadow);
    this.path(pts, true); g.fillStyle = gr; g.fill();
  }
  /** thick-thin ink ring: w(θ) = w0 (1 + k cos(θ − thick)), θ from the contour centroid (canvas angles) */
  inkRing(pts: P2[], w0: number, thick: number, k = 0.45, col = INK) {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    const out: P2[] = [], inn: P2[] = [];
    pts.forEach((q, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      let nx = b[1] - a[1], ny = a[0] - b[0]; // outward normal for clockwise-on-screen contours
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const h = 0.5 * w0 * (1 + k * Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - thick));
      out.push([q[0] + nx * h, q[1] + ny * h]); inn.push([q[0] - nx * h, q[1] - ny * h]);
    });
    const g = this.g;
    const trace = (r: P2[]) => { r.forEach(([x0, y0], i) => { const [x, y] = this.P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
    g.beginPath(); trace(out); trace(inn.reverse());
    g.fillStyle = col; g.fill("evenodd");
  }
  /** flat strap with a thin ink rim (cross belts, sash, rifle, handles) */
  band(pts: P2[], fill: string, w: number, rim: number, cap: CanvasLineCap = "butt") {
    const g = this.g; g.lineCap = cap; g.lineJoin = "round";
    this.path(pts, false); g.strokeStyle = INK; g.lineWidth = w + 2 * rim; g.stroke();
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
    g.lineCap = "round";
  }
}

const ellPts = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0, n = 48): P2[] => {
  const r = rad(rot), pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
};

const rrect = (x0: number, y0: number, x1: number, y1: number, r: number, n = 8): P2[] => {
  const pts: P2[] = [];
  for (const [cx, cy, a] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]])
    for (let i = 0; i <= n; i++) pts.push([cx + r * Math.cos(rad(a + (90 * i) / n)), cy + r * Math.sin(rad(a + (90 * i) / n))]);
  return pts;
};

/** tapered stroke, thick end at a: brows, moustache halves */
const taper = (p: Pen, a: P2, b: P2, wa: number, wb: number, col = INK) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  p.poly([[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
    [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]], col, 0);
  p.dot(a[0], a[1], wa / 2, col); p.dot(b[0], b[1], wb / 2, col);
};

// ---------------- contours ----------------
export type Blob = { a: number; b: number; nTop: number; nBot: number; egg: number; asym: number; rot: number; noise: number; seed: number };

/** superellipse "bean": separate crown / jaw exponents, egg taper (neg = narrower chin), one-side bulge, soft noise.
 *  Points run right -> down -> left -> up (clockwise on screen). */
export const blobPts = (cx: number, cy: number, B: Blob, n = 72): P2[] => {
  const ph = [rnd(B.seed, 11), rnd(B.seed, 12), rnd(B.seed, 13)].map((v) => v * Math.PI * 2);
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? B.nTop : B.nBot);
    let X = Math.sign(c) * Math.abs(c) ** e;
    const Y = Math.sign(s) * Math.abs(s) ** e;
    X *= (1 + B.egg * Y) * (1 + B.asym * Math.sign(X));
    const r = 1 + B.noise * (Math.cos(2 * t + ph[0]) + 0.7 * Math.cos(3 * t + ph[1]) + 0.5 * Math.cos(4 * t + ph[2]));
    const x = B.a * X * r, y = B.b * Y * r;
    pts.push([cx + x * Math.cos(B.rot) - y * Math.sin(B.rot), cy + x * Math.sin(B.rot) + y * Math.cos(B.rot)]);
  }
  return pts;
};

/** measured head: H/W 0.94, slightly pointed crown (1.75), fuller jaw (2.3), chin taper -0.12, 8 % bulge to the facing side */
export const headBlob = (seed: number, a = 118, facing = 0): Blob => ({
  a, b: a * (0.94 + 0.08 * (rnd(seed, 1) - 0.5)),
  nTop: 1.75 + 0.3 * (rnd(seed, 2) - 0.5), nBot: 2.3 + 0.3 * (rnd(seed, 3) - 0.5),
  egg: -0.12 + 0.06 * (rnd(seed, 4) - 0.5),
  asym: (0.06 + 0.04 * rnd(seed, 5)) * (facing || (rnd(seed, 6) < 0.5 ? -1 : 1)),
  rot: rad(8 * (rnd(seed, 7) - 0.5)), noise: 0.008, seed,
});

/** thickest outline direction: away from the light, pulled toward the ground (64 deg measured for upper-left light) */
export const thickAngle = (light: number) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
const DEF_LIGHT = rad(-120);

// ---------------- faces ----------------
export type Expr = "neutral" | "stern" | "grin" | "laugh" | "whistle" | "nervous" | "shock" | "relief" | "relief_open" | "dazed"
  | "pained" | "smile" | "smile_closed" | "lick"
  // মায়ের অবসর: open-eyed, soft-browed family faces (the template's "lid" eyes read sleepy, its brows angry)
  | "worried" | "softsad" | "gentle" | "determined" | "asleep" | "tired" | "crying" | "moved"
  // keyed to the voice (cast.ts MOOD): all open-eyed except sleepy
  | "worried_tear" | "resolute" | "sleepy" | "forced" | "proudsad" | "tearful" | "proud" | "laughopen" | "tearquiet" | "tearsmile" | "sleepsmile" | "focused";
type EyeK = "dot" | "small" | "lid" | "slit" | "happy" | "dash" | "squeeze" | "shock" | "shockHalf" | "spiral" | "closed";
type MouthK = "dash" | "frown" | "smirk" | "smile" | "smileWide" | "grin" | "laugh" | "o" | "O" | "wave" | "teeth" | "lick" | "flat" | "wobble" | "down";
/** eyes [back, front], brows [inner, outer] offsets in u (+ = down), mouth kind */
const FACE: Record<Expr, { eye: [EyeK, EyeK]; brow: [number, number]; mouth: MouthK; tear?: boolean; bags?: boolean }> = {
  neutral: { eye: ["dot", "dot"], brow: [-1, -1], mouth: "dash" },
  stern: { eye: ["lid", "lid"], brow: [3, -2], mouth: "frown" },
  grin: { eye: ["happy", "happy"], brow: [-3, -3], mouth: "grin" },
  laugh: { eye: ["squeeze", "squeeze"], brow: [-4, -4], mouth: "laugh" },
  whistle: { eye: ["dash", "dash"], brow: [-2, -4], mouth: "o" },
  nervous: { eye: ["small", "small"], brow: [-3, 2], mouth: "wave" },
  shock: { eye: ["shock", "shock"], brow: [-7, -6], mouth: "O" },
  relief: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "smileWide" },
  relief_open: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "grin" },
  dazed: { eye: ["spiral", "spiral"], brow: [-3, 2], mouth: "wave" },
  pained: { eye: ["squeeze", "lid"], brow: [-3, 2], mouth: "teeth" },
  smile: { eye: ["dot", "dot"], brow: [0, -1], mouth: "smirk" },
  smile_closed: { eye: ["happy", "happy"], brow: [0, -1], mouth: "smile" },
  lick: { eye: ["dot", "dot"], brow: [0, -1], mouth: "lick" },
  worried: { eye: ["dot", "dot"], brow: [-4, 1], mouth: "wave" },     // inner brows up, small wavy mouth
  softsad: { eye: ["dot", "dot"], brow: [-3, 1], mouth: "frown" },    // tired, sad, gentle
  gentle: { eye: ["dot", "dot"], brow: [-1, -1], mouth: "smile" },    // a small tired smile
  determined: { eye: ["dot", "dot"], brow: [1, -1], mouth: "dash" },  // level brows, firm mouth (not angry)
  asleep: { eye: ["closed", "closed"], brow: [-1, -1], mouth: "dash" },
  tired: { eye: ["dot", "dot"], brow: [2.5, 2.5], mouth: "down", bags: true }, // open eyes, soft low brows, a small downturned mouth, eyebags
  crying: { eye: ["closed", "closed"], brow: [-4, 1], mouth: "wobble", tear: true },
  moved: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "smile", tear: true },   // a soft smile with a tear
  worried_tear: { eye: ["dot", "dot"], brow: [-4, 1], mouth: "wave", tear: true },
  resolute: { eye: ["dot", "dot"], brow: [2.5, 0.5], mouth: "down", bags: true },   // tired but determined
  sleepy: { eye: ["lid", "lid"], brow: [1, 1], mouth: "flat" },
  forced: { eye: ["dot", "dot"], brow: [-3, 1], mouth: "smile" },                    // a forced small smile over worry
  proudsad: { eye: ["dot", "dot"], brow: [-3, 0], mouth: "smile" },
  tearful: { eye: ["dot", "dot"], brow: [-4, 1], mouth: "wobble", tear: true },
  proud: { eye: ["dot", "dot"], brow: [-1, -1], mouth: "smileWide" },
  laughopen: { eye: ["dot", "dot"], brow: [-3, -3], mouth: "laugh" },
  tearquiet: { eye: ["dot", "dot"], brow: [-2, 1], mouth: "flat", tear: true },
  tearsmile: { eye: ["dot", "dot"], brow: [-2, 1], mouth: "smile", tear: true },
  sleepsmile: { eye: ["closed", "closed"], brow: [-1, -1], mouth: "smile" },
  focused: { eye: ["dot", "dot"], brow: [0.6, 0.6], mouth: "flat" },              // calm, working
};
const halfLid = (k: EyeK): EyeK => (k === "dot" || k === "small" ? "lid" : k === "lid" ? "slit" : k === "shock" ? "shockHalf" : k);
const eyeKind = (k: EyeK, lid: number): EyeK =>
  k === "closed" ? k : lid >= 1 && k !== "happy" && k !== "squeeze" && k !== "spiral" ? "dash" : lid > 0 ? halfLid(k) : k;
const lidOf = (b: boolean | number | undefined) => (b === true ? 1 : Number(b) || 0);

const eye = (p: Pen, kind: EyeK, x: number, ey: number, u: number, side: number, look: number, skin: string) => {
  const lx = x + look * 3 * u, lw = 3.8 * u;
  switch (kind) {
    case "dot": p.ell(lx, ey, 3.8 * u, 5.5 * u, INK, 0); break;
    case "small": p.ell(lx, ey, 3 * u, 4.4 * u, INK, 0); break;
    case "lid": p.ell(lx, ey - u, 7 * u, 6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey - u], [x + 9 * u, ey - u]], lw); break;
    case "slit": p.ell(lx, ey, 7 * u, 2.6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey], [x + 9 * u, ey]], lw); break;
    case "happy": p.arc(x, ey + 3 * u, 8 * u, 6 * u, 200, 340, lw); break;
    case "dash": p.stroke([[x - 8.5 * u, ey], [x + 8.5 * u, ey]], lw); break;
    case "closed": p.arc(x, ey - 2 * u, 7.5 * u, 4.5 * u, 20, 160, lw * 0.85); break; // sleeping: a soft downward tick
    case "squeeze": p.stroke([[x + 6 * u * side, ey - 5 * u], [x - 6 * u * side, ey], [x + 6 * u * side, ey + 5 * u]], lw); break;
    case "shock": case "shockHalf":
      p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u); p.dot(lx - side * 1.5 * u, ey + 1.5 * u, 3 * u);
      if (kind === "shockHalf") { p.ell(x, ey, 11 * u, 11 * u, skin, 0, 180, 360); p.stroke([[x - 11 * u, ey], [x + 11 * u, ey]], 2.6 * u); }
      break;
    default: {
      const s: P2[] = [];
      for (let t = 1; t < 15; t++) s.push([x + Math.cos(t * 0.9) * t * 0.55 * u, ey + Math.sin(t * 0.9) * t * 0.55 * u]);
      p.stroke(s, 2.4 * u);
    }
  }
};

/** open "D" mouth with a white teeth band (+ tongue) */
const dmouth = (p: Pen, mx: number, y: number, rx: number, ry: number, u: number, tongue = false) => {
  p.ell(mx, y, rx, ry, MOUTH, 0, 0, 180);
  p.clip([[mx - rx, y], [mx + rx, y], [mx + rx, y + 3 * u], [mx - rx, y + 3 * u]], () => p.ell(mx, y, rx, ry, WHITE, 0, 0, 180));
  if (tongue) p.ell(mx + 2 * u, y + 0.62 * ry, 0.4 * rx, 0.28 * ry, TONGUE, 0);
  p.ell(mx, y, rx, ry, null, 3 * u, 0, 180);
};

const mouth = (p: Pen, kind: MouthK, mx: number, my: number, u: number, k = 1) => {
  const mw = 4 * u;
  switch (kind) {
    case "dash": p.stroke([[mx - 5.5 * u * k, my], [mx + 5.5 * u * k, my - 0.8 * u]], mw); break;
    case "frown": p.arc(mx, my + 3 * u, 6.5 * u * k, 3.5 * u, 200, 340, mw); break;
    case "smirk": p.arc(mx + u, my - 3 * u, 7 * u * k, 4 * u, 10, 150, mw); break;
    case "smile": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); break;
    case "smileWide": p.arc(mx, my - 4 * u, 11 * u * k, 6 * u, 15, 165, mw); break;
    case "grin": dmouth(p, mx, my - u, 12 * u * k, 8 * u, u); break;
    case "laugh": dmouth(p, mx, my, 16 * u * k, 11 * u, u, true); break;
    case "o": p.ell(mx + 4 * u, my, 3.5 * u, 4 * u, MOUTH, 2.8 * u); break;
    case "O": p.ell(mx, my + 2 * u, 9 * u * k, 11 * u, MOUTH, 3.2 * u); break;
    case "wave": { const s: P2[] = []; for (let i = 0; i <= 12; i++) s.push([mx - 9 * u * k + i * 1.5 * u * k, my + 1.5 * u * Math.sin(i * 1.3)]); p.stroke(s, 3 * u); break; }
    case "teeth":
      p.poly([[mx - 12 * u * k, my - 4 * u], [mx + 12 * u * k, my - 4 * u], [mx + 11 * u * k, my + 4 * u], [mx - 11 * u * k, my + 4 * u]], WHITE, 3 * u);
      for (const j of [-1, 0, 1]) p.stroke([[mx + j * 6 * u * k, my - 4 * u], [mx + j * 6 * u * k, my + 4 * u]], 1.5 * u);
      break;
    case "lick": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); p.ell(mx + 6 * u * k, my + 3 * u, 3.6 * u, 4.6 * u, TONGUE, 2.4 * u); break;
    case "flat": p.stroke([[mx - 4 * u * k, my], [mx + 4 * u * k, my]], 3.4 * u); break;
    case "down": p.arc(mx, my + 2.5 * u, 4.8 * u * k, 2.6 * u, 205, 335, 3.4 * u); break;
    case "wobble": { const s: P2[] = []; for (let i = 0; i <= 10; i++) s.push([mx - 6 * u * k + i * 1.2 * u * k, my + 1.3 * u * Math.sin(i * 1.4)]); p.stroke(s, 2.8 * u); break; }
  }
};

/** face v2 (front / 3-4). u = 1 % of the head path width W. Eyes 26u apart on the centre line, brows 20u up, mouth 20u
 *  down, everything slid toward the facing side. No blush, no catchlights. */
const faceFront = (p: Pen, cx: number, cy: number, W: number, expr: Expr, facing: number, look: number, lid: number, brim: boolean,
  skin: string, moustache?: string, stout = false) => {
  const u = W / 100, F = FACE[expr], fx = cx + 7 * u * facing;
  const ex = (F.eye[0] === "shock" ? 12 : 13) * u, ey = cy;
  for (const side of [-1, 1]) {
    const x = fx + side * ex;
    const kind = eyeKind(F.eye[(facing ? side === facing : side > 0) ? 1 : 0], lid);
    eye(p, kind, x, ey, u, side, look, skin);
    if (F.bags) p.arc(x, ey + 7.5 * u, 6 * u, 2.4 * u, 35, 145, 1.5 * u, mix(skin, INK, 0.45)); // one eyebag line
    const [dI, dO] = F.brow, by = ey - (brim ? 17 : 20) * u;
    if (kind === "shock" || kind === "shockHalf") p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 8.5 * u, by + 0.7 * dI * u], [x + side * 8.5 * u, by + 0.7 * dO * u], 3.6 * u, 1.8 * u);
  }
  if (F.tear) { // one tear under the eye on the facing side
    const tx = fx + (facing || 1) * ex + 2 * u, ty = ey + 12 * u;
    p.poly([[tx, ty - 5 * u], [tx + 3.6 * u, ty + 2 * u], [tx, ty + 5.5 * u], [tx - 3.6 * u, ty + 2 * u]], "#a9dcff", 1.4 * u);
    p.dot(tx - 1 * u, ty + 1.5 * u, 1 * u, "#ffffff");
  }
  const mx = cx + 8 * u * facing, my = cy + 20 * u;
  mouth(p, F.mouth, mx, my, u);
  if (moustache) for (const s of [-1, 1])
    taper(p, [mx + s * 1.5 * u, cy + 12.5 * u], [mx + s * (stout ? 19 : 15) * u, cy + (stout ? 10.5 : 15) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (expr === "nervous") p.ell(cx + 40 * u * (facing || 1), cy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

/** profile face (facing screen-right): one eye, brow, nose tick, mouth near the front edge; no skin bump nose, no ear */
const faceSide = (p: Pen, hx: number, hy: number, W: number, expr: Expr, lid: number, brim: boolean, skin: string, moustache?: string, stout = false) => {
  const u = W / 100, F = FACE[expr], ex = hx + 27 * u, ey = hy;
  const kind = eyeKind(F.eye[1], lid);
  eye(p, kind, ex, ey, u, 1, 0.6, skin);
  const by = ey - (brim ? 17 : 20) * u, [dI, dO] = F.brow;
  if (kind === "shock" || kind === "shockHalf") p.arc(ex, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  else taper(p, [ex + 8 * u, by + dI * u], [ex - 7 * u, by - u + dO * u], 5 * u, 2.5 * u);
  p.stroke([[hx + 44 * u, hy + 4 * u], [hx + 47.5 * u, hy + 9 * u], [hx + 43 * u, hy + 10 * u]], 3 * u);
  mouth(p, F.mouth, hx + 33 * u, hy + 21 * u, u, 0.62);
  if (moustache) taper(p, [hx + 41 * u, hy + 13.5 * u], [hx + 25 * u, hy + (stout ? 11.5 : 16) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (expr === "nervous") p.ell(hx - 30 * u, hy - 24 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

// ---------------- hats ----------------
const BONNET = "#e9cf8f", BONNET_BRIM = "#d6b46a";
/** parts of a hat that sit behind the head (bonnet) */
const hatBehind = (p: Pen, o: Outfit, H: Blob, cx: number, hc: number, light: number, thick: number, ow: number, side: boolean) => {
  if (o.hat !== "bonnet") return;
  const bb = blobPts(cx - (side ? 12 : 0) * (H.a / 50), hc - 0.07 * 2 * H.b, { ...H, a: H.a * 1.17, b: H.b * 1.13, asym: 0, egg: 0.04, seed: H.seed + 3 });
  p.shadedFill(bb, BONNET, mul(BONNET, SH_CLOTH), light, H.a * 1.17);
  p.inkRing(bb, ow * 0.85, thick);
};

const hatOn = (p: Pen, o: Outfit, hp: P2[], H: Blob, cx: number, hc: number, light: number, seed: number, facing: number, side: boolean) => {
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, crown = hc - H.b, ow = 0.85 * 5 * u;
  const a = H.rot + rad(4 * (rnd(seed, 20) - 0.5)); // tilt with the head, +-2 deg extra
  const R = (pts: P2[]) => rotPts(pts, a, cx, hc);
  const sag = (yb: number, wb: number): P2[] => {
    const base: P2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; base.push([cx + wb * (2 * t - 1), yb + 3 * u * (1 - (2 * t - 1) ** 2)]); }
    return base;
  };
  if (o.hat === "shako" || o.hat === "shako_tall") {
    const tall = o.hat === "shako_tall", yb = crown + 0.25 * HH, ht = (tall ? 0.66 : 0.56) * HH, wb = 46 * u, wt = 52 * u;
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, "#3a3d47", "#24262d", light, wt, 0.4);
    if (tall) p.clip(body, () => p.band(R([[cx - wt - 5 * u, yb - ht + 0.07 * HH], [cx + wt + 5 * u, yb - ht + 0.07 * HH]]), "#e8c45a", 0.06 * HH, 1.5 * u));
    p.poly(body, null, ow);
    const deg = (a * 180) / Math.PI;
    if (side) {
      p.poly(R([[cx + 36 * u, yb - 1 * u], [cx + 60 * u, yb + 8 * u], [cx + 34 * u, yb + 6 * u]]), "#16171b", 2.5 * u);
      const [tx, ty] = R([[cx + 24 * u, yb - ht - 6 * u]])[0];
      p.ell(tx, ty, 7 * u, 7 * u, "#2b7a4b", 2.5 * u);
    } else {
      const [px, py] = R([[cx + 3 * u * facing, yb + 3 * u]])[0];
      p.ell(px, py, 34 * u, 0.045 * HH, "#16171b", 2.5 * u, 0, 180, deg); // peak
      const [bx, by] = R([[cx, yb - 0.45 * ht]])[0];
      p.ell(bx, by, 7 * u, 6 * u, tall ? "#e8c45a" : "#c9ccd2", 2 * u, 0, 360, deg); // badge plate
      p.arc(bx, by, 3.5 * u, 2.8 * u, 200, 500, 1.6 * u);
      const [tx, ty] = R([[cx, yb - ht - 6 * u]])[0];
      p.ell(tx, ty, 7 * u, 7 * u, "#2b7a4b", 2.5 * u); // green tuft
    }
  } else if (o.hat === "cap" || o.hat === "hair") {
    const cut = crown + (o.hat === "cap" ? 0.3 : 0.42) * HH;
    const keep = (x: number, y: number) => y < cut || (side && o.hat === "hair" && x < cx - 6 * u && y < hc + 0.42 * H.b);
    // start the arc at the first kept point after a dropped one, so the kept run is contiguous and the cut closes it
    const n = hp.length, startIdx = Math.max(0, hp.findIndex(([x, y], i) => keep(x, y) && !keep(hp[(i + n - 1) % n][0], hp[(i + n - 1) % n][1])));
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([x, y]) => keep(x, y))
      .map(([x, y]) => [cx + (x - cx) * 1.03, hc + (y - hc) * 1.03] as P2);
    if (arc.length < 3) return;
    if (o.hat === "hair") { // scalloped lower edge
      const [x0, y0] = arc[arc.length - 1], [x1, y1] = arc[0];
      for (let i = 1; i < 6; i++) arc.push([x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6 + (i % 2 ? 4 * u : 0)]);
    }
    const col = o.hat === "cap" ? o.cap! : o.hair!;
    p.shadedFill(arc, col, mul(col, SH_FELT), light, H.a, 0.35);
    p.poly(arc, null, ow);
    if (o.hat === "hair") {
      const s = side ? -1 : facing || 1;
      p.stroke([[cx + s * 10 * u, cut - 30 * u], [cx + s * 2 * u, cut - 12 * u]], 1.2 * u);
    }
    if (o.hat === "cap") {
      const deg = (a * 180) / Math.PI;
      if (side) p.poly(R([[cx + 40 * u, cut - 2 * u], [cx + 74 * u, cut + 4 * u], [cx + 40 * u, cut + 6 * u]]), shade(col, 0.8), ow);
      else {
        const s = facing || (rnd(seed, 21) < 0.5 ? -1 : 1), [px, py] = R([[cx + s * 4 * u, cut + 1.5 * u]])[0];
        p.ell(px, py, 32 * u, 0.06 * HH, shade(col, 0.8), ow, 0, 180, deg);
      }
    }
  } else if (o.hat === "tophat") {
    const yb = crown + 0.22 * HH, ht = 0.8 * HH, wb = 0.31 * W, wt = 0.33 * W, col = "#2e2a36";
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, col, mul(col, SH_FELT), light, wt, 0.4);
    p.clip(body, () => p.band(R([[cx - wt - 4 * u, yb - 0.13 * HH], [cx + wt + 4 * u, yb - 0.13 * HH]]), shade(o.jacket, 0.9), 0.14 * HH, 0.8 * u));
    p.poly(body, null, ow);
    const [bx, by] = R([[cx, yb + 1 * u]])[0];
    p.ell(bx, by, 0.45 * W, 0.05 * HH, "#1d1b22", ow, 0, 360, (a * 180) / Math.PI);
  } else if (o.hat === "bonnet") {
    const [bx, by] = R([[cx + (side ? 6 * u : 0), crown + 0.16 * HH]])[0];
    p.arc(bx, by, 0.5 * W, 0.2 * HH, 200, 340, 7 * u, BONNET_BRIM);
    p.arc(bx, by, 0.5 * W + 3.5 * u, 0.2 * HH + 3.5 * u, 200, 340, 1.2 * u);
    const cy = hc + H.b * 0.98;
    p.stroke([[cx - 14 * u, cy - 4 * u], [cx, cy + 2 * u], [cx + 14 * u, cy - 4 * u]], 2 * u, BONNET_BRIM);
  }
};

// ---------------- bodies ----------------
export type Arms = [P2[], P2[]];
/** held prop; for the hammer the number is the strike 0 (raised) .. 1 (struck) */
export type Prop = null | "icecream" | "shako" | ["hammer", number];

const BUILD: Record<Build, { a: number; torso: number; legs: number; tw: number }> = {
  adult: { a: 118, torso: 1.1, legs: 1.4, tw: 0.8 },
  stout: { a: 118, torso: 1.15, legs: 1.32, tw: 0.92 },
  kid: { a: 112, torso: 0.85, legs: 1.0, tw: 0.72 },
  teen: { a: 115, torso: 1.0, legs: 1.28, tw: 0.76 }, // মায়ের অবসর: Nusrat / Rahat at 15-17
};

export type FrontOpts = {
  phase?: number; expr?: Expr; mode?: "march" | "stroll" | "stand" | "sit" | "fall"; look?: number; blink?: boolean | number; lift?: number;
  prop?: Prop; tilt?: number; headTilt?: number; wave?: number;
  /** canvas angle the key light comes FROM (painted crescent + thick outline side) */
  light?: number; facing?: -1 | 0 | 1; seed?: number;
};

const footStroke = (p: Pen, a: P2, b: P2, w: number, col: string) => {
  if (col !== INK) p.stroke([a, b], w + 3, INK);
  p.stroke([a, b], w, col);
};

export const bodyFront = (p: Pen, o: Outfit, opts: FrontOpts) => {
  const { phase = 0, expr = "neutral", mode = "march", look = 0, blink = false, lift = 60, prop = null, tilt = 0, headTilt = 0, wave,
    light = DEF_LIGHT, facing = 0, seed = 1 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin ?? SKIN, two = Math.PI * 2, lid = lidOf(blink);
  const H = headBlob(seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100;
  const tall = (1 + Bd.torso + Bd.legs) * HH, sole = 975;
  // body bob 5 % (march) / 3 % (stroll) of the height, lowest at contact (phase 0 and 0.5)
  const bob = mode === "march" ? 0.025 * tall * Math.cos(2 * two * phase) : mode === "stroll" ? 0.015 * tall * Math.cos(2 * two * phase) : 0;
  const torsoBot = mode === "sit" ? sole - 0.2 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hipY = torsoBot - 0.12 * HH;
  const thick = thickAngle(light), ow = 5 * u;
  const legCol = mix(o.pants, INK, 0.55), armCol = mix(o.jacket, INK, 0.5), footCol = o.boots;
  const legW = 5.8 * u, footW = 7.5 * u;
  // ---- legs + feet (not rotated) ----
  p.rot = null;
  if (mode === "sit") {
    for (const side of [-1, 1]) {
      const h: P2 = [300 + side * 15 * u, hipY], k: P2 = [300 + side * 36 * u, hipY + 0.2 * HH], f: P2 = [300 + side * 44 * u, sole - 8 * u];
      p.stroke(curve(h, k, f), legW, legCol);
      footStroke(p, [f[0] - side * 2 * u, f[1]], [f[0] + side * 12 * u, f[1] - 5 * u], footW, footCol);
    }
  } else if (mode === "fall") {
    const legs: [P2, P2, P2][] = [
      [[300 - 15 * u, hipY], [300 - 46 * u, hipY + 0.5 * HH], [300 - 70 * u, hipY + 0.72 * HH]],
      [[300 + 15 * u, hipY], [300 + 50 * u, hipY + 0.45 * HH], [300 + 76 * u, hipY + 0.22 * HH]],
    ];
    legs.forEach(([h, k, f], i) => {
      p.stroke(curve(h, k, f), legW, legCol);
      footStroke(p, f, [f[0] + (i ? 14 : -14) * u, f[1] + (i ? -6 : 4) * u], footW, footCol);
    });
  } else if (o.dress) {
    for (const side of [-1, 1]) {
      const fx = 300 + side * 12 * u, fy = sole - 4 * u;
      p.stroke([[fx, sole - 0.4 * HH], [fx + side * u, fy]], legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 12 * u, fy + u], footW, footCol);
    }
  } else {
    const L = mode === "march" ? lift * 1.25 : mode === "stroll" ? lift * 0.55 : 0;
    for (const [side, ph] of [[-1, 0], [1, 0.5]] as const) {
      const up = Math.max(0, Math.sin(two * (phase + ph))) * L;
      const hx = 300 + side * 15 * u, fx = 300 + side * 22 * u, fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08];
      p.stroke(curve([hx, hipY], k, [fx, fy]), legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 13 * u, fy + 0.5 * u], footW, footCol);
    }
  }
  // ---- upper body: rotates about the hips (tilt + a small weight-shift sway on every step) ----
  const sway = mode === "march" ? 1.6 * Math.sin(two * phase) : mode === "stroll" ? 1.0 * Math.sin(two * phase) : 0;
  const A = tilt + sway;
  p.rot = A ? [rad(A), 300, hipY] : null;
  const dress = !!o.dress && mode !== "sit" && mode !== "fall";
  const T: Blob = { a: ((Bd.tw / 2) * W) / 1.06, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.6, egg: o.build === "stout" ? 0.17 : 0.12,
    asym: 0.04 * facing, rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 3 * u * facing, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const hang = (side: number, fwd: number): [P2, P2, P2] => {
    const S = sh(side), ex = tcx + side * (1.12 * T.a + 4 * u);
    const hx = ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd);
    return [S, [ex, S[1] + 0.48 * HH], [hx, chin + 1.04 * HH - Math.abs(fwd) * 9 * u]];
  };
  const sw = mode === "march" || mode === "stroll" ? Math.sin(two * phase) : 0;
  // rifle at the order: butt by the right hip, held by the hanging right hand, muzzle past the crown
  const R0: P2 = [300 + 47 * u, torsoBot + 0.12 * HH], R1: P2 = [300 + 64 * u, crown - 0.32 * HH];
  const rifle = !!o.rifle && (mode === "march" || mode === "stand" || mode === "stroll");
  type Arm = { pts: [P2, P2, P2]; front: boolean };
  const arms: Arm[] = [];
  if (mode === "sit") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.1 * T.a + 6 * u), sh(side)[1] + 0.4 * HH], [tcx + side * (1.2 * T.a + 10 * u), torsoBot + 0.04 * HH]], front: false });
  else if (mode === "fall") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.15 * T.a + 12 * u), sh(side)[1] - 0.25 * HH], [tcx + side * (1.3 * T.a + 24 * u), sh(side)[1] - 0.68 * HH]], front: false });
  else {
    arms.push({ pts: prop === "shako" ? hang(-1, 0) : hang(-1, -sw), front: false });
    if (rifle) {
      const G = lerp2(R0, R1, 0.1);
      arms.push({ pts: [sh(1), [tcx + 1.12 * T.a + 5 * u, sh(1)[1] + 0.45 * HH], G], front: false });
    } else if (wave !== undefined) {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.1 * T.a + 10 * u + 3 * u * wave, S[1] - 0.22 * HH], [tcx + 1.18 * T.a + 16 * u + 12 * u * wave, S[1] - 0.6 * HH]], front: false });
    } else if (prop === "icecream") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.05 * T.a + 4 * u, S[1] + 0.45 * HH], [tcx + 0.5 * T.a, S[1] + 0.4 * HH]], front: true });
    } else if (Array.isArray(prop)) {
      const S = sh(1), k = clamp(prop[1], 0, 1);
      const E = lerp2([tcx + 1.1 * T.a + 10 * u, S[1] - 0.15 * HH], [tcx + 1.2 * T.a + 10 * u, S[1] + 0.3 * HH], k);
      const Hd = lerp2([tcx + 1.15 * T.a + 14 * u, S[1] - 0.55 * HH], [tcx + 1.45 * T.a + 22 * u, S[1] + 0.35 * HH], k);
      arms.push({ pts: [S, E, Hd], front: true });
    } else arms.push({ pts: hang(1, sw), front: false });
  }
  const drawArm = (a: Arm) => { p.stroke(curve(a.pts[0], a.pts[1], a.pts[2]), 5.2 * u, armCol); p.dot(a.pts[2][0], a.pts[2][1], 5.5 * u); };
  // behind the body: rifle, sword, arms
  if (rifle) {
    p.band([R0, R1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(R0, R1, 0.6), R1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  if (o.sword && mode !== "sit") {
    const s0: P2 = [tcx - 0.75 * T.a, torsoBot - 0.2 * HH];
    p.band([s0, [s0[0] - Math.sin(rad(25)) * 0.8 * HH, s0[1] + Math.cos(rad(25)) * 0.8 * HH]], "#c9ccd2", 3 * u, 1.2 * u, "round");
  }
  for (const a of arms) if (!a.front) drawArm(a);
  // torso / dress: shaded fill -> clothing clipped to it -> thick-thin ink ring
  if (dress) {
    const D: Blob = { a: 0.5 * W * 0.98, b: 0.5 * ((sole - 0.35 * HH) - (chin - 0.2 * HH)), nTop: 2.0, nBot: 3.0, egg: 0.35, asym: 0.03 * facing, rot: 0, noise: 0.006, seed: seed + 9 };
    const dp = blobPts(300, sole - 0.35 * HH - D.b, D);
    p.gradFill(dp, o.dress!, mul(o.dress!, SH_CLOTH), light);
    p.inkRing(dp, ow, thick);
    const Sw: Blob = { a: 0.37 * W, b: 0.3 * HH, nTop: 2.2, nBot: 2.4, egg: 0.1, asym: 0, rot: 0, noise: 0.006, seed: seed + 8 };
    const sp = blobPts(300, chin + 0.12 * HH, Sw);
    p.gradFill(sp, o.jacket, mul(o.jacket, SH_CLOTH), light);
    p.inkRing(sp, ow * 0.9, thick);
  } else {
    p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), light);
    p.clip(tp, () => {
      if (o.belt) {
        for (const s of [-1, 1]) p.band([[tcx - s * 0.75 * T.a, chin - 0.05 * HH], [tcx + s * 0.8 * T.a, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
        const xc = tcx + 0.025 * T.a, yc = chin - 0.05 * HH + (torsoBot - 0.1 * HH - (chin - 0.05 * HH)) * (0.75 / 1.55);
        p.poly([[xc - 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc + 3.5 * u], [xc - 3.5 * u, yc + 3.5 * u]], "#d9dde0", 1.5 * u);
      }
      if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
      for (let i = 0; i < 4; i++) {
        const y = chin + 0.12 * HH + i * 0.2 * HH;
        if (o.sash && Math.abs(y - (torsoBot - 0.32 * HH)) < 0.08 * HH) continue;
        p.dot(tcx + 2 * u * facing, y, 2.2 * u + 0.8 * u, INK); p.dot(tcx + 2 * u * facing, y, 2.2 * u, o.buttons ?? shade(o.jacket, 0.7));
      }
    });
    if (o.sash) { const s = facing || 1; p.poly([[tcx + s * 0.55 * T.a, torsoBot - 0.3 * HH], [tcx + s * 0.75 * T.a, torsoBot + 0.05 * HH], [tcx + s * 0.45 * T.a, torsoBot + 0.02 * HH]], o.sash, 1.6 * u); }
    p.inkRing(tp, ow, thick);
  }
  // in front of the body: hands holding props
  for (const a of arms) if (a.front) {
    drawArm(a);
    const [hx, hy] = a.pts[2];
    if (prop === "icecream") {
      p.poly([[hx - 8 * u, hy - 12 * u], [hx + 8 * u, hy - 12 * u], [hx, hy + 7 * u]], "#e0a35a", 1.8 * u);
      p.ell(hx, hy - 19 * u, 11 * u, 10 * u, "#f7c6d9", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    } else if (Array.isArray(prop)) {
      const ang = rad(-70 + 105 * clamp(prop[1], 0, 1));
      const Rh = (pts: P2[]) => rotPts(pts, ang, hx, hy);
      p.band(Rh([[hx, hy + 12 * u], [hx, hy - 44 * u]]), "#8a5a34", 5 * u, 1.5 * u, "round");
      p.poly(Rh([[hx - 12 * u, hy - 58 * u], [hx + 20 * u, hy - 58 * u], [hx + 20 * u, hy - 42 * u], [hx - 12 * u, hy - 42 * u]]), "#7d848c", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    }
  }
  if (prop === "shako") { // carried by the left hand
    const [hx, hy] = arms[0].pts[2];
    p.poly([[hx - 14 * u, hy + 3 * u], [hx + 14 * u, hy + 3 * u], [hx + 16 * u, hy + 30 * u], [hx - 16 * u, hy + 30 * u]], "#3a3d47", 2.2 * u);
    p.ell(hx, hy + 31 * u, 3.5 * u, 3.5 * u, "#2b7a4b", 1.5 * u);
    p.dot(hx, hy, 5.5 * u);
  }
  // ---- head: rotates with the body, plus its own tilt about the chin ----
  const Ah = A + headTilt, [cpx, cpy] = rotAbout([300, chin], rad(A), [300, hipY]);
  p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
  hatBehind(p, o, H, 300, hc, light, thick, ow, false);
  const hp = blobPts(300, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  hatOn(p, o, hp, H, 300, hc, light, seed, facing, false);
  const brim = !!o.hat && o.hat !== "hair" && o.hat !== "bonnet" && o.hat !== "cap";
  faceFront(p, 300, hc, W, expr, facing, look, lid, brim, skin, o.moustache, o.build === "stout");
  p.rot = null;
};

export type SideOpts = {
  phase?: number; expr?: Expr; mode?: "march" | "stand" | "swing" | "push"; blink?: boolean | number; stomp?: number; pose?: number;
  /** step length as a multiple of 0.8 m (370 units): matches 1.6 m/s at 2 steps/s; scale by the view's foreshortening */
  stride?: number; light?: number; seed?: number;
  /** push mode: where the hands land at pose 1, in final canvas units (e.g. the swing kid's back) */
  hand?: [number, number];
};

/** two-bone leg, knee bending forward (+x) */
const ik = (hip: P2, ank: P2, l1: number, l2: number): P2 => {
  const dx = ank[0] - hip[0], dy = ank[1] - hip[1], d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), k = Math.atan2(dy, dx) - A;
  return [hip[0] + l1 * Math.cos(k), hip[1] + l1 * Math.sin(k)];
};

/** hip height of the seated kid in `swing` mode (design units); swingKid seats the torso bottom on the plank */
const SWING_HIP = 733;

/** side view facing screen-right; march footfalls land at phase 0 (near foot) and 0.5 (far foot), like the front view.
 *  The stance foot is planted: it slides back at exactly the walking speed while the hip rises and falls over it. */
export const bodySide = (p: Pen, o: Outfit, opts: SideOpts) => {
  const { phase = 0, expr = "neutral", mode = "march", blink = false, stomp = 1, pose = 0, stride = 1, light = DEF_LIGHT, seed = 1 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin ?? SKIN, two = Math.PI * 2, lid = lidOf(blink);
  const H: Blob = { ...headBlob(seed, Bd.a, 1), asym: 0.12, rot: rad(3 + 3 * (rnd(seed, 7) - 0.5)) };
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, sole = 975, ankY = sole - 4 * u;
  const thick = thickAngle(light), ow = 5 * u;
  const legLen = (Bd.legs + 0.12) * HH - 4 * u, l1 = legLen / 2, l2 = legLen / 2;
  const nearCol = mix(o.pants, INK, 0.55), farCol = mix(o.pants, INK, 0.75), footCol = o.boots;
  type LegS = { ank: P2; pitch: number; near: boolean };
  const legs: LegS[] = [];
  let hipY = ankY - legLen * 0.995, lean = 0, nearFwd = 0;
  if (mode === "march") {
    const S = 370 * stride, liftH = Math.max(22, 40 + 70 * (stomp - 1));
    const st = (ph: number) => {
      const c = (((phase + ph) % 1) + 1) % 1;
      if (c < 0.5) { const s = c / 0.5; return { x: S / 2 - S * s, h: 0, stance: true, s }; }
      const s = (c - 0.5) / 0.5; // swing: cycloid in world space, so the foot leaves and lands at zero ground speed
      return { x: -S / 2 + S * s - (S / Math.PI) * Math.sin(2 * Math.PI * s), h: liftH * Math.sin(Math.PI * s), stance: false, s };
    };
    const nL = st(0), fL = st(0.5), stance = nL.stance ? nL : fL;
    const Leff = legLen * (1 - 0.035 * Math.sin(Math.PI * stance.s));
    hipY = ankY - Math.sqrt(Math.max(1, Leff * Leff - stance.x * stance.x));
    for (const [L, near] of [[fL, false], [nL, true]] as const)
      legs.push({ ank: [300 + L.x, ankY - L.h], pitch: L.stance ? 0 : rad(35 * Math.sin(Math.PI * L.s) * (1 - 1.6 * L.s)), near });
    lean = 4 + 3 * Math.cos(2 * two * phase); // 7 deg at contact, 1 deg at passing
    nearFwd = nL.x / (S / 2);
  } else if (mode === "push") {
    hipY = ankY - 0.87 * legLen;
    legs.push({ ank: [300 - 0.5 * legLen, ankY], pitch: rad(-8), near: false }, { ank: [300 + 0.32 * legLen, ankY], pitch: 0, near: true });
    lean = 14 * pose;
  } else if (mode === "swing") {
    hipY = SWING_HIP;
    const a = rad(60 * pose);
    for (const [dx, near] of [[-6, false], [0, true]] as const) {
      const knee: P2 = [300 + l1 * 0.98 + dx * u, hipY + 6 * u];
      legs.push({ ank: [knee[0] + l2 * Math.sin(a), knee[1] + l2 * Math.cos(a)], pitch: -a * 0.5, near });
    }
  } else {
    legs.push({ ank: [300 - 4 * u, ankY], pitch: 0, near: false }, { ank: [300 + 4 * u, ankY], pitch: 0, near: true });
  }
  const torsoBot = hipY + 0.12 * HH, chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hip: P2 = [300, hipY];
  p.rot = null;
  for (const L of legs) {
    const knee = mode === "swing" ? ([300 + l1 * 0.98 + (L.near ? 0 : -6 * u), hipY + 6 * u] as P2) : ik(hip, L.ank, l1, l2);
    const hp0: P2 = [300 + (L.near ? 0 : -5 * u), hipY];
    p.stroke([hp0, knee, L.ank], 5.8 * u, L.near ? nearCol : farCol);
    const c = Math.cos(L.pitch), s = Math.sin(L.pitch);
    footStroke(p, [L.ank[0] - 3 * u * c, L.ank[1] - 3 * u * s], [L.ank[0] + 13 * u * c, L.ank[1] + 13 * u * s + 0.5 * u],
      7.5 * u, L.near ? footCol : footCol === INK ? INK : shade(footCol, 0.82));
  }
  // ---- upper body leans about the hip ----
  p.rot = lean ? [rad(lean), 300, hipY] : null;
  const T: Blob = { a: (o.build === "stout" ? 0.36 : 0.31) * W, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.5, egg: 0.1, asym: 0.06,
    rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 2 * u, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const armCol = mix(o.jacket, INK, 0.5), farArm = mix(o.jacket, INK, 0.68);
  const S: P2 = [tcx + 0.05 * T.a, chin + 0.14 * HH], aLen = 0.95 * HH;
  const swingArm = (ang: number): [P2, P2, P2] => {
    const e: P2 = [S[0] + Math.sin(ang) * aLen * 0.5, S[1] + Math.cos(ang) * aLen * 0.5], a2 = ang + rad(16) * Math.sign(ang || 1);
    return [S, e, [e[0] + Math.sin(a2) * aLen * 0.5, e[1] + Math.cos(a2) * aLen * 0.5]];
  };
  const rifle = !!o.rifle && (mode === "march" || mode === "stand");
  const B0: P2 = [tcx + 0.72 * T.a, chin + 0.58 * HH], B1: P2 = [tcx - 0.95 * T.a - 22 * u, crown - 0.4 * HH];
  let near: [P2, P2, P2], far: [P2, P2, P2] | null;
  if (mode === "swing") { near = [S, [S[0] + 12 * u, S[1] - 0.16 * HH], [300 + 6 * u, chin - 0.3 * HH]]; far = [S, [S[0] + 8 * u, S[1] - 0.18 * HH], [300 + 2 * u, chin - 0.36 * HH]]; }
  else if (mode === "push") {
    const reach = 0.55 * HH + 0.45 * HH * pose;
    let hN: P2 = [S[0] + reach, S[1] + 0.06 * HH];
    if (opts.hand) {
      // target is in final canvas units; the arm is drawn inside the lean rotation, so undo it
      const th = -rad(lean), dx = opts.hand[0] - 300, dy = opts.hand[1] - hipY;
      const tg: P2 = [300 + dx * Math.cos(th) - dy * Math.sin(th), hipY + dx * Math.sin(th) + dy * Math.cos(th)];
      hN = [hN[0] + (tg[0] - hN[0]) * pose, hN[1] + (tg[1] - hN[1]) * pose];
    }
    near = [S, [(S[0] + hN[0]) / 2, (S[1] + hN[1]) / 2 + 0.06 * HH], hN];
    far = [S, [(S[0] + hN[0]) / 2 - 4 * u, (S[1] + hN[1]) / 2 - 0.02 * HH], [hN[0] - 6 * u, hN[1] - 0.08 * HH]];
  } else if (rifle) { near = [S, [S[0] - 4 * u, S[1] + 0.42 * HH], B0]; far = mode === "march" ? swingArm(rad(30) * nearFwd) : swingArm(0); }
  else { near = swingArm(rad(-30) * nearFwd); far = mode === "march" ? swingArm(rad(30) * nearFwd) : null; }
  if (far) { p.stroke(curve(far[0], far[1], far[2]), 5.2 * u, farArm); p.dot(far[2][0], far[2][1], 5.5 * u); }
  p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), light);
  p.clip(tp, () => {
    if (o.belt) p.band([[tcx - 0.65 * T.a, chin - 0.05 * HH], [tcx + 0.75 * T.a, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
    if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
    if (!o.dress) for (let i = 0; i < 3; i++) { const y = chin + 0.16 * HH + i * 0.24 * HH; p.dot(tcx + 0.8 * T.a, y, 3 * u, INK); p.dot(tcx + 0.8 * T.a, y, 2.2 * u, o.buttons ?? shade(o.jacket, 0.7)); }
  });
  p.inkRing(tp, ow, thick);
  if (rifle) {
    p.band([B0, B1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(B0, B1, 0.6), B1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  p.stroke(curve(near[0], near[1], near[2]), 5.2 * u, armCol); p.dot(near[2][0], near[2][1], 5.5 * u);
  // ---- head ----
  const hx = 300 + 4 * u;
  hatBehind(p, o, H, hx, hc, light, thick, ow, true);
  const hp = blobPts(hx, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  hatOn(p, o, hp, H, hx, hc, light, seed, 1, true);
  const brim = !!o.hat && o.hat !== "hair" && o.hat !== "bonnet" && o.hat !== "cap";
  faceSide(p, hx, hc, W, expr, lid, brim, skin, o.moustache, o.build === "stout");
  p.rot = null;
};

/** rope + seat + seated kid on a 700 x 2300 canvas; the pivot is design (350, 20); kid drawn at 0.92 scale */
export const swingKid = (p: Pen, o: Outfit, kick: number, expr: Expr, light = DEF_LIGHT, blink: number = 0) => {
  const rope = 1830, k = 1.1, HH = 2 * headBlob(5, BUILD[o.build ?? "adult"].a, 1).b;
  // two ropes from the pivot to the ends of a wide plank, the kid framed between them: a single rope behind the kid
  // ended at the cap and read as a hanging. Far rope behind the kid, near rope drawn over (clear of the face).
  const seat = rope + 18, x0 = 150, x1 = 550;
  p.line([[350, 20], [x0 + 16, seat + 4]], "#a07a4c", 10);
  p.poly(rrect(x0, seat, x1, seat + 36, 10), "#b5653f", 9);
  const g = p.g;
  g.save();
  g.translate(350 - 300 * k, rope + 18 - (SWING_HIP + 0.12 * HH) * k);
  g.scale(k, k);
  bodySide(new Pen(g), o, { expr, mode: "swing", pose: kick, light, seed: 5, blink });
  g.restore();
  p.line([[350, 20], [x1 - 16, seat + 4]], "#a07a4c", 10);
};

// ---------------- effects ----------------
export const fxNote = (p: Pen, kind: number, col = "#1f2a44") => {
  p.ell(70, 200, 46, 34, col, 8, 0, 360, -20);
  p.stroke([[110, 190], [110, 40]], 14);
  if (kind === 0) p.poly([[110, 40], [170, 70], [170, 110], [110, 82]], col, 8);
  else {
    p.ell(150, 170, 40, 30, col, 8, 0, 360, -20);
    p.stroke([[186, 160], [186, 20]], 14);
    p.poly([[110, 40], [186, 20], [186, 50], [110, 70]], col, 8);
  }
};

/** spark / impact star on a 500 x 500 canvas; t in 0..1 */
export const fxBurst = (p: Pen, t: number, col = "#fff3b0", rays = 10, r0 = 40, r1 = 230) => {
  const c = 250, e = 1 - (1 - t) ** 3;
  for (let i = 0; i < rays; i++) {
    const a = rad((i * 360) / rays + 7 * (i % 2)), ra = r0 + (r1 - r0) * e * (0.75 + 0.25 * (i % 2));
    p.poly([[c + r0 * 0.5 * Math.cos(a + 0.18), c + r0 * 0.5 * Math.sin(a + 0.18)], [c + ra * Math.cos(a), c + ra * Math.sin(a)],
      [c + r0 * 0.5 * Math.cos(a - 0.18), c + r0 * 0.5 * Math.sin(a - 0.18)]], col, Math.max(3, 8 * (1 - t)));
  }
  if (t < 0.5) p.ell(c, c, r0 * (1.4 - t), r0 * (1.4 - t), WHITE, 8);
};

/** water splash crown on an 800 x 800 canvas; t in 0..1 */
export const fxSplash = (p: Pen, t: number) => {
  const c = 400, size = 800, rise = Math.sin(Math.min(1, t * 1.3) * Math.PI);
  const blue = "#bfe8ff", deep = "#6cc0f0";
  if (rise > 0.02) {
    const pts: P2[] = [];
    for (let i = 0; i < 19; i++) {
      const h = (i % 2 ? 260 : 130) * rise * (0.7 + 0.3 * Math.sin(i * 1.7));
      pts.push([c - 330 + (660 * i) / 18, size - 120 - h]);
    }
    p.poly([...pts, [c + 330, size - 90], [c - 330, size - 90]], blue, 10);
    p.ell(c, size - 100, 360, 46, deep, 10);
  }
  for (let i = 0; i < 8; i++) {
    const a = rad(200 + i * 18), d = 120 + 380 * t, y = size - 160 + d * Math.sin(a) + 520 * t * t, r = 26 * (1 - t) + 6;
    if (t > 0.08 && y < size - 40) p.ell(c + d * Math.cos(a), y, r, r * 1.25, blue, 7);
  }
};

/** dust puff on a 300 x 300 canvas; t in 0..1 */
export const fxPuff = (p: Pen, t: number) => {
  for (let i = 0; i < 5; i++) {
    const a = rad(160 + i * 55), d = 40 + 70 * t, r = (34 + 20 * (i % 2)) * (1 - 0.6 * t);
    p.ell(150 + d * Math.cos(a), 180 + d * 0.45 * Math.sin(a), r, r * 0.8, `rgba(238,225,205,${(1 - t).toFixed(3)})`, 0);
  }
};

/** circling stars on a 420 x 210 canvas */
export const fxStars = (p: Pen, t: number) => {
  for (let i = 0; i < 4; i++) {
    const a = t * Math.PI * 2 + (i * Math.PI) / 2, x = 210 + 150 * Math.cos(a), y = 110 + 40 * Math.sin(a), pts: P2[] = [];
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 14 : 34, b = rad(k * 36 - 90); pts.push([x + r * Math.cos(b), y + r * Math.sin(b)]); }
    p.poly(pts, "#ffd84a", 6);
  }
};

/** three jittering strain ticks on a 300 x 300 canvas */
export const fxCreak = (p: Pen, t: number) => {
  const j = 6 * Math.sin(t * 40);
  for (const a of [-30, 0, 30]) {
    const b = rad(a - 90);
    p.stroke([[150 + 70 * Math.cos(b) + j, 230 + 70 * Math.sin(b)], [150 + 100 * Math.cos(b) + 10 + j, 230 + 100 * Math.sin(b)],
      [150 + 130 * Math.cos(b) + j, 230 + 130 * Math.sin(b)]], 10);
  }
};

/** flat water ring (drawn top-down) on a 600 x 600 canvas; t in 0..1 */
export const fxRing = (p: Pen, t: number) => {
  // thin light water rings (white crest, pale blue trailing rings), thinning as they spread
  const g = p.g;
  for (let k = 0; k < 3; k++) {
    const u = t - k * 0.22;
    if (u <= 0 || u >= 1) continue;
    g.beginPath(); g.ellipse(300, 300, 60 + 230 * u, 60 + 230 * u, 0, 0, Math.PI * 2);
    g.strokeStyle = k === 0 ? "#f6fcff" : "#cfe8fa"; g.lineWidth = 9 * (1 - u) + 3; g.stroke();
  }
};

/** text-free sign on a 700 x 520 canvas: "no marching in step on the bridge". A bridge (deck + arch + piers), four
 *  identical pairs of marching legs in the same stride (in step), a bold red X over all of it. */
export const fxSign = (p: Pen) => {
  const g = p.g, RED = "#d42f2f";
  p.poly(rrect(14, 14, 686, 506, 40), "#f6ecd2", 0);
  p.poly(rrect(14, 14, 686, 506, 40), null, 14);
  // bridge: deck, stone arch underneath, two piers
  p.poly(rrect(70, 352, 630, 384, 8), "#8a5a3a", 9);
  g.beginPath(); g.moveTo(112, 470); g.quadraticCurveTo(350, 300, 588, 470);
  g.strokeStyle = INK; g.lineWidth = 16; g.lineCap = "round"; g.stroke();
  for (const x of [88, 612]) p.poly(rrect(x - 16, 384, x + 16, 470, 4), "#8a5a3a", 9);
  // four identical soldiers' legs mid-stride: same leg forward on every one = in step
  for (const x of [150, 278, 406, 534]) {
    p.poly(rrect(x - 30, 150, x + 30, 214, 14), "#357650", 9);                  // coat hem
    p.stroke([[x - 8, 210], [x + 34, 262], [x + 46, 338]], 15, INK);           // front leg
    p.stroke([[x + 6, 210], [x - 12, 274], [x - 36, 336]], 15, INK);           // back leg
    p.poly(rrect(x + 30, 330, x + 74, 350, 9), INK, 0);                          // boots point forward
    p.poly(rrect(x - 52, 328, x - 8, 348, 9), INK, 0);
  }
  // big red X
  for (const [a, b] of [[[96, 70], [604, 452]], [[604, 70], [96, 452]]] as [[number, number], [number, number]][]) {
    p.stroke([a, b], 58, "#ffffff");
    p.stroke([a, b], 42, RED);
  }
};

/** soft cartoon cloud on a 600 x 300 canvas */
export const fxCloud = (p: Pen, seed: number) => {
  const blobs: [number, number, number][] = [[150, 190, 80], [250, 150, 105], [360, 160, 95], [450, 195, 70], [300, 210, 90]];
  for (const [x, y, r] of blobs) p.ell(x + ((seed * 37) % 20) - 10, y, r, r * 0.8, "#ffffff", 0);
  p.ell(300, 235, 230, 40, "#ffffff", 0);
};

/** cast shadow on a 128 x 256 canvas: dark soft contact pool at the feet (y 205) and a softer tail that runs up the
 *  canvas = away from the sun, fading with distance; multiply colour (sRGB-encoded linear ratio), white = no change */
export const fxShadow = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 256);
  g.save(); g.filter = "blur(9px)";
  const lg = g.createLinearGradient(0, 205, 0, 22);
  lg.addColorStop(0, mix(col, WHITE, 0.08)); lg.addColorStop(0.55, mix(col, WHITE, 0.3)); lg.addColorStop(1, mix(col, WHITE, 0.85));
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(40, 205); g.bezierCurveTo(36, 120, 46, 50, 64, 30); g.bezierCurveTo(82, 50, 92, 120, 88, 205); g.closePath(); g.fill();
  g.fillStyle = col; g.beginPath(); g.ellipse(64, 205, 30, 17, 0, 0, Math.PI * 2); g.fill();
  g.restore();
};

/** tight contact shadow right under the feet on a 128 x 128 canvas: dark core, short fall-off (multiply colour) */
export const fxContact = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.32, 0.02], [0.5, 0.22], [0.66, 0.58], [0.82, 0.88], [1, 1]] as const) gr.addColorStop(r, mix(col, WHITE, k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};

/** floating wooden plank, side-on, on a 320 x 110 canvas */
export const fxPlank = (p: Pen) => {
  p.poly(rrect(14, 30, 306, 78, 10), "#a8744a", 9);
  p.line([[40, 46], [150, 44], [270, 50]], "#7d5234", 4);
  p.line([[60, 62], [200, 64], [284, 60]], "#7d5234", 4);
  p.dot(36, 54, 5, INK); p.dot(284, 54, 5, INK);
};

/** floating marching drum (no text) on a 260 x 240 canvas: white shell, red hoops, ink zig-zag cord */
export const fxDrum = (p: Pen) => {
  p.poly(rrect(40, 70, 220, 190, 16), "#f1ece0", 9);
  p.poly(rrect(32, 58, 228, 86, 12), "#c9373a", 8);
  p.poly(rrect(32, 176, 228, 204, 12), "#c9373a", 8);
  p.line([[52, 88], [82, 172], [112, 88], [142, 172], [172, 88], [202, 172]], INK, 6);
  p.ell(130, 58, 98, 18, "#f7f3ea", 8);
};

/** soft ground contact blob on a 128 x 128 canvas, multiply colour (sRGB-encoded linear ratio) in the centre */
export const fxBlob = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 128);
  // soft contact shadow: flat core, then a long smooth (roughly gaussian) fall-off to white = no change
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.5, 0.04], [0.64, 0.18], [0.76, 0.42], [0.87, 0.72], [0.95, 0.92], [1, 1]] as const) gr.addColorStop(r, mix(col, WHITE, k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};

// ======================================================================================================
// মায়ের অবসর cast: Bangladeshi family in the same construction as the template (superellipse bean heads, thick-thin
// plum ink weighted away from the light, painted crescents, ink-dot hands, deadpan lidded eyes, no blush, the same 14
// expressions). Cards always face the lens, so there are front and back views only. Garments: sari with a dark border
// and the anchal pulled over the head, frock, salwar kameez with orna, school uniform, kurti, shirt with shorts or
// trousers, fatua, lungi, bank clothes. Poses: sew, husk (dheki), water (kolshi on the hip), write, eat, phone, hug,
// key, paper; walking = mode "stroll"; sleeping = eyes shut + the card rolled flat by cast.ts.
// ======================================================================================================
export type Garment =
  | { kind: "sari"; body: string; border: string; blouse: string }
  | { kind: "frock"; body: string; collar: string }
  | { kind: "salwar"; top: string; pants: string; orna: string }
  | { kind: "uniform"; shirt: string; pinafore: string }
  | { kind: "kurti"; top: string; pants: string; trim: string }
  | { kind: "shirt"; shirt: string; pants: string; shorts?: boolean; check?: string; lanyard?: string }
  | { kind: "fatua"; top: string; pants: string }
  | { kind: "lungi"; shirt: string; lungi: string; vest?: string }
  | { kind: "bank"; blazer: string; top: string; pants: string; lanyard: string };
export type HairStyle = "short" | "bob" | "plaits" | "bun" | "long" | "anchal";
export type Villager = {
  skin: string; hair: HairStyle; hairCol: string; ribbon?: string; g: Garment; build: Build; seed: number; feet: string;
  /** the sari end over the head (hair style "anchal") */
  anchal?: { col: string; border: string };
  /** a white crocheted prayer cap (the bangle seller) */
  topi?: string;
  /** flat silhouette colour: every fill becomes this (the father walking away in the rain) */
  sil?: string;
};
export type VPose = "none" | "sew" | "husk" | "water" | "write" | "eat" | "phone" | "hug" | "key" | "paper" | "holdhand" | "lean" | "rub" | "read" | "stick" | "notes" | "type" | "scribble";
export type VOpts = {
  mode?: "stand" | "stroll" | "sit"; phase?: number; pose?: VPose; poseT?: number; expr?: Expr; look?: number; blink?: number;
  facing?: -1 | 0 | 1; light?: number; back?: boolean;
  /** draw the hand-held prop (plate, cloth, pot ...); off when the 3D set already has it (plates on the table) */
  prop?: boolean;
};
type GLook = { top: string; sleeve: "short" | "long"; lower: "long" | "knee" | "tunic" | "none"; lowerCol: string; border?: string;
  legs: "bare" | "pants" | "shorts" | "hidden"; legCol: string; hemK: number };
const garmentLook = (g: Garment): GLook => {
  switch (g.kind) {
    case "sari": return { top: g.blouse, sleeve: "short", lower: "long", lowerCol: g.body, border: g.border, legs: "hidden", legCol: g.body, hemK: 0.97 };
    case "frock": return { top: g.body, sleeve: "short", lower: "knee", lowerCol: g.body, legs: "bare", legCol: "", hemK: 0.45 };
    case "salwar": return { top: g.top, sleeve: "long", lower: "tunic", lowerCol: g.top, legs: "pants", legCol: g.pants, hemK: 0.52 };
    case "uniform": return { top: g.shirt, sleeve: "short", lower: "knee", lowerCol: g.pinafore, legs: "bare", legCol: "", hemK: 0.48 };
    case "kurti": return { top: g.top, sleeve: "long", lower: "tunic", lowerCol: g.top, legs: "pants", legCol: g.pants, hemK: 0.34 };
    case "shirt": return { top: g.shirt, sleeve: g.shorts ? "short" : "long", lower: "none", lowerCol: g.pants, legs: g.shorts ? "shorts" : "pants", legCol: g.pants, hemK: 0 };
    case "fatua": return { top: g.top, sleeve: "short", lower: "tunic", lowerCol: g.top, legs: "pants", legCol: g.pants, hemK: 0.2 };
    case "lungi": return { top: g.shirt, sleeve: "short", lower: "long", lowerCol: g.lungi, legs: "hidden", legCol: g.lungi, hemK: 0.95 };
    case "bank": return { top: g.blazer, sleeve: "long", lower: "tunic", lowerCol: g.top, legs: "pants", legCol: g.pants, hemK: 0.5 };
  }
};

export const villagerFront = (p: Pen, v: Villager, o: VOpts) => {
  const { mode = "stand", phase = 0, pose = "none", poseT = 0, expr = "neutral", look = 0, blink = 0, facing = 0, light = DEF_LIGHT, back = false, prop = true } = o;
  const C = (c: string) => v.sil ?? c; // every fill goes through C (silhouette = one colour)
  const L = garmentLook(v.g), Bd = BUILD[v.build], two = Math.PI * 2, lid = lidOf(blink);
  const H = headBlob(v.seed, Bd.a, back ? 0 : facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100, sole = 975;
  const tall = (1 + Bd.torso + Bd.legs) * HH, sit = mode === "sit";
  const bob = mode === "stroll" ? 0.015 * tall * Math.cos(2 * two * phase) : pose === "husk" ? 0.012 * tall * Math.max(0, Math.sin(two * poseT)) : 0;
  const torsoBot = sit ? sole - 0.2 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hipY = torsoBot - 0.12 * HH;
  const thick = thickAngle(light), ow = 5 * u, skin = C(v.skin);
  const hair = C(v.hairCol), top = C(L.top), lowerCol = C(L.lowerCol), feet = C(v.feet);
  const legW = 8.2 * u, footW = 10 * u;
  const hemY = sit ? torsoBot + 0.05 * HH : hipY + (sole - hipY) * L.hemK;
  const shaded = (pts: P2[], col: string, R: number) => { p.shadedFill(pts, col, mul(col, SH_CLOTH), light, R, 0.4); p.inkRing(pts, ow, thick); };
  p.rot = null;
  // ---- behind everything: long hair / bob / anchal hood / orna ends ----
  if (!back && (v.hair === "long" || v.hair === "bob")) {
    const hb = blobPts(300, hc + (v.hair === "long" ? 0.3 : 0.12) * HH, { a: H.a * 1.06, b: (v.hair === "long" ? 0.66 : 0.5) * HH, nTop: 2, nBot: 2.6, egg: 0.08, asym: 0, rot: 0, noise: 0.006, seed: v.seed + 31 });
    shaded(hb, hair, H.a);
  }
  if (v.hair === "anchal" && v.anchal) {
    const hood = blobPts(300, hc + 0.18 * HH, { a: H.a * 1.18, b: H.b * 1.2 + 0.06 * HH, nTop: 1.9, nBot: 2.4, egg: 0.12, asym: 0, rot: 0, noise: 0.006, seed: v.seed + 33 });
    shaded(hood, C(v.anchal.col), H.a * 1.18);
  }
  // ---- legs + feet ----
  const T: Blob = { a: ((Bd.tw / 2) * W) / 1.06 * (L.lower === "tunic" && !sit ? 1.06 : 1), b: 0, nTop: 2.2, nBot: L.lower === "tunic" && !sit ? 2.8 : 2.6,
    egg: L.lower === "tunic" && !sit ? 0.16 : 0.12, asym: 0.04 * facing, rot: 0, noise: 0.006, seed: v.seed + 7 };
  const legDark = (c: string) => mix(c, INK, 0.3), skinLeg = mix(skin, INK, 0.25);
  if (sit) {
    for (const side of [-1, 1]) {
      const h: P2 = [300 + side * 15 * u, hipY], k: P2 = [300 + side * 36 * u, hipY + 0.2 * HH], f: P2 = [300 + side * 44 * u, sole - 8 * u];
      if (L.legs !== "hidden") {
        p.stroke(curve(h, k, f), legW, L.legs === "pants" ? legDark(C(L.legCol)) : skinLeg);
        if (L.legs === "shorts") p.stroke(curve(h, k, f).slice(0, 5), 8.5 * u, legDark(C(L.legCol)));
      }
      footStroke(p, [f[0] - side * 2 * u, f[1]], [f[0] + side * 12 * u, f[1] - 5 * u], footW, feet);
    }
  } else {
    for (const [side, ph] of [[-1, 0], [1, 0.5]] as const) {
      const up = mode === "stroll" ? Math.max(0, Math.sin(two * (phase + ph))) * 33 : pose === "husk" && side > 0 ? Math.max(0, Math.sin(two * poseT)) * 48 : 0;
      const hx = 300 + side * 15 * u, fx = 300 + side * (L.legs === "hidden" ? 13 : 20) * u, fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08], leg = curve([hx, hipY], k, [fx, fy]);
      if (L.legs === "pants") p.stroke(leg, v.g.kind === "salwar" ? 11 * u : legW, legDark(C(L.legCol)));
      else if (L.legs === "bare") p.stroke(leg, legW, skinLeg);
      else if (L.legs === "shorts") { p.stroke(leg, legW, skinLeg); p.stroke(leg.slice(0, 5), 9 * u, legDark(C(L.legCol))); }
      footStroke(p, [fx - side * 4 * u, fy], [fx + side * 15 * u, fy + 0.5 * u], footW, feet);
      if (L.legs === "bare" || L.legs === "shorts" || L.legs === "hidden") p.stroke([[fx - side * 1 * u, fy - 3.5 * u], [fx + side * 6 * u, fy - 3.5 * u]], 2.2 * u, mix(feet, "#ffffff", 0.25)); // sandal strap
    }
  }
  // ---- lower garment: sari / lungi to the ankle, frock / pinafore to the knee (laps when seated) ----
  if (L.lower === "long" || L.lower === "knee") {
    const yTop = torsoBot - 0.2 * HH, sari = v.g.kind === "sari";
    let D: P2[];
    if (sit) D = ellPts(300, hipY + 0.06 * HH, (L.lower === "long" ? 0.62 : 0.52) * W, 0.2 * HH);
    else if (L.lower === "long") D = blobPts(300, (yTop + hemY) / 2, { a: (sari ? 0.47 : 0.4) * W, b: (hemY - yTop) / 2, nTop: 2, nBot: 3.2, egg: sari ? 0.2 : 0.05, asym: 0.02 * facing, rot: 0, noise: 0.006, seed: v.seed + 9 });
    else D = blobPts(300, (yTop + hemY) / 2, { a: 0.42 * W, b: (hemY - yTop) / 2, nTop: 2, nBot: 2.6, egg: 0.32, asym: 0.02 * facing, rot: 0, noise: 0.006, seed: v.seed + 9 });
    p.gradFill(D, lowerCol, mul(lowerCol, SH_CLOTH), light);
    if (!v.sil) p.clip(D, () => {
      const yb = sit ? hipY + 0.26 * HH : hemY;
      if (L.border) { p.band([[0, yb - 0.07 * HH], [600, yb - 0.07 * HH]], L.border, 0.13 * HH, 0); p.band([[0, yb - 0.14 * HH], [600, yb - 0.14 * HH]], "#e2b04a", 1.6 * u, 0); }
      else p.band([[0, yb - 0.03 * HH], [600, yb - 0.03 * HH]], shade(lowerCol, 0.75), 2.4 * u, 0);
      if (sari && !sit && !back) for (const dx of [-7, 2, 11]) p.stroke([[300 + dx * u, yTop + 0.25 * HH], [300 + dx * 1.5 * u, hemY - 0.2 * HH]], 1.6 * u, shade(lowerCol, 0.72));
      if (v.g.kind === "lungi") for (let y = yTop; y < hemY; y += 0.12 * HH) p.stroke([[0, y], [600, y]], 1.4 * u, shade(lowerCol, 0.75));
    });
    p.inkRing(D, ow, thick);
  }
  // ---- torso (tunics run down to their hem) ----
  const tBot = L.lower === "tunic" && !sit ? hemY : torsoBot;
  T.b = 0.5 * (tBot - (chin - 0.25 * HH));
  const tcx = 300 + 3 * u * facing, tp = blobPts(tcx, tBot - T.b, T);
  const Sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const hang = (side: number, fwd: number): [P2, P2, P2] => {
    const S = Sh(side), ex = tcx + side * (1.12 * T.a + 4 * u);
    return [S, [ex, S[1] + 0.48 * HH], [ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd), chin + 1.04 * HH - Math.abs(fwd) * 9 * u]];
  };
  // arms: [points, in front of the body]
  const sw = mode === "stroll" ? Math.sin(two * phase) : 0, s = facing || 1;
  type Arm = { pts: [P2, P2, P2]; front: boolean };
  const arms: Arm[] = [];
  const reach = (side: number, hand: P2, out = 1.15): Arm => { const S = Sh(side); return { pts: [S, [tcx + side * out * T.a + side * 6 * u, (S[1] + hand[1]) / 2 + 0.08 * HH], hand], front: true }; };
  const kk = Math.abs(Math.sin(Math.PI * poseT));
  let mouthHand: P2 | null = null;
  switch (back ? "none" : pose) {
    case "sew":
      arms.push(reach(-1, [tcx - 0.25 * T.a, torsoBot - 0.02 * HH]), reach(1, [tcx + 0.4 * T.a, torsoBot - 0.06 * HH - 0.3 * HH * kk])); break;
    case "husk":
      for (const side of [-1, 1]) { const S = Sh(side); arms.push({ pts: [S, [tcx + side * 1.1 * T.a, S[1] - 0.32 * HH], [tcx + side * 0.42 * T.a, crown - 0.12 * HH]], front: false }); }
      break;
    case "water": {
      const S = Sh(-1), pot: P2 = [tcx - 1.08 * T.a, torsoBot - 0.06 * HH];
      arms.push({ pts: [S, [tcx - 1.3 * T.a, S[1] + 0.32 * HH], [pot[0] + 0.06 * HH, pot[1] - 0.25 * HH]], front: true }, { pts: hang(1, 0), front: false });
      break;
    }
    case "type": // both hands on the keys, tapping in turn
      arms.push(reach(-1, [tcx - 0.42 * T.a, torsoBot - 0.24 * HH + 0.035 * HH * Math.max(0, Math.sin(two * poseT * 4))]), reach(1, [tcx + 0.42 * T.a, torsoBot - 0.24 * HH + 0.035 * HH * Math.max(0, Math.sin(two * poseT * 4 + 2.2))])); break;
    case "scribble": // the pen hand moves along the line and back
      arms.push(reach(-1, [tcx - 0.35 * T.a, torsoBot - 0.16 * HH]), reach(1, [tcx + (0.05 + 0.32 * ((poseT * 0.7) % 1)) * T.a, torsoBot - 0.2 * HH + 0.05 * HH * Math.sin(two * poseT * 4)])); break; // short strokes along the line, then back
    case "write":
      arms.push(reach(-1, [tcx - 0.35 * T.a, torsoBot - 0.16 * HH]), reach(1, [tcx + 0.28 * T.a, torsoBot - 0.2 * HH + 0.02 * HH * Math.sin(two * poseT * 3)])); break;
    case "eat": {
      const k = smoothK(kk), hand = lerp2([tcx + 0.3 * T.a, torsoBot - 0.08 * HH], [300 + 10 * u * facing + 6 * u, hc + 0.3 * HH], k);
      mouthHand = hand;
      arms.push(reach(-1, [tcx - 0.45 * T.a, torsoBot - 0.05 * HH]), { pts: [Sh(1), [tcx + 1.25 * T.a + 6 * u, Sh(1)[1] + 0.28 * HH - 0.2 * HH * k], hand], front: true });
      break;
    }
    case "phone": {
      const S = Sh(s);
      arms.push({ pts: [S, [tcx + s * (1.3 * T.a + 6 * u), S[1] + 0.12 * HH], [300 + s * 0.86 * H.a + 3 * u * facing, hc + 0.12 * HH]], front: true }, { pts: hang(-s, 0), front: false });
      break;
    }
    case "hug":
      for (const side of [-1, 1]) { const S = Sh(side); arms.push({ pts: [S, [tcx + side * 1.22 * T.a, S[1] + 0.22 * HH], [tcx - side * 0.2 * T.a, S[1] + 0.3 * HH]], front: true }); }
      break;
    case "holdhand": { // one hand down and out to the other person's, the other arm at the side
      const S = Sh(s);
      arms.push({ pts: [S, [tcx + s * 1.15 * T.a, S[1] + 0.5 * HH], [tcx + s * (1.2 * T.a + 26 * u), torsoBot - 0.02 * HH]], front: true }, { pts: hang(-s, 0), front: false });
      break;
    }
    case "rub": { // rubbing one eye: upper arm down and out to a bent elbow, forearm up to the eye (redrawn over the face, below)
      arms.push({ pts: [Sh(s), [300 + s * 1.12 * H.a, chin + 0.22 * HH], [300 + s * 0.3 * H.a + 7 * u * facing, hc - 0.02 * HH]], front: true }, { pts: hang(-s, 0), front: false });
      break;
    }
    case "read": // both hands hold an open book at the chest
      for (const side of [-1, 1]) arms.push(reach(side, [tcx + side * 0.34 * T.a, chin + 0.42 * HH], 1.05));
      break;
    case "stick": { // one hand up and out, waving a stick
      const S = Sh(s);
      arms.push({ pts: [S, [tcx + s * 1.3 * T.a, S[1] + 0.12 * HH], [tcx + s * (1.25 * T.a + 22 * u), chin - 0.04 * HH]], front: true }, { pts: hang(-s, 0.4), front: false });
      break;
    }
    case "lean": { // elbow propped, chin in the hand
      arms.push({ pts: [Sh(s), [tcx + s * 1.45 * T.a, torsoBot - 0.1 * HH], [300 + s * 0.3 * H.a, hc + 0.55 * HH]], front: true }, reach(-s, [tcx - s * 0.5 * T.a, torsoBot - 0.02 * HH]));
      break;
    }
    case "key": case "paper": case "notes": {
      const S = Sh(s);
      arms.push({ pts: [S, [tcx + s * 1.2 * T.a, S[1] + 0.2 * HH], [tcx + s * (1.25 * T.a + 30 * u), S[1] + 0.2 * HH]], front: true }, { pts: hang(-s, 0), front: false });
      break;
    }
    default:
      if (sit) for (const side of [-1, 1]) arms.push(reach(side, [tcx + side * 0.6 * T.a, torsoBot - 0.02 * HH], 1.1));
      else arms.push({ pts: hang(-1, -sw), front: false }, { pts: hang(1, sw), front: false });
  }
  const sleeveCol = mix(top, INK, 0.3), armSkin = mix(skin, INK, 0.18);
  const drawArm = (a: Arm) => {
    const bent = pose === "rub" && a.front, c = bent ? [a.pts[0], a.pts[1], a.pts[2]] : curve(a.pts[0], a.pts[1], a.pts[2]);
    if (bent) { // an inked bent arm: upper arm in its sleeve (short: half way to the elbow), the forearm up to the eye
      const se: P2 = [a.pts[0][0] + (a.pts[1][0] - a.pts[0][0]) * (L.sleeve === "short" ? 0.6 : 1.0), a.pts[0][1] + (a.pts[1][1] - a.pts[0][1]) * (L.sleeve === "short" ? 0.6 : 1.0)];
      p.stroke(c, 5.2 * u + 2.8 * u, INK); p.stroke(c, 5.2 * u, armSkin);
      p.stroke([a.pts[0], se], 8 * u + 2.8 * u, INK); p.stroke([a.pts[0], se], 8 * u, sleeveCol);
    } else {
    p.stroke(c, 5.2 * u, armSkin);
    p.stroke(c.slice(0, L.sleeve === "short" ? 4 : 9), 6.6 * u, sleeveCol);
    }
    if (bent) { // a loose fist at the eye
      const [hx, hy] = a.pts[2], ol = p.ol; p.ol = 1.2 * u;
      p.poly(rrect(hx - 6 * u, hy - 5 * u, hx + 6 * u, hy + 6 * u, 4 * u), skin, 1.4 * u);
      for (let k = 0; k < 3; k++) p.stroke([[hx - 4 * u + k * 4 * u, hy - 4.5 * u], [hx - 3.6 * u + k * 4 * u, hy - 2 * u]], 0.8 * u, mix(skin, INK, 0.45));
      p.ol = ol;
    } else if (!((pose === "key" || pose === "paper" || pose === "notes") && a.front)) p.dot(a.pts[2][0], a.pts[2][1], 5.5 * u);
  };
  if (!back && v.g.kind === "salwar") for (const side of [-1, 1]) { const S = Sh(side); p.band([S, [S[0] + side * 10 * u, chin + 0.95 * HH]], C(v.g.orna), 9 * u, 1.4 * u, "round"); } // orna ends behind
  if (!back && v.hair === "plaits") for (const side of [-1, 1]) p.band([[300 + side * 0.8 * H.a, hc + 0.2 * HH], [300 + side * 0.9 * H.a, chin + 0.55 * HH]], hair, 8 * u, 1.4 * u, "round");
  for (const a of arms) if (!a.front) drawArm(a);
  // pose props that sit behind the hands
  if (!back && pose === "water") {
    const c: P2 = [tcx - 1.08 * T.a, torsoBot - 0.06 * HH], R = 0.3 * HH, kol = "#b4603b";
    const body = ellPts(c[0], c[1], R, R * 0.92);
    p.shadedFill(body, kol, mul(kol, [0.7, 0.62, 0.62]), light, R); p.inkRing(body, ow * 0.8, thick);
    p.poly(rrect(c[0] - 0.42 * R, c[1] - 1.2 * R, c[0] + 0.42 * R, c[1] - 0.8 * R, 3 * u), shade(kol, 0.9), 2.4 * u);
    p.ell(c[0], c[1] - 1.2 * R, 0.55 * R, 0.14 * R, shade(kol, 1.1), 2.4 * u);
  }
  // ---- torso fill + garment details ----
  p.gradFill(tp, top, mul(top, SH_CLOTH), light);
  if (!v.sil && !back) p.clip(tp, () => {
    const g = v.g, tTop = chin;
    switch (g.kind) {
      case "sari": { // the pallu across the chest from the right hip to the left shoulder, border along its edge
        const a: P2 = [tcx + 1.0 * T.a, tBot - 0.02 * HH], b: P2 = [tcx - 0.7 * T.a, tTop - 0.02 * HH];
        p.band([a, b], g.border, 0.62 * T.a, 0); p.band([a, b], g.body, 0.48 * T.a, 0);
        p.band([[a[0] + 6 * u, a[1]], [b[0] + 6 * u, b[1]]], "#e2b04a", 1.4 * u, 0);
        break;
      }
      case "frock":
        for (const side of [-1, 1]) p.ell(tcx + side * 9 * u, tTop + 5 * u, 11 * u, 7 * u, g.collar, 1.6 * u);
        p.band([[0, torsoBot - 0.1 * HH], [600, torsoBot - 0.1 * HH]], shade(g.body, 0.8), 3 * u, 0);
        break;
      case "salwar": case "kurti": {
        p.stroke([[tcx - 9 * u, tTop], [tcx, tTop + 14 * u], [tcx + 9 * u, tTop]], 2.4 * u, shade(top, 0.6));
        const trim = g.kind === "kurti" ? g.trim : "#f2e2b8";
        for (let i = 0; i < 5; i++) p.dot(tcx + (i - 2) * 6 * u, tTop + 18 * u + Math.abs(i - 2) * -3 * u, 1.6 * u, trim);
        if (g.kind === "kurti") { p.band([[0, tBot - 0.05 * HH], [600, tBot - 0.05 * HH]], g.trim, 3 * u, 0); p.stroke([[tcx, tTop + 14 * u], [tcx, tTop + 40 * u]], 1.4 * u, shade(top, 0.6)); }
        break;
      }
      case "uniform":
        p.poly([[tcx - 0.48 * T.a, tTop + 0.28 * HH], [tcx + 0.48 * T.a, tTop + 0.28 * HH], [tcx + 0.56 * T.a, tBot + 4 * u], [tcx - 0.56 * T.a, tBot + 4 * u]], g.pinafore, 1.6 * u);
        for (const side of [-1, 1]) p.band([[tcx + side * 0.42 * T.a, tTop + 0.29 * HH], [tcx + side * 0.62 * T.a, tTop]], g.pinafore, 4 * u, 0.8 * u);
        for (const side of [-1, 1]) p.poly([[tcx, tTop + 2 * u], [tcx + side * 13 * u, tTop - 2 * u], [tcx + side * 9 * u, tTop + 9 * u]], "#ffffff", 1.4 * u);
        break;
      case "shirt": case "lungi": {
        const sc = g.kind === "shirt" ? g.shirt : g.shirt;
        if (g.kind === "shirt" && g.check) for (let k = -6; k <= 6; k++) { p.stroke([[tcx + k * 9 * u, tTop - 10 * u], [tcx + k * 9 * u, tBot + 10 * u]], 1.6 * u, g.check); p.stroke([[tcx - 70 * u, tTop + k * 9 * u + 40 * u], [tcx + 70 * u, tTop + k * 9 * u + 40 * u]], 1.6 * u, g.check); }
        for (const side of [-1, 1]) p.poly([[tcx, tTop + 3 * u], [tcx + side * 14 * u, tTop - 2 * u], [tcx + side * 10 * u, tTop + 10 * u]], shade(sc, 1.08), 1.4 * u);
        p.stroke([[tcx + 1.5 * u * facing, tTop + 4 * u], [tcx + 1.5 * u * facing, tBot]], 1.4 * u, shade(sc, 0.65));
        for (let i = 0; i < 3; i++) p.dot(tcx + 3 * u + 1.5 * u * facing, tTop + 14 * u + i * 0.18 * HH, 1.8 * u, shade(sc, 0.55));
        if (g.kind === "lungi" && g.vest) for (const side of [-1, 1]) { // open vest: two front panels over the shirt
          const x0 = tcx + side * 6 * u, x1 = tcx + side * 1.02 * T.a;
          p.poly([[x0, tTop + 6 * u], [tcx + side * 13 * u, tTop - 2 * u], [x1, tTop + 0.1 * HH], [x1, tBot - 2 * u], [x0 + side * 2 * u, tBot - 2 * u]], C(g.vest), 1.4 * u);
          p.dot(x0 + side * 5 * u, tTop + 0.3 * HH, 1.6 * u, shade(g.vest, 0.6));
        }
        if (g.kind === "shirt" && g.lanyard) { // office ID on a lanyard
          p.band([[tcx - 12 * u, tTop - 3 * u], [tcx, tTop + 0.4 * HH], [tcx + 12 * u, tTop - 3 * u]], g.lanyard, 2.6 * u, 0.6 * u);
          p.poly(rrect(tcx - 9 * u, tTop + 0.4 * HH, tcx + 9 * u, tTop + 0.4 * HH + 22 * u, 2 * u), "#f4f4f0", 1.4 * u);
          p.band([[tcx - 9 * u, tTop + 0.4 * HH + 5 * u], [tcx + 9 * u, tTop + 0.4 * HH + 5 * u]], "#2f5f8a", 4 * u, 0);
        }
        break;
      }
      case "fatua":
        p.band([[tcx - 10 * u, tTop + 1 * u], [tcx + 10 * u, tTop + 1 * u]], shade(g.top, 0.75), 3 * u, 0);
        p.stroke([[tcx, tTop + 2 * u], [tcx, tTop + 0.32 * HH]], 1.4 * u, shade(g.top, 0.6));
        for (let i = 0; i < 3; i++) p.dot(tcx + 3 * u, tTop + 9 * u + i * 0.09 * HH, 1.8 * u, shade(g.top, 0.5));
        break;
      case "bank":
        p.poly([[tcx - 13 * u, tTop - 2 * u], [tcx + 13 * u, tTop - 2 * u], [tcx, tTop + 0.48 * HH]], g.top, 1.4 * u);
        for (const side of [-1, 1]) p.stroke([[tcx + side * 13 * u, tTop - 2 * u], [tcx + side * 6 * u, tTop + 0.48 * HH]], 1.8 * u, shade(g.blazer, 0.6));
        p.band([[tcx - 12 * u, tTop - 3 * u], [tcx, tTop + 0.4 * HH], [tcx + 12 * u, tTop - 3 * u]], g.lanyard, 2.6 * u, 0.6 * u);
        p.poly(rrect(tcx - 9 * u, tTop + 0.4 * HH, tcx + 9 * u, tTop + 0.4 * HH + 22 * u, 2 * u), "#f4f4f0", 1.4 * u);
        p.band([[tcx - 9 * u, tTop + 0.4 * HH + 5 * u], [tcx + 9 * u, tTop + 0.4 * HH + 5 * u]], "#2f5f8a", 4 * u, 0);
        break;
    }
  });
  p.inkRing(tp, ow, thick);
  if (!back && v.g.kind === "salwar") { // orna across the chest
    const a = Sh(-1), b = Sh(1);
    p.band(curve([a[0] - 2 * u, a[1] - 2 * u], [tcx, chin + 0.42 * HH], [b[0] + 2 * u, b[1] - 2 * u], 14), C(v.g.orna), 10 * u, 1.4 * u, "round");
  }
  // ---- in front: arms + hand props ----
  if (!back && prop && pose === "sew") { // kantha on the lap, thread to the needle hand
    p.poly(rrect(tcx - 0.75 * T.a, torsoBot - 0.1 * HH, tcx + 0.45 * T.a, torsoBot + 0.04 * HH, 3 * u), "#c0503f", 2 * u);
    for (let x = tcx - 0.68 * T.a; x < tcx + 0.4 * T.a; x += 6 * u) p.stroke([[x, torsoBot - 0.03 * HH], [x + 3 * u, torsoBot - 0.03 * HH]], 1.2 * u, "#f4ead2");
  }
  if (!back && prop && pose === "eat") {
    p.ell(tcx, torsoBot - 0.01 * HH, 0.8 * T.a, 0.1 * HH, "#c9ced4", 2 * u);
    p.ell(tcx - 4 * u, torsoBot - 0.04 * HH, 0.4 * T.a, 0.06 * HH, "#f6f2e6", 1.4 * u);
  }
  if (!back && prop && (pose === "write" || pose === "scribble")) {
    p.poly([[tcx - 0.6 * T.a, torsoBot - 0.12 * HH], [tcx + 0.55 * T.a, torsoBot - 0.12 * HH], [tcx + 0.6 * T.a, torsoBot - 0.01 * HH], [tcx - 0.65 * T.a, torsoBot - 0.01 * HH]], "#f4f1e8", 1.8 * u);
  }
  for (const a of arms) if (a.front) drawArm(a);
  if (!back) {
    const hands = arms.filter((a) => a.front).map((a) => a.pts[2]);
    if (pose === "sew" && hands[1]) p.stroke([[tcx + 0.05 * T.a, torsoBot - 0.05 * HH], hands[1]], 1.1 * u, "#f4ead2");
    if ((pose === "write" || pose === "scribble") && hands[1]) p.band([hands[1], [hands[1][0] + 10 * u, hands[1][1] - 14 * u]], "#2f5f8a", 2.4 * u, 0.8 * u, "round");
    if (pose === "eat" && mouthHand && prop) p.ell(mouthHand[0], mouthHand[1] - 4 * u, 5 * u, 3.5 * u, "#f6f2e6", 1.2 * u);
    if (pose === "read" && prop) { // an open book over the hands, the thumbs on its edges
      const bx = tcx, by = chin + 0.4 * HH;
      for (const side of [-1, 1]) p.poly([[bx, by - 12 * u], [bx + side * 24 * u, by - 15 * u], [bx + side * 25 * u, by + 13 * u], [bx, by + 16 * u]], "#f3efe4", 1.6 * u);
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) p.stroke([[bx + side * 4 * u, by - 7 * u + i * 5.5 * u], [bx + side * 20 * u, by - 9 * u + i * 5.5 * u]], 0.9 * u, "#8a8f9a");
      p.stroke([[bx, by - 12 * u], [bx, by + 16 * u]], 1.2 * u, "#3f6fb5");
      for (const side of [-1, 1]) p.dot(bx + side * 22 * u, by + 9 * u, 3.6 * u, skin), p.dot(bx + side * 22 * u, by + 9 * u, 3.6 * u, mix(skin, INK, 0.1));
    }
    if (pose === "stick" && hands[0]) { const [hx, hy] = hands[0]; p.band([[hx - s * 10 * u, hy + 36 * u], [hx + s * 22 * u, hy - 56 * u]], "#9a6a3a", 3.2 * u, 1.1 * u, "round"); p.dot(hx, hy, 5.5 * u); }
    if (pose === "phone" && hands[0]) p.poly(rrect(hands[0][0] - 5 * u, hands[0][1] - 12 * u, hands[0][0] + 5 * u, hands[0][1] + 8 * u, 2 * u), "#2a2a33", 1.6 * u);
    if (pose === "notes" && hands[0]) {
      const [hx, hy] = hands[0];
      ["#8fbf86", "#d892a8", "#9fb7d8"].forEach((col, i) => { const rot = p.rot; p.rot = [(i - 1) * 0.28 * s, hx, hy]; p.poly(rrect(hx + s * 2 * u, hy - 9 * u, hx + s * 30 * u, hy + 5 * u, 1.5 * u), col, 1.4 * u); p.rot = rot; });
      holdHand(p, hx, hy, s, u, skin);
    }
    if (pose === "key" && hands[0]) { if (prop) pinchHand(p, hands[0][0], hands[0][1], s, u, skin, poseT); else openPalm(p, hands[0][0], hands[0][1], s, u, skin); }
    if (pose === "paper" && hands[0] && prop) {
      const [hx, hy] = hands[0];
      p.poly([[hx, hy - 20 * u], [hx + s * 30 * u, hy - 22 * u], [hx + s * 31 * u, hy + 18 * u], [hx + s * 1 * u, hy + 20 * u]], "#f6f3ea", 1.8 * u);
      for (let i = 0; i < 4; i++) p.stroke([[hx + s * 6 * u, hy - 12 * u + i * 8 * u], [hx + s * 24 * u, hy - 13 * u + i * 8 * u]], 1.2 * u, "#8a8f9a");
      holdHand(p, hx, hy, s, u, skin);
    }
  }
  if (!back && pose === "husk") for (const side of [-1, 1]) p.stroke([[tcx + side * 0.42 * T.a, crown - 0.12 * HH], [tcx + side * 0.42 * T.a, 0]], 1.8 * u, "#8a7550");
  // ---- head ----
  const hp = blobPts(300, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  // hair cap: the head contour above a cut line, slightly enlarged (back view: covers most of the head)
  const cut = back ? hc + 0.32 * HH : crown + (v.hair === "short" ? 0.36 : v.hair === "anchal" ? 0.3 : 0.4) * HH;
  const n = hp.length, keep = (y: number) => y < cut;
  const start = Math.max(0, hp.findIndex(([, y], i) => keep(y) && !keep(hp[(i + n - 1) % n][1])));
  const capPts = [...hp.slice(start), ...hp.slice(0, start)].filter(([, y]) => keep(y)).map(([x, y]) => [300 + (x - 300) * 1.03, hc + (y - hc) * 1.03] as P2);
  if (capPts.length > 2) {
    p.shadedFill(capPts, hair, mul(hair, SH_FELT), light, H.a, 0.35);
    p.poly(capPts, null, ow);
    if (!back && !v.sil) {
      if (v.hair === "short") for (const dx of [-12, 0, 12]) p.stroke([[300 + (dx + 6 * facing) * u, cut - 14 * u], [300 + (dx + 3 + 6 * facing) * u, cut - 2 * u]], 1.6 * u, mix(hair, "#ffffff", 0.18));
      else p.stroke([[300 + 3 * u * facing, crown + 4 * u], [300 + 3 * u * facing, cut - 4 * u]], 1.8 * u, mix(hair, "#ffffff", 0.22));
    }
  }
  if (v.topi && !back) { // skull cap over the crown: a low dome with a band of crochet dots
    const dome = ellPts(300, crown + 0.27 * HH, 0.86 * H.a, 0.3 * HH, 180, 360, 0, 28);
    p.poly(dome, C(v.topi), ow);
    for (let i = -4; i <= 4; i++) p.dot(300 + i * 0.17 * H.a, crown + 0.21 * HH - Math.abs(i) * 0.008 * HH, 1.5 * u, mix(v.topi, INK, 0.25));
  }
  if (back && v.hair === "bun") { const b = ellPts(300, hc + 0.22 * HH, 0.36 * H.a, 0.3 * H.a); p.shadedFill(b, hair, mul(hair, SH_FELT), light, 0.36 * H.a); p.inkRing(b, ow * 0.8, thick); }
  if (!back && v.hair === "plaits") for (const side of [-1, 1]) { // braid ticks + ribbon bows at the ends
    const x0 = 300 + side * 0.8 * H.a, x1 = 300 + side * 0.9 * H.a;
    for (let i = 1; i < 5; i++) { const y = hc + 0.2 * HH + i * 0.07 * HH, x = x0 + (x1 - x0) * (i / 5); p.stroke([[x - 3 * u, y - 2 * u], [x + 3 * u, y + 2 * u]], 1.4 * u, mix(hair, "#ffffff", 0.2)); }
    const by = chin + 0.55 * HH, rc = C(v.ribbon ?? "#d23b3b");
    p.poly([[x1, by], [x1 - 9 * u, by - 6 * u], [x1 - 9 * u, by + 6 * u]], rc, 1.4 * u);
    p.poly([[x1, by], [x1 + 9 * u, by - 6 * u], [x1 + 9 * u, by + 6 * u]], rc, 1.4 * u);
  }
  if (v.hair === "anchal" && v.anchal && !back) { // the sari end pulled over the head, its border framing the face
    const outer: P2[] = [[300 - 1.12 * H.a, chin + 0.26 * HH], ...ellPts(300, hc, 1.15 * H.a, 1.12 * H.b, 180, 360, 0, 36), [300 + 1.12 * H.a, chin + 0.26 * HH]];
    const inner = ellPts(300 + 3 * u * facing, hc + 0.05 * HH, 0.9 * H.a, 0.84 * H.b, 360, 180, 0, 36);
    const hood = [...outer, ...inner];
    p.gradFill(hood, C(v.anchal.col), mul(C(v.anchal.col), SH_CLOTH), light);
    if (!v.sil) p.stroke(inner, 4 * u, v.anchal.border);
    p.poly(hood, null, ow);
  }
  if (!back && !v.sil) faceFront(p, 300, hc, W, expr, facing, look, lid, false, skin);
  if (!back && pose === "rub") { const ra = arms.find((x) => x.front); if (ra) drawArm(ra); }
  p.rot = null;
};
const smoothK = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** body metrics of a standing villager (design units), for drawings that combine two people */
const vMetrics = (v: Villager, facing: number) => {
  const Bd = BUILD[v.build], H = headBlob(v.seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100, L = garmentLook(v.g);
  const torsoBot = 975 - Bd.legs * HH, chin = torsoBot - Bd.torso * HH;
  return { u, HH, chin, hc: chin - H.b, Ta: ((Bd.tw / 2) * W) / 1.06 * (L.lower === "tunic" ? 1.06 : 1), tcx: 300 + 3 * u * facing, sleeve: L.sleeve, top: L.top, skin: v.skin };
};
/** two people in one embrace on one card: `a` (left, behind) holds `b` (right, in front); b's near arm round a's waist */
export const hugPair = (p: Pen, a: Villager, b: Villager, oa: VOpts, ob: VOpts) => {
  const g = p.g, dA = -62, dB = 58, ma = vMetrics(a, 1), mb = vMetrics(b, -1);
  const arm = (m: ReturnType<typeof vMetrics>, pts: P2[]) => {
    const c = curve(pts[0], pts[1], pts[2]);
    p.stroke(c, 5.2 * m.u, mix(m.skin, INK, 0.18));
    p.stroke(c.slice(0, m.sleeve === "short" ? 4 : 9), 6.6 * m.u, mix(m.top, INK, 0.3));
    p.dot(pts[2][0], pts[2][1], 5.5 * m.u);
  };
  g.save(); g.translate(dA, 0); villagerFront(p, a, { ...oa, facing: 1, pose: "none" }); g.restore();
  // b's near arm round a's waist (over a, under b)
  arm(mb, [[mb.tcx + dB - 0.85 * mb.Ta, mb.chin + 0.12 * mb.HH], [300 - 10 * mb.u, mb.chin + 0.5 * mb.HH], [300 + dA - 0.55 * ma.Ta, ma.chin + 0.62 * ma.HH]]);
  g.save(); g.translate(dB, 0); villagerFront(p, b, { ...ob, facing: -1, pose: "none" }); g.restore();
  // a's arms over b's shoulders and back
  arm(ma, [[ma.tcx + dA + 0.85 * ma.Ta, ma.chin + 0.12 * ma.HH], [300 + 20 * ma.u, mb.chin + 0.05 * mb.HH], [300 + dB + 0.75 * mb.Ta, mb.chin + 0.3 * mb.HH]]);
  arm(ma, [[ma.tcx + dA + 0.8 * ma.Ta, ma.chin + 0.3 * ma.HH], [300 + 10 * ma.u, mb.chin + 0.55 * mb.HH], [300 + dB + 0.6 * mb.Ta, mb.chin + 0.7 * mb.HH]]);
};

// ---------------- hands for close-ups ----------------
/** an open palm turned up, receiving: outlined skin, four fingers toward `s`, a thumb, two soft palm lines */
const openPalm = (p: Pen, hx: number, hy: number, s: number, u: number, skin: string) => {
  const ol = p.ol; p.ol = 1.2 * u;
  for (let k = 0; k < 4; k++) { const y = hy - 4 * u + k * 2.6 * u, x0 = hx + s * 9 * u; p.line([[x0, y], [x0 + s * (9 - k * 1.2) * u, y - (2.2 - k * 0.5) * u]], skin, 2.4 * u); }
  p.poly(ellPts(hx + s * 4 * u, hy, 9 * u, 6 * u), skin, 1.4 * u);
  p.line([[hx + s * 1 * u, hy - 4 * u], [hx + s * 6 * u, hy - 11 * u]], skin, 2.8 * u); // thumb
  const crease = mix(skin, INK, 0.45);
  p.stroke(curve([hx - s * 2 * u, hy - 1 * u], [hx + s * 4 * u, hy + 1.5 * u], [hx + s * 10 * u, hy - 1 * u], 8), 0.8 * u, crease);
  p.stroke(curve([hx - s * 1 * u, hy + 2.5 * u], [hx + s * 4 * u, hy + 3.5 * u], [hx + s * 8 * u, hy + 2 * u], 8), 0.7 * u, crease);
  p.ol = ol;
};
/** a brass key: round bow with a hole, shaft, two teeth, a glint; hangs from (kx, ky) */
const brassKey = (p: Pen, kx: number, ky: number, u: number, tilt: number) => {
  const rot = p.rot; p.rot = [tilt, kx, ky];
  const brass = "#d9a93a", dark = "#8a6420";
  p.ell(kx, ky + 4.5 * u, 4.6 * u, 4.6 * u, brass, 1.2 * u); p.ell(kx, ky + 4.5 * u, 1.8 * u, 1.8 * u, dark, 0.9 * u);
  p.poly(rrect(kx - 1.1 * u, ky + 8.5 * u, kx + 1.1 * u, ky + 22 * u, 0.8 * u), brass, 1.1 * u);
  p.poly([[kx + 1.1 * u, ky + 17 * u], [kx + 4.2 * u, ky + 17 * u], [kx + 4.2 * u, ky + 18.6 * u], [kx + 1.1 * u, ky + 18.6 * u]], brass, 0.9 * u);
  p.poly([[kx + 1.1 * u, ky + 20 * u], [kx + 3.4 * u, ky + 20 * u], [kx + 3.4 * u, ky + 21.8 * u], [kx + 1.1 * u, ky + 21.8 * u]], brass, 0.9 * u);
  p.dot(kx - 0.3 * u, ky + 12 * u, 0.6 * u, "#fff4cf");
  const gx = kx - 2.2 * u, gy = ky + 2.4 * u; // star glint on the bow
  p.poly([[gx, gy - 3.4 * u], [gx + 0.7 * u, gy - 0.7 * u], [gx + 3.4 * u, gy], [gx + 0.7 * u, gy + 0.7 * u], [gx, gy + 3.4 * u], [gx - 0.7 * u, gy + 0.7 * u], [gx - 3.4 * u, gy], [gx - 0.7 * u, gy - 0.7 * u]], "#fffbe8", 0);
  p.rot = rot;
};
/** the giver's hand from above, thumb and finger pinching the bow; the key hangs (and swings a little) below */
const pinchHand = (p: Pen, hx: number, hy: number, s: number, u: number, skin: string, t: number) => {
  const ol = p.ol; p.ol = 1.2 * u;
  brassKey(p, hx + s * 9 * u, hy + 3 * u, u * 1.9, 0.1 * Math.sin(t * 7));
  p.poly(rrect(hx - 5 * u, hy - 6 * u, hx + 7 * u, hy + 4 * u, 3.5 * u), skin, 1.4 * u);
  p.line([[hx + s * 4 * u, hy - 2 * u], [hx + s * 9 * u, hy + 5 * u]], skin, 2.4 * u); // index
  p.line([[hx + s * 1 * u, hy + 1 * u], [hx + s * 7 * u, hy + 6 * u]], skin, 2.4 * u); // thumb
  for (let k = 0; k < 3; k++) p.stroke([[hx - 3 * u + k * 3 * u, hy - 5.5 * u], [hx - 2.6 * u + k * 3 * u, hy - 3 * u]], 0.7 * u, mix(skin, INK, 0.45)); // knuckles
  p.ol = ol;
};
/** standing head-centre height (design units) and a head-only drawing (sleepers on the pillow) */
export const villagerHeadY = (v: Villager) => vMetrics(v, 0).hc;
export const villagerHeadOnly = (p: Pen, v: Villager, o: VOpts) => {
  const m = vMetrics(v, 0), g = p.g;
  g.save(); g.beginPath(); g.rect(0, 0, 600, m.chin + 3 * m.u); g.clip();
  villagerFront(p, v, { ...o, mode: "stand", pose: "none" });
  g.restore();
};

// ---------------- the family hug (shot 21) on one card ----------------
/** Mother in the centre; Nusrat (left) and Mim (right) pressed against her sides, their near arms round her waist;
 *  Rahat behind her, a little higher, his hands on her shoulders. Heads touch. Drawn at FAMILY_HUG_S so the group fits the
 *  600-unit card; cast.ts scales the card up by 1 / FAMILY_HUG_S. */
export const FAMILY_HUG_S = 0.62;
export const familyHug = (p: Pen, mother: Villager, left: Villager, right: Villager, back: Villager, om: VOpts, ol: VOpts, or: VOpts, ob: VOpts) => {
  const g = p.g, S = FAMILY_HUG_S, mm = vMetrics(mother, 0), ml = vMetrics(left, 1), mr = vMetrics(right, -1), mb = vMetrics(back, 0);
  g.save(); g.translate(300 * (1 - S), 975 * (1 - S)); g.scale(S, S);
  const put = (v: Villager, dx: number, dy: number, rot: number, vo: VOpts) => {
    g.save(); g.translate(dx, dy); if (rot) { g.translate(300, 975); g.rotate(rot); g.translate(-300, -975); }
    villagerFront(p, v, vo); g.restore();
  };
  const arm = (m: ReturnType<typeof vMetrics>, pts: P2[]) => {
    const c = curve(pts[0], pts[1], pts[2]);
    p.stroke(c, 5.2 * m.u, mix(m.skin, INK, 0.18)); p.stroke(c.slice(0, m.sleeve === "short" ? 4 : 9), 6.6 * m.u, mix(m.top, INK, 0.3)); p.dot(pts[2][0], pts[2][1], 5.5 * m.u);
  };
  const dB = 34, dyB = mm.hc - 0.72 * mm.HH - mb.hc, dL = -200, dR = 200, tL = 0.07, tR = -0.07;
  put(back, dB, dyB, 0, { ...ob, facing: 0 });                       // Rahat behind (raised: his head rests on hers)
  put(left, dL, 0, tL, { ...ol, facing: 1 });                         // Nusrat, leaning in
  put(right, dR, 0, tR, { ...or, facing: -1 });                       // Mim, leaning in
  put(mother, 0, 0, 0, { ...om, facing: 0 });                         // the mother, in front of them all
  arm(ml, [[300 + dL + 0.85 * ml.Ta, ml.chin + 0.14 * ml.HH], [300 - 0.95 * mm.Ta, mm.chin + 0.5 * mm.HH], [300 - 0.55 * mm.Ta, mm.chin + 0.74 * mm.HH]]); // Nusrat's arm round her side
  arm(mr, [[300 + dR - 0.85 * mr.Ta, mr.chin + 0.14 * mr.HH], [300 + 0.95 * mm.Ta, mm.chin + 0.5 * mm.HH], [300 + 0.55 * mm.Ta, mm.chin + 0.74 * mm.HH]]); // Mim's round the other side
  for (const s of [-1, 1]) { const sh: P2 = [300 + s * 0.78 * mm.Ta, mm.chin + 0.1 * mm.HH]; arm(mb, [[sh[0] + s * 0.12 * mm.HH, sh[1] - 0.3 * mm.HH], [sh[0] + s * 0.1 * mm.HH, sh[1] - 0.14 * mm.HH], sh]); } // Rahat's forearms, hands on her shoulders
  g.restore();
};

/** a hand gripping a sheet edge: back of the fingers over the paper, the thumb in front, knuckle lines */
const holdHand = (p: Pen, hx: number, hy: number, s: number, u: number, skin: string) => {
  const ol = p.ol; p.ol = 1.2 * u;
  p.poly(rrect(hx - 7 * u, hy - 6 * u, hx + 6 * u, hy + 7 * u, 4 * u), skin, 1.4 * u);
  p.line([[hx + s * 1 * u, hy + 4 * u], [hx + s * 7 * u, hy - 2 * u]], skin, 2.6 * u); // thumb onto the sheet
  for (let k = 0; k < 3; k++) p.stroke([[hx - 5 * u, hy - 3 * u + k * 3.6 * u], [hx - 1.5 * u, hy - 3 * u + k * 3.6 * u]], 0.8 * u, mix(skin, INK, 0.45));
  p.ol = ol;
};
/** shot 2: the mother with the water pot on her left hip and little Mim sitting on her right hip, her arm round Mim */
export const motherWithChild = (p: Pen, mother: Villager, child: Villager, om: VOpts, oc: VOpts) => {
  const g = p.g, mm = vMetrics(mother, 0), mc = vMetrics(child, -1), Bm = BUILD[mother.build], Bc = BUILD[child.build];
  const tbM = mm.chin + Bm.torso * mm.HH, HHc = 2 * headBlob(child.seed, Bc.a, -1).b, seatC = 975 - 0.2 * HHc, sc = 0.62;
  villagerFront(p, mother, { ...om, pose: "water" });
  const hipX = mm.tcx + 0.95 * mm.Ta, hipY = tbM - 0.04 * mm.HH;
  // her arm goes round behind the child (drawn first); only the hand shows in front, at the child's waist
  const hand: P2 = [hipX + 0.5 * mc.Ta * sc, hipY - 0.12 * mm.HH];
  const c = curve([mm.tcx + 0.85 * mm.Ta, mm.chin + 0.12 * mm.HH], [hipX + 1.15 * mc.Ta * sc, hipY - 0.32 * mm.HH], hand);
  p.stroke(c, 5.2 * mm.u, mix(mm.skin, INK, 0.18)); p.stroke(c.slice(0, 4), 6.6 * mm.u, mix(mm.top, INK, 0.3));
  g.save(); g.translate(hipX, hipY); g.scale(sc, sc); g.translate(-300, -seatC);
  villagerFront(p, child, { ...oc, mode: "sit", facing: -1 });
  g.restore();
  p.dot(hand[0], hand[1], 5.5 * mm.u);
};

/** shot 28: the mother lying back on the pillows (head + shoulders; the quilt covers the rest). wipe 0..1 lifts her near
 *  hand to the outer corner of her eye, knuckles brushing out along it, and back down. */
/** where her head centre sits on the bed card (design units): the figure is drawn lying, head left, body to the right */
export const BED_PIVOT: P2 = [190, 700];
export const bedRest = (p: Pen, v: Villager, o: VOpts, wipe: number) => {
  const g = p.g, hc = vMetrics(v, 0).hc;
  g.save(); g.translate(BED_PIVOT[0], BED_PIVOT[1]); g.rotate((-84 * Math.PI) / 180); g.translate(-300, -hc);
  bedRestUp(p, v, o, wipe);
  g.restore();
};
const bedRestUp = (p: Pen, v: Villager, o: VOpts, wipe: number) => {
  const m = vMetrics(v, 0), g = p.g, H = m.HH / 2;
  g.save(); g.beginPath(); g.rect(0, 0, 600, m.chin + 0.42 * m.HH); g.clip(); // the blanket's rolled edge covers the cut
  villagerFront(p, v, { ...o, mode: "stand", pose: "none" });
  g.restore();
  if (wipe <= 0 || wipe >= 1) return;
  // the hand on the tear side (screen right): up to the OUTER corner of that eye, a small rub, back down; sleeve on the upper arm
  const up = smoothK(wipe / 0.3) * smoothK((1 - wipe) / 0.25), rub = Math.sin(((wipe - 0.3) / 0.45) * Math.PI * 4) * (wipe > 0.3 && wipe < 0.75 ? 1 : 0);
  const eye: P2 = [300 + 21 * m.u + 1.6 * m.u * rub, m.hc + 1.5 * m.u - 1.2 * m.u * rub], rest: P2 = [300 + 0.7 * m.Ta, m.chin + 0.66 * m.HH];
  const hx = rest[0] + (eye[0] - rest[0]) * up, hy = rest[1] + (eye[1] - rest[1]) * up;
  const sh: P2 = [300 + 0.95 * m.Ta, m.chin + 0.3 * m.HH], el: P2 = [300 + 1.3 * m.Ta + 6 * m.u * up, m.chin + 0.62 * m.HH - 0.2 * m.HH * up];
  const fore: P2[] = [el, [hx + 4 * m.u, hy + 4 * m.u]];
  p.stroke([sh, el, ...fore], 5.2 * m.u + 2.4 * m.u, INK); p.stroke([sh, el, ...fore], 5.2 * m.u, m.skin);
  const sl: P2 = [sh[0] + (el[0] - sh[0]) * 0.75, sh[1] + (el[1] - sh[1]) * 0.75];
  p.stroke([sh, sl], 9 * m.u + 2.4 * m.u, INK); p.stroke([sh, sl], 9 * m.u, m.top); // the blouse sleeve
  const ol = p.ol; p.ol = 1.2 * m.u;
  p.poly(rrect(hx - 4 * m.u, hy - 2 * m.u, hx + 7 * m.u, hy + 9 * m.u, 3.5 * m.u), m.skin, 1.4 * m.u); // loose fist, the crooked index at the corner
  p.line([[hx - 1 * m.u, hy + 1 * m.u], [hx - 3.5 * m.u, hy - 1.5 * m.u]], m.skin, 2.6 * m.u);
  for (let k = 0; k < 2; k++) p.stroke([[hx + 1 * m.u + k * 3 * m.u, hy + 2 * m.u], [hx + 1.4 * m.u + k * 3 * m.u, hy + 4.5 * m.u]], 0.8 * m.u, mix(m.skin, INK, 0.45));
  p.ol = ol;
    void H;
};

// Round 7 hand close-ups ("inserts") and small set effects. Each insert is one unlit ink-outlined card in front of a
// blurred set: the bangle sale on the stall counter (flat on the counter), the notes from the anchal knot, the caliper on
// the machine part, the needle taken from the mother's hand; plus the rain running down the bedroom window.
// Drawn straight on the card canvas (pixels); hands are mitten shapes in the cartoon style: palm, capsule fingers that
// curl, a thumb, all inked in one pass so the outline runs round the whole hand.
import type { Stage } from "./cast";
import { Pen, INK, mix } from "./toon";
import { clamp01, smooth, toPlan, N7, COUNTER, INS9, INS20, NEEDLE, BEDROOM, BED_HEAD, FORM, SHOTS } from "./story";

type P = [number, number];
type G = CanvasRenderingContext2D;
const OL = 9; // ink width at insert scale
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lp = (a: P, b: P, k: number): P => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const qz = (v: number, n = 40) => Math.round(clamp01(v) * n) / n;
/** 0 -> 1 over [a, b] (smoothstep) */
const seg = (u: number, a: number, b: number) => smooth((u - a) / (b - a));

// ---------------- shapes with one ink outline round several parts ----------------
type Part = { poly?: P[]; cap?: P[]; w?: number };
const inked = (g: G, parts: Part[], fill: string) => {
  g.lineCap = "round"; g.lineJoin = "round";
  for (const pass of [0, 1]) for (const pt of parts) {
    g.beginPath();
    const pts = pt.poly ?? pt.cap!;
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (pt.poly) {
      g.closePath();
      if (pass === 0) { g.strokeStyle = INK; g.lineWidth = 2 * OL; g.stroke(); } else { g.fillStyle = fill; g.fill(); }
    } else {
      g.strokeStyle = pass === 0 ? INK : fill; g.lineWidth = (pt.w ?? 20) + (pass === 0 ? 2 * OL : 0); g.stroke();
    }
  }
};
const rr = (x0: number, y0: number, x1: number, y1: number, r: number): P[] => {
  const out: P[] = [];
  const c = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]] as const;
  for (const [cx, cy, a0] of c) for (let i = 0; i <= 6; i++) { const a = ((a0 + (i * 90) / 6) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
};

/**
 * A forearm + hand. The wrist sits at `w`, the hand points along `ang` (radians, canvas), `sc` scales it (1 = an adult
 * hand ~150 px long), `side` = +1/-1 puts the thumb on the left/right of the pointing direction, `curl` 0 (open) -> 1
 * (fist), `palm` shows the palm side (creases) instead of the knuckles. The forearm comes in from `from` (off the card)
 * with a sleeve over its first part.
 */
type HandO = { from: P; w: P; ang: number; sc?: number; side?: 1 | -1; curl?: number; palm?: boolean; skin: string; sleeve?: string; sleeveK?: number; thumb?: number; bare?: boolean };
const hand = (g: G, o: HandO) => {
  const sc = o.sc ?? 1, side = o.side ?? 1, curl = o.curl ?? 0, ca = Math.cos(o.ang), sa = Math.sin(o.ang);
  const L = (x: number, y: number): P => [o.w[0] + (x * ca - y * side * sa) * sc, o.w[1] + (x * sa + y * side * ca) * sc];
  // forearm
  const armW = 46 * sc;
  inked(g, [{ cap: [o.from, o.w], w: armW }], o.skin);
  if (o.sleeve) { const k = o.sleeveK ?? 0.45, e = lp(o.from, o.w, k); inked(g, [{ cap: [o.from, e], w: armW * 1.45 }], o.sleeve); }
  // palm + fingers (+ thumb) in one outline
  const palm: P[] = rr(0, -34, 66, 34, 18).map(([x, y]) => L(x, y));
  const fingers: Part[] = [];
  const base = [-25, -8.5, 8.5, 24], len = [40, 50, 47, 36];
  for (let i = 0; i < 4; i++) {
    // seen from the front a curling finger shortens and its tip hooks back over the palm
    const reach = len[i] * (1 - 0.82 * curl), hook = len[i] * 0.45 * curl, fold: P[] = [L(62, base[i]), L(62 + reach, base[i])];
    if (hook > 1) fold.push(L(62 + reach - hook, base[i]));
    fingers.push({ cap: fold, w: 17 });
  }
  const th = o.thumb ?? 0.3; // thumb angle out from the hand (0 = along it)
  const thumb: Part = { cap: [L(14, -30), L(14 + 34 * Math.cos(-0.9 - th), -30 + 34 * Math.sin(-0.9 - th) * 0.9 - 8), L(14 + 52 * Math.cos(-0.55 - th * 0.6), -30 + 52 * Math.sin(-0.55 - th * 0.6) - 4)], w: 19 };
  inked(g, [{ poly: palm }, ...fingers, thumb], o.skin);
  const crease = mix(o.skin, INK, 0.45);
  g.strokeStyle = crease; g.lineWidth = 3 * sc; g.lineCap = "round";
  if (o.palm) for (const [a, b] of [[[16, -6], [50, -14]], [[14, 10], [46, 4]]] as const) { g.beginPath(); g.moveTo(...L(a[0], a[1])); g.quadraticCurveTo(...L((a[0] + b[0]) / 2, a[1] + 8), ...L(b[0], b[1])); g.stroke(); }
  else for (let i = 0; i < 4; i++) { const p0 = L(56, base[i] - 4), p1 = L(56, base[i] + 4); g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); }
  if (o.bare) { // a paler band where the bangles sat: her wrist is bare now
    g.strokeStyle = "rgba(255,236,206,0.55)"; g.lineWidth = 10 * sc;
    const a = L(-16, -26), b = L(-16, 26); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  }
};

// ---------------- props ----------------
const bangle = (g: G, x: number, y: number, rx: number, ry: number, rot: number, col = "#e2b23c") => {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.lineWidth = 15; g.strokeStyle = INK; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 9; g.strokeStyle = col; g.stroke();
  g.lineWidth = 3; g.strokeStyle = "rgba(255,250,215,0.95)"; g.beginPath(); g.ellipse(0, 0, rx - 1, ry - 1, 0, 3.6, 4.6); g.stroke();
  g.restore();
};
/** a taka note: no legible text, a seal circle and guilloche-ish lines */
const note = (g: G, x: number, y: number, w: number, h: number, rot: number, col: string) => {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.fill(); g.stroke();
  g.strokeStyle = mix(col, "#ffffff", 0.45); g.lineWidth = 3; g.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
  g.fillStyle = mix(col, INK, 0.25); g.beginPath(); g.arc(w * 0.26, 0, h * 0.22, 0, Math.PI * 2); g.fill();
  g.strokeStyle = mix(col, INK, 0.3); g.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) { g.beginPath(); for (let k = 0; k <= 12; k++) { const xx = -w * 0.4 + k * w * 0.042, yy = -h * 0.18 + i * h * 0.17 + Math.sin(k * 1.3 + i) * 3; if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); }
  g.restore();
};
const NOTE_COLS = ["#8fbf86", "#d892a8", "#9fb7d8"];

// ---------------- (A) the stall counter: her bangles, then the seller's notes into her bare palm ----------------
const MOM_TEEN = { skin: "#b87a4e", blouse: "#c7a24e", sari: "#5a4a86", border: "#2a2244" };
const SELLER = { skin: "#a8704a", sleeve: "#e9e3d2" };
/** u < 0: only the bangles on the counter (the two-shot); u 0..1: the hands */
const counterCard = (u: number) => (p: Pen) => {
  const g = p.g; // 720 x 1000, top = the seller's side
  for (const [x, y, r] of [[250, 300, 0.4], [300, 330, -0.2], [210, 350, 0.9], [285, 385, 0.1]] as const) bangle(g, x, y, 92, 58, r);
  if (u < 0) return;
  const n = Math.min(3, Math.floor(u * 3.4)), cyc = (u * 3.4) % 1; // three notes, one per beat
  // her palm up from the bottom (bare wrist), notes landing in it
  const pw: P = [430, 830];
  hand(g, { from: [520, 1080], w: pw, ang: -1.75, sc: 1.55, side: -1, palm: true, curl: 0.12, skin: MOM_TEEN.skin, sleeve: MOM_TEEN.blouse, sleeveK: 0.25, thumb: 0.5 });
  for (let i = 0; i < n; i++) note(g, 470 - i * 6, 640 + i * 7, 230, 112, -0.12 + i * 0.09, NOTE_COLS[i % 3]);
  // the seller's hand from the top right, bringing the next note down and back
  const dip = n < 3 ? Math.sin(Math.PI * cyc) : 0, hw: P = lp([560, 250], [520, 470], dip);
  if (n < 3) note(g, hw[0] - 70, hw[1] + 150, 230, 112, 0.25 - 0.3 * dip, NOTE_COLS[n % 3]);
  hand(g, { from: [760, -60], w: hw, ang: 2.2, sc: 1.45, side: 1, curl: 0.35, skin: SELLER.skin, sleeve: SELLER.sleeve, sleeveK: 0.5, thumb: 0.1 });
};

// ---------------- (B) the anchal knot: untie, the folded notes, into Nusrat's palm, her fingers close ----------------
const NUS_TEEN = { skin: "#c48a5c", sleeve: "#3f7fbf" };
const anchalCard = (u: number) => (p: Pen) => {
  const g = p.g; // 768 x 1280; the mother is screen-left, Nusrat screen-right
  const open = seg(u, 0.32, 0.5), take = seg(u, 0.5, 0.62), move = seg(u, 0.62, 0.78), close = seg(u, 0.8, 0.96);
  // the sari end draping down from the top left (her shoulder), its border along the outer edge, the knot at the tip
  const kx = 300, ky = 600 - 30 * open, tip: P = [kx + 20 + 60 * open, ky + 30 + 50 * open];
  const outer: P[] = [[150, -40], [250, 200], [kx + 40, ky - 120], tip], inner: P[] = [[-60, 140], [60, 360], [kx - 110, ky + 40], tip];
  g.beginPath(); g.moveTo(...outer[0]); g.bezierCurveTo(...outer[1], ...outer[2], ...outer[3]); g.bezierCurveTo(...inner[2], ...inner[1], ...inner[0]); g.lineTo(-60, -40); g.closePath();
  g.fillStyle = MOM_TEEN.sari; g.fill(); g.strokeStyle = INK; g.lineWidth = 2 * OL; g.stroke();
  g.strokeStyle = MOM_TEEN.border; g.lineWidth = 24; g.beginPath(); g.moveTo(140, -40); g.bezierCurveTo(240, 200, kx + 28, ky - 120, tip[0] - 10, tip[1] - 14); g.stroke();
  g.strokeStyle = "#e2b04a"; g.lineWidth = 5; g.beginPath(); g.moveTo(124, -40); g.bezierCurveTo(222, 200, kx + 8, ky - 120, tip[0] - 26, tip[1] - 16); g.stroke();
  for (let k = 0; k < 3; k++) { g.strokeStyle = mix(MOM_TEEN.sari, INK, 0.35); g.lineWidth = 4; g.beginPath(); g.moveTo(20 + k * 50, 60); g.bezierCurveTo(70 + k * 50, 260, kx - 120 + k * 40, ky - 60, tip[0] - 60 + k * 15, tip[1] - 10); g.stroke(); }
  if (open < 0.6) { // the knot: a twisted lump of cloth with a short tail, loosening
    const r = 52 * (1 - 0.45 * open), cx = tip[0] - 4, cy = tip[1] + 8;
    g.fillStyle = mix(MOM_TEEN.sari, "#ffffff", 0.06); g.strokeStyle = INK; g.lineWidth = 2 * OL;
    g.beginPath(); g.moveTo(cx - r, cy - r * 0.3); g.quadraticCurveTo(cx - r * 0.2, cy - r * 1.1, cx + r, cy - r * 0.4); g.quadraticCurveTo(cx + r * 1.1, cy + r * 0.5, cx + r * 0.2, cy + r * 0.8); g.quadraticCurveTo(cx - r * 0.9, cy + r * 0.9, cx - r, cy - r * 0.3); g.closePath(); g.stroke(); g.fill();
    g.beginPath(); g.moveTo(cx + r * 0.3, cy + r * 0.7); g.quadraticCurveTo(cx + r * 0.6, cy + r * 1.6, cx + r * 0.1, cy + r * 2.0); g.lineTo(cx - r * 0.25, cy + r * 1.7); g.quadraticCurveTo(cx + r * 0.1, cy + r * 1.3, cx - r * 0.2, cy + r * 0.75); g.closePath(); g.stroke(); g.fill(); // the tail
    g.strokeStyle = mix(MOM_TEEN.sari, INK, 0.5); g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - r * 0.55, cy - r * 0.5); g.lineTo(cx + r * 0.15, cy + r * 0.55); g.stroke(); // twist lines (straight: never a face)
    g.beginPath(); g.moveTo(cx + r * 0.1, cy - r * 0.75); g.lineTo(cx + r * 0.65, cy + r * 0.15); g.stroke();
  }
  // the folded notes: in the opened cloth, then in her fingers, then pressed into Nusrat's palm
  const npos: P = take < 1 ? lp([tip[0], tip[1] + 20], [kx + 120, ky + 120], take) : lp([kx + 120, ky + 120], [540, 900], move);
  const showNotes = open > 0.55;
  const nusW: P = [600, 1000];
  // Nusrat's hand: palm up from the right, fingers close over the notes at the end
  hand(g, { from: [820, 1300], w: nusW, ang: -2.45, sc: 1.6, side: -1, palm: close < 0.5, curl: 0.15 + 0.85 * close, skin: NUS_TEEN.skin, sleeve: NUS_TEEN.sleeve, sleeveK: 0.72, thumb: 0.5 - 0.4 * close });
  if (showNotes) for (let i = 0; i < 3; i++) note(g, npos[0] - i * 8, npos[1] + i * 10, 150 * (1 - 0.35 * close), 72, -0.5 + i * 0.12, NOTE_COLS[i]);
  // the mother's hands: both at the knot, then the right one carries the notes and closes over Nusrat's hand
  const jig = Math.sin(u * 60) * 8 * (1 - open);
  hand(g, { from: [-120, 980], w: [kx - 150 + jig, ky + 140], ang: -0.5, sc: 1.5, side: -1, curl: 0.45, skin: MOM_TEEN.skin, sleeve: MOM_TEEN.blouse, sleeveK: 0.3, thumb: 0.2 });
  const mw = take < 1 ? lp([kx - 40 - jig, ky + 190], [kx + 20, ky + 230], take) : lp([kx + 20, ky + 230], [430, 930], move);
  hand(g, { from: [-60, 1290], w: mw, ang: -0.25 + 0.3 * move, sc: 1.5, side: 1, curl: 0.5 - 0.2 * move + 0.3 * close, skin: MOM_TEEN.skin, sleeve: MOM_TEEN.blouse, sleeveK: 0.3, thumb: 0.3 });
};

// ---------------- (C) the machine part and the caliper (office) ----------------
const RAHAT_AD = { skin: "#b0744a", sleeve: "#e8eef4" };
const steel = (g: G, pts: P[], base = "#a9b0b8") => {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  const xs = pts.map((q) => q[1]), y0 = Math.min(...xs), y1 = Math.max(...xs), gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, "#e6eaee"); gr.addColorStop(0.35, base); gr.addColorStop(1, "#5e646c");
  g.fillStyle = gr; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
};
const caliperCard = (u: number) => (p: Pen) => {
  const g = p.g; // 768 x 1280
  const cy = 700, x0 = 170, x1 = 530, top = cy - 130, bot = cy + 130;
  // the lower hand first: palm up under the piston, fingers curled up round its bottom edge
  hand(g, { from: [250, 1300], w: [345, bot + 150], ang: -1.57, sc: 1.6, side: -1, palm: true, curl: 0.3, skin: RAHAT_AD.skin, sleeve: RAHAT_AD.sleeve, sleeveK: 0.6, thumb: 0.5 });
  // piston: crown with ring grooves, skirt, the gudgeon pin boss, a short rod stub
  steel(g, [[x0, top], [x1, top], [x1, bot], [x0, bot]]);
  g.strokeStyle = "#4b5058"; g.lineWidth = 6; for (const x of [x0 + 40, x0 + 70, x0 + 100]) { g.beginPath(); g.moveTo(x, top + 2); g.lineTo(x, bot - 2); g.stroke(); }
  g.fillStyle = "#c9ced4"; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(400, cy, 34, 0, Math.PI * 2); g.fill(); g.stroke();
  // his fingertips over the bottom edge (in front of the piston)
  for (let k = 0; k < 4; k++) { const fx = 300 + k * 30; g.strokeStyle = INK; g.lineWidth = 17 + 2 * OL; g.lineCap = "round"; g.beginPath(); g.moveTo(fx, bot + 40); g.lineTo(fx + 4, bot - 8); g.stroke(); g.strokeStyle = RAHAT_AD.skin; g.lineWidth = 17; g.stroke(); }
  // the vernier caliper: beam above the crown, the fixed jaw against the left face, the sliding jaw closing on the right face
  const jx = lerp(x1 + 140, x1, seg(u, 0.05, 0.5)), by = top - 190;
  steel(g, [[x0 - 70, by], [720, by], [720, by + 56], [x0 - 70, by + 56]], "#c3c8ce");
  g.strokeStyle = "#3b3f46"; g.lineWidth = 3; for (let x = x0 - 50; x < 710; x += 14) { g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + (Math.round((x - x0) / 14) % 5 ? 14 : 24)); g.stroke(); }
  steel(g, [[x0 - 40, by], [x0, by], [x0, bot - 30], [x0 - 18, bot - 10], [x0 - 40, bot - 30]], "#c3c8ce");                          // fixed jaw on the left face
  steel(g, [[jx, by - 12], [jx + 80, by - 12], [jx + 80, by + 68], [jx + 40, by + 68], [jx + 40, bot - 30], [jx + 18, bot - 10], [jx, bot - 30]], "#d0d5da"); // sliding jaw on the right face
  g.fillStyle = "#e9ecef"; g.fillRect(jx + 8, by - 4, 64, 22);
  // the upper hand on the slider: fingers over its top, thumb on the thumb-wheel, wrist off to the right
  hand(g, { from: [900, by - 220], w: [jx + 150, by - 60], ang: 2.75, sc: 1.4, side: 1, curl: 0.55, skin: RAHAT_AD.skin, sleeve: RAHAT_AD.sleeve, sleeveK: 0.55, thumb: 0.8 });
  if (u > 0.5) { const s = Math.sin(((u - 0.5) / 0.5) * Math.PI); g.fillStyle = `rgba(255,255,240,${0.85 * s})`; g.beginPath(); g.arc(x1 - 4, top + 30, 10 + 10 * s, 0, Math.PI * 2); g.fill(); }
};

// ---------------- (D) the needle: she sews; Rahat's hand takes the needle and the cloth and sets them aside ----------------
const MOM_OLD = { skin: "#b87a4e", blouse: "#c9c0ae" };
/** a folded plain cotton shirt she is mending: collar points, the placket with three buttons, a fold, tiny stitches at the hem */
const cloth = (g: G, x: number, y: number, rot: number) => {
  g.save(); g.translate(x, y); g.rotate(rot);
  const col = "#eee7d6", sh = "rgba(140,120,90,0.35)";
  g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 2 * OL; g.lineJoin = "round";
  g.beginPath(); g.moveTo(-210, -120); g.lineTo(-60, -150); g.lineTo(60, -150); g.lineTo(215, -118); g.lineTo(225, 140); g.lineTo(-222, 145); g.closePath(); g.stroke(); g.fill(); // the folded body
  g.beginPath(); g.moveTo(-60, -150); g.lineTo(0, -95); g.lineTo(-10, -60); g.lineTo(-95, -128); g.closePath(); g.stroke(); g.fill();   // left collar point
  g.beginPath(); g.moveTo(60, -150); g.lineTo(0, -95); g.lineTo(10, -60); g.lineTo(95, -128); g.closePath(); g.stroke(); g.fill();      // right collar point
  g.strokeStyle = sh; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -95); g.lineTo(0, 140); g.stroke(); g.beginPath(); g.moveTo(22, -95); g.lineTo(22, 140); g.stroke(); // placket
  for (let k = 0; k < 3; k++) { g.fillStyle = "#d8d0bc"; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(11, -30 + k * 60, 8, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.strokeStyle = sh; g.lineWidth = 6; g.beginPath(); g.moveTo(-215, 30); g.quadraticCurveTo(-110, 45, -30, 32); g.stroke(); g.beginPath(); g.moveTo(60, 38); g.quadraticCurveTo(150, 50, 220, 36); g.stroke(); // the fold
  g.strokeStyle = "#b8473f"; g.lineWidth = 4; g.lineCap = "round";
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-170 + k * 34, 118); g.lineTo(-156 + k * 34, 118); g.stroke(); } // tiny stitches at the hem
  g.restore();
};
const needleCard = (u: number) => (p: Pen) => {
  const g = p.g; // 768 x 1280
  const sew = Math.sin(Math.min(u, 0.36) * 40), reach = seg(u, 0.34, 0.54), grip = seg(u, 0.54, 0.64), away = seg(u, 0.64, 0.92), rest = seg(u, 0.7, 1);
  const cl: P = lp([390, 860], [1150, 660], away);
  if (away < 1) cloth(g, cl[0], cl[1], -0.08 + 0.2 * away);
  // the long needle (eye at the top) and a clear red thread from the eye down into the cloth
  const nb: P = away > 0 ? lp([505, 560], [1265, 380], away) : [505, 560 - 70 * Math.max(0, sew)];
  if (away < 1) {
    const tip: P = [nb[0] - 40, nb[1] + 300];
    g.lineCap = "round";
    g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.moveTo(...nb); g.quadraticCurveTo(nb[0] + 150, nb[1] - 200 + 50 * sew, cl[0] + 60, cl[1] - 130); g.stroke();
    g.strokeStyle = "#d23b3b"; g.lineWidth = 6; g.stroke();
    g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.moveTo(...nb); g.lineTo(...tip); g.stroke();
    g.strokeStyle = "#e3e7ec"; g.lineWidth = 6; g.stroke();
    g.fillStyle = INK; g.beginPath(); g.ellipse(nb[0] - 1, nb[1] + 14, 2.5, 7, -0.13, 0, Math.PI * 2); g.fill(); // the eye
  }
  // her hands: holding the cloth and pulling the thread; after he takes them they rest, palms up and relaxed, apart
  hand(g, { from: [-100, 1300], w: lp([300, 940], [220, 1010], rest), ang: lerp(-0.6, -1.15, rest), sc: 1.55, side: -1, palm: rest > 0.5, curl: lerp(0.5, 0.18, away), skin: MOM_OLD.skin, sleeve: MOM_OLD.blouse, sleeveK: 0.3, thumb: lerp(0.3, 0.7, rest) });
  hand(g, { from: [760, 1340], w: lp([470, 800 - 40 * Math.max(0, sew)], [540, 1010], Math.max(grip * 0.3, rest)), ang: lerp(-1.35, -1.95, rest), sc: 1.5, side: 1, palm: rest > 0.5, curl: lerp(0.62, 0.18, away), skin: MOM_OLD.skin, sleeve: MOM_OLD.blouse, sleeveK: 0.3, thumb: lerp(0.5, 0.7, rest) });
  // Rahat's hand from the right: in, closes gently over the needle and the cloth, out with them
  if (reach > 0 && away < 1) {
    const hw: P = away > 0 ? lp([600, 620], [1300, 440], away) : lp([980, 400], [600, 620], reach);
    hand(g, { from: [hw[0] + 600, hw[1] - 260], w: hw, ang: 2.75, sc: 1.55, side: -1, curl: 0.15 + 0.55 * grip, skin: RAHAT_AD.skin, sleeve: RAHAT_AD.sleeve, sleeveK: 0.6, thumb: 0.6 - 0.4 * grip });
  }
};

// ---------------- rain running down the bedroom window ----------------
const windowRain = (k: number) => (p: Pen) => {
  const g = p.g; // 256 x 320
  let s = 9973 + k * 131; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, y = ((r() * 320 + k * 18) % 340) - 20, l = 18 + r() * 40;
    g.strokeStyle = `rgba(205,222,240,${0.35 + 0.35 * r()})`; g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y + l / 2, x - 1, y + l); g.stroke();
    g.fillStyle = "rgba(225,236,248,0.7)"; g.beginPath(); g.arc(x - 1, y + l, 2.4, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(215,230,245,${0.3 + 0.3 * r()})`; g.beginPath(); g.arc(r() * 256, r() * 320, 1 + r() * 2, 0, Math.PI * 2); g.fill(); }
};

/** the round-7 close-ups and set effects for shot `id` at real frame f */
export const insertsFx = (id: number, f: number, out: Stage) => {
  const pf = toPlan(id, f);
  switch (id) {
    case 8: { // stall: the bangles on the counter all shot; the hands from the insert on
      const u = pf < N7 + 2172 ? -1 : qz((f - 2172) / 24, 24);
      out.fx.push({ key: `in_counter${u}`, cw: 720, ch: 1000, draw: counterCard(u), x: COUNTER[0], y: COUNTER[1] + 0.004, z: COUNTER[2], w: 0.36, h: 0.5, flat: true });
      break;
    }
    case 9: { // the college form: her finger on the signature line, Nusrat signs
      const u = qz((f - SHOTS[8].a) / (SHOTS[8].b - SHOTS[8].a), 40);
      out.fx.push({ key: `in_form${u}`, cw: 720, ch: 1000, draw: formCard(u), x: FORM[0], y: FORM[1], z: FORM[2], w: 0.36, h: 0.5, flat: true });
      break;
    }
    case 10: // bus stop: the money from the anchal knot
      if (pf >= 1982 && pf < 2087) { const u = qz((pf - 1982) / 105, 54); out.fx.push({ key: `in_anchal${u}`, cw: 768, ch: 1280, draw: anchalCard(u), x: INS9[0], y: INS9[1], z: INS9[2], w: 0.3, h: 0.5 }); }
      break;
    case 20: // office: the caliper on the piston
      if (pf >= N7 + 3444) { const u = qz((f - 3444) / 51, 34); out.fx.push({ key: `in_caliper${u}`, cw: 768, ch: 1280, draw: caliperCard(u), x: INS20[0], y: INS20[1], z: INS20[2], w: 0.3, h: 0.5 }); }
      break;
    case 25: // the needle taken from her hand
      if (pf < 3713) { const u = qz((pf - 3690) / 23, 36); out.fx.push({ key: `in_needle${u}`, cw: 768, ch: 1280, draw: needleCard(u), x: NEEDLE[0], y: NEEDLE[1], z: NEEDLE[2], w: 0.3, h: 0.5 }); }
      break;
    case 28: { // rain on the bedroom window (just inside the glass)
      const k = Math.floor(f / 2) % 8;
      out.fx.push({ key: `wrain${k}`, cw: 256, ch: 320, draw: windowRain(k), x: BEDROOM[0] + 0.5, y: 1.52, z: BEDROOM[2] - 1.16, w: 0.68, h: 0.74, soft: true });
      out.fx.push({ key: "faceGlow", cw: 256, ch: 256, draw: faceGlow, x: BED_HEAD[0] - 0.05, y: BED_HEAD[1] + 0.02, z: BED_HEAD[2] + 0.14, w: 0.75, h: 0.75, soft: true });
      break;
    }
  }
};

/** the lamp's warm light falling on her face (soft additive-looking card) */
const faceGlow = (p: Pen) => {
  const g = p.g, gr = g.createRadialGradient(110, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,198,120,0.32)"); gr.addColorStop(0.55, "rgba(255,180,100,0.12)"); gr.addColorStop(1, "rgba(255,170,90,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
};

// ---------------- (E) the college form on the table: the whole sheet, a stamp, the signature line being signed ----------------
const formCard = (u: number) => (p: Pen) => {
  const g = p.g; // 720 x 1000, flat on the table, top = away from the lens
  // the sheet (slightly turned), a header band with an emblem, field rows with boxes, a photo box, the stamp, the signature line
  g.save(); g.translate(330, 470); g.rotate(-0.05);
  g.fillStyle = "#fbf8ef"; g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.rect(-250, -390, 500, 760); g.fill(); g.stroke();
  g.fillStyle = "#2f6a43"; g.fillRect(-246, -386, 492, 86);
  g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(-196, -343, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,0.9)"; for (let i = 0; i < 5; i++) g.fillRect(-150 + i * 62, -360, 48, 12); g.fillRect(-150, -330, 220, 10); // title shapes (not text)
  g.strokeStyle = "#7d8794"; g.lineWidth = 4;
  for (let i = 0; i < 7; i++) { const y = -250 + i * 62; g.fillStyle = "#9aa3ae"; g.fillRect(-220, y - 14, 90, 10); g.beginPath(); g.moveTo(-115, y); g.lineTo(i < 3 ? 70 : 220, y); g.stroke(); }
  g.strokeStyle = "#5d6773"; g.lineWidth = 4; g.strokeRect(100, -280, 120, 150); g.fillStyle = "#e6e1d4"; g.fillRect(102, -278, 116, 146); // photo box
  for (let i = 0; i < 4; i++) { g.strokeRect(-220 + i * 70, 190, 26, 26); } g.fillStyle = "#2f5f8a"; g.fillRect(-214, 196, 14, 14); // tick boxes
  // the round stamp (bottom left), slightly rotated, faded purple ink
  g.save(); g.translate(-140, 300); g.rotate(-0.3); g.strokeStyle = "rgba(110,60,140,0.75)"; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.stroke(); g.fillStyle = "rgba(110,60,140,0.7)"; g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.fillRect(Math.cos(a) * 54 - 3, Math.sin(a) * 54 - 3, 6, 6); }
  g.restore();
  // the signature line and the signature being written (Nusrat's pen)
  g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 320); g.lineTo(220, 320); g.stroke();
  const sg = seg(u, 0.3, 0.9), N = 40, pts: P[] = [];
  for (let i = 0; i <= N * sg; i++) { const x = 20 + (i / N) * 190, y = 300 - 16 * Math.sin(i * 0.9) * (0.6 + 0.4 * Math.sin(i * 0.23)) - (i < 6 ? i * 2 : 0); pts.push([x, y]); }
  if (pts.length > 1) { g.strokeStyle = "#1f3f8a"; g.lineWidth = 4; g.lineJoin = "round"; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  g.restore();
  // the mother's hand from the left: index finger on the signature line
  hand(g, { from: [-160, 1060], w: [200, 820], ang: -0.55, sc: 1.35, side: -1, curl: 0.55, skin: MOM_TEEN.skin, sleeve: MOM_TEEN.blouse, sleeveK: 0.35, thumb: 0.2 });
  g.strokeStyle = INK; g.lineWidth = 17 + 2 * OL; g.lineCap = "round"; g.beginPath(); g.moveTo(290, 765); g.lineTo(335, 740); g.stroke(); g.strokeStyle = MOM_TEEN.skin; g.lineWidth = 17; g.stroke(); // the pointing finger
  // Nusrat's hand from the right with the pen, moving along the signature
  const tipX = 340 + 190 * sg - 10, tipY = 760 - 18 * Math.sin(sg * 36);
  g.strokeStyle = INK; g.lineWidth = 16; g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(tipX + 110, tipY + 120); g.stroke(); g.strokeStyle = "#2f5f8a"; g.lineWidth = 9; g.stroke(); // pen
  hand(g, { from: [860, 1080], w: [tipX + 150, tipY + 160], ang: -2.3, sc: 1.3, side: 1, curl: 0.6, skin: NUS_TEEN.skin, sleeve: NUS_TEEN.sleeve, sleeveK: 0.65, thumb: 0.7 });
};

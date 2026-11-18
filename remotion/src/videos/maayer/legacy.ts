// STAGE 1 SCAFFOLD — delete when build.ts / cast.ts / world.ts are rewritten for the village (see BUILD_NOTES.md).
// The new story.ts no longer carries the bridge physics, but the template's build/cast/world still read it. This file
// keeps those reads compiling with the bridge frozen INTACT and the soldier crowd OFF, so the new SHOTS / CAMS / DOF can
// be rendered against the old set as a placeholder.
import { smooth, easeOut, Light, ShotDef, V3 } from "./story";

/** false = skip every bridge effect hard-wired to an old shot number (snap at 8, creak at 7, park at 12, sign >= 14) */
export const BRIDGE_FX = false;

export const D0 = 6.0; // bank top + deck height (m)
export const HALF = 27; // towers at z = +-27, span 54 m
export const FILES = [-1.65, -0.55, 0.55, 1.65];
export const ROW_GAP = 1.3;
export const COUNT = 74;
export const PARK: V3 = [70, D0, -75];

export const front = (tau: number) => 26 - 1.6 * (tau - 4.4);
export const marchPhase = (tau: number) => ((tau % 1) + 1) % 1;
export const SNAP = 34.62, DROP0 = 36.35, DROP1 = 36.95;
export const stomp = (_tau: number) => 1;
export const shapeZ = (z: number) => (Math.abs(z) < HALF ? Math.cos((Math.PI * z) / (2 * HALF)) : 0);
export const dropW = (z: number) => smooth((20 - z) / 26);
export const dropU = (_tau: number) => 0;
export const DROP_H = 6.6;

export type BridgeState = { bounce: number; drop: number; snap: number; collapsed: boolean };
export const deckY = (z: number, b: BridgeState) => D0 + b.bounce * shapeZ(z) - b.drop * DROP_H * dropW(z);
/** the bridge stands still and whole in every new shot */
export const bridgeState = (_id: number, _t: number): BridgeState => ({ bounce: 0, drop: 0, snap: 0, collapsed: false });

export const ANCHOR: V3 = [-2.7, D0 + 0.62, -37];
export const snapEnd = (snap: number): V3 => {
  const u = easeOut(snap);
  return [ANCHOR[0] - 0.6 * u, ANCHOR[1] + 5.5 * u - 2.0 * u * u, ANCHOR[2] + 4.5 * u];
};

// old ShotDef fields the new SHOTS dropped
export type Crowd = "march" | "fall" | "water" | "bank" | "tourists" | "none";
export const tauOf = (_s: ShotDef) => (t: number) => t; // story time = clock time
export const crowdOf = (_s: ShotDef): Crowd => "none";  // no soldiers; the new cast arrives with the cast.ts rewrite
export const townsOf = (_s: ShotDef) => false;

/** the old tables (grade, cloud maps, card contact) only know day/golden: rain borrows day, the warm lamp borrows golden */
export const oldLight = (l: Light): "day" | "golden" => (l === "golden" || l === "lamp" ? "golden" : "day");

// Bold, colourful Bangla captions: a plain HTML overlay above the three.js canvas and all its post passes
// (ink, lens blur, bloom and grade never touch it). Text from captions.json (standard spelling, timed to the voice).
// Every size is a fraction of the composition size, so --scale 0.5 stills and the 1440x2560 final look the same.
import React, { useEffect, useState } from "react";
import { continueRender, delayRender, getInputProps, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSansBengali";
import CAPTIONS from "./captions.json";
import FIT from "./captionFit.json";

type Chunk = { i: number; text: string; startFrame: number; endFrame: number };
const CHUNKS = CAPTIONS as Chunk[];
/** per-chunk font scale (array index -> 0.9..1), written by the fit check (scratch fit_captions.mjs) */
const FIT_SCALE = FIT as Record<string, number>;

const { fontFamily, waitUntilDone } = loadFont("normal", { weights: ["800"], subsets: ["bengali", "latin"] });

export const CAPTION_FONT_FRAC = 0.056; // of frame height (~108 px at 1080x1920)
export const CAPTION_WIDTH_FRAC = 0.88; // of frame width
export const CAPTION_LINE_HEIGHT = 1.25;
const CENTRE_Y = 0.72; // centre of the text block, fraction of frame height (above the Shorts/Reels UI zone)
const INK = "#1b0f1f";

const YELLOW = "#FFD23F", CORAL = "#FF6B6B", TEAL = "#4ECDC4", ORANGE = "#FF9F1C", VIOLET = "#C77DFF", SKY = "#7BDFF2";
const LIGHT = [SKY, TEAL, YELLOW];
const ACCENT = [CORAL, ORANGE, VIOLET];
const OPEN_Q = "“", CLOSE_Q = "”";

type Seg = { t: string; c: string };

/** Words split on spaces only (never inside a word or conjunct). The first word is yellow; then two light words
 *  (sky/teal/yellow) for every accent word (coral/orange/violet), so >= 2/3 are light; both cycles start at an
 *  offset that changes with every chunk. Quoted speech is white with yellow quote marks. */
export const colourWords = (text: string, n: number): Seg[][] => {
  const words = text.split(/\s+/).filter(Boolean);
  let inQuote = false, j = 0, light = 0, accent = 0, prev = "";
  return words.map((w) => {
    const segs: Seg[] = [];
    const hasText = w.replace(/[“”]/g, "").length > 0;
    let base = "#ffffff";
    const opensHere = w.includes(OPEN_Q);
    if (!inQuote && !opensHere && hasText) {
      if (j === 0) base = YELLOW;
      else if (j % 3 === 2) base = ACCENT[(n + accent++) % 3];
      else {
        base = LIGHT[(n + light++) % 3];
        if (base === prev) base = LIGHT[(n + light++) % 3];
      }
      j++; prev = base;
    } else if (opensHere && j === 0) j++; // a chunk that starts with a quote: the quote marks carry the yellow
    for (const ch of Array.from(w)) {
      if (ch === OPEN_Q) { inQuote = true; segs.push({ t: ch, c: YELLOW }); continue; }
      if (ch === CLOSE_Q) { inQuote = false; segs.push({ t: ch, c: YELLOW }); continue; }
      const c = inQuote ? "#ffffff" : base;
      const last = segs[segs.length - 1];
      if (last && last.c === c && last.t !== OPEN_Q && last.t !== CLOSE_Q) last.t += ch; else segs.push({ t: ch, c });
    }
    return segs;
  });
};

const useFontReady = () => {
  const [handle] = useState(() => delayRender("caption font"));
  useEffect(() => {
    waitUntilDone().then(() => document.fonts.ready).then(() => continueRender(handle));
  }, [handle]);
};

export const captionsOn = () => (getInputProps() as { captions?: boolean }).captions !== false;

export const Captions: React.FC = () => {
  useFontReady();
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const n = CHUNKS.findIndex((c) => f >= c.startFrame && f < c.endFrame);
  if (n < 0) return null;
  const c = CHUNKS[n];
  const fs = height * CAPTION_FONT_FRAC * (FIT_SCALE[String(n)] ?? 1);
  const t = f - c.startFrame;
  const scale = t < 5 ? interpolate(t, [0, 3, 5], [0.85, 1.05, 1]) : 1; // pop with a small overshoot
  const opacity = interpolate(t, [0, 4], [0, 1], { extrapolateRight: "clamp" }) *
    interpolate(f, [c.endFrame - 3, c.endFrame], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const words = colourWords(c.text, n);
  return (
    <div style={{
      position: "absolute", left: width * (1 - CAPTION_WIDTH_FRAC) / 2, width: width * CAPTION_WIDTH_FRAC, top: height * CENTRE_Y,
      transform: `translateY(-50%) scale(${scale})`, transformOrigin: "50% 50%", opacity,
      textAlign: "center", textWrap: "balance", fontFamily, fontWeight: 800, fontSize: fs, lineHeight: CAPTION_LINE_HEIGHT,
      filter: `drop-shadow(0 ${fs * 0.06}px ${fs * 0.08}px rgba(10,4,14,0.6))`,
    }}>
      {words.map((segs, k) => (
        <React.Fragment key={k}>
          {k > 0 ? " " : null}
          <span style={{ whiteSpace: "nowrap" }}>
            {segs.map((s, q) => (
              <span key={q} style={{ color: s.c, WebkitTextStroke: `${fs * 0.24}px ${INK}`, paintOrder: "stroke fill" }}>{s.t}</span>
            ))}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

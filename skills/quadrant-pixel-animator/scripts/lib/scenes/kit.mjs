// Scene kit: draw frames procedurally on a 2x-resolution canvas and compile
// them into the same shape compileRig() returns, so every adapter (player,
// SVG, Ink, bundles) works with code-driven scenes too.

import { normalizePalette } from "../core/rig.mjs";
import { compileGridToFrame, applyOverlays } from "../core/quad-engine.mjs";

// xterm default 16-color palette (fg codes 30-37, 90-97).
const ANSI16 = [
  [30, [0, 0, 0]], [31, [205, 49, 49]], [32, [13, 188, 121]], [33, [229, 229, 16]],
  [34, [36, 114, 200]], [35, [188, 63, 188]], [36, [17, 168, 205]], [37, [229, 229, 229]],
  [90, [102, 102, 102]], [91, [241, 76, 76]], [92, [35, 209, 139]], [93, [245, 245, 67]],
  [94, [59, 142, 234]], [95, [214, 112, 214]], [96, [41, 184, 219]], [97, [255, 255, 255]],
];
export const ANSI16_RGB = Object.fromEntries(ANSI16.map(([c, rgb]) => [c, rgb]));

/** Nearest 16-color SGR foreground code for an RGB color. */
export function autoAnsi(rgb) {
  let best = 37;
  let bestD = Infinity;
  for (const [code, c] of ANSI16) {
    const d = 2 * (rgb[0] - c[0]) ** 2 + 4 * (rgb[1] - c[1]) ** 2 + 3 * (rgb[2] - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return best;
}

/** Palette from { token: "#rrggbb" | [r,g,b] | {rgb, ansi16} } with auto 16-color fallback. */
export function palette(spec) {
  const raw = {};
  for (const [k, v] of Object.entries(spec)) {
    const rgb = typeof v === "string" ? hexToRgb(v) : Array.isArray(v) ? v : v.rgb;
    raw[k] = { name: v.name ?? k, rgb, ansi16: v.ansi16 ?? autoAnsi(rgb) };
  }
  return raw;
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function lerpRgb(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** HSV (h in degrees) to RGB. */
export function hsv(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

/** Deterministic PRNG (mulberry32) so scenes compile identically every time. */
export function prng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A sub-pixel canvas. Coordinates outside are clipped silently. */
export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.px = Array.from({ length: height }, () => new Array(width).fill(null));
  }
  set(x, y, tok) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.px[y][x] = tok;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? this.px[y][x] : null;
  }
  rect(x, y, w, h, tok) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, tok);
  }
  hline(x0, x1, y, tok) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, tok);
  }
  /** Filled ellipse; sub-pixels are ~1:2, so rx = 2*ry looks round. */
  ellipse(cx, cy, rx, ry, tok) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, tok);
      }
    }
  }
  line(x0, y0, x1, y1, tok) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, tok);
  }
  /** Stamp a pixel grid (rows of tokens / null) at (x, y); remap and recolor optional. */
  blit(grid, x, y, { remap, flipX = false } = {}) {
    for (let j = 0; j < grid.length; j++) {
      const row = grid[j];
      for (let i = 0; i < row.length; i++) {
        let tok = row[flipX ? row.length - 1 - i : i];
        if (tok == null) continue;
        if (remap && Object.hasOwn(remap, tok)) tok = remap[tok];
        if (tok == null) continue;
        this.set(x + i, y + j, tok);
      }
    }
  }
  /** Parse ASCII rows ('.' = empty) into a grid usable with blit. */
  static sprite(rows) {
    return rows.map((r) => [...r].map((c) => (c === "." || c === " " ? null : c)));
  }
}

/**
 * Build a compiled scene.
 * frames: [{ canvas, hold?, overlays? }]
 */
export function makeScene({ name, title, description, cols, rows, palette: pal, tickMs = 60, loop = true, frames, stillFrame = 0 }) {
  const issues = [];
  const { palette: p, order } = normalizePalette(pal, issues);
  if (issues.length) throw new Error(`${name}: ${issues.map((i) => i.message).join("; ")}`);
  let folded = 0;
  const compiledFrames = frames.map((f) => {
    const base = compileGridToFrame(f.canvas.px, p);
    folded += base.warnings.length;
    const frame = applyOverlays(base, f.overlays ?? [], p);
    return { pose: "frame", hold: f.hold ?? 1, durationMs: (f.hold ?? 1) * tickMs, frame };
  });
  const rig = {
    name,
    title: title ?? name,
    description: description ?? "",
    cols,
    rows,
    width: cols * 2,
    height: rows * 2,
    palette: p,
    paletteOrder: order,
    poses: {},
    timelines: {},
    defaultTimeline: "main",
    reducedMotionPose: "still",
    events: {},
  };
  return {
    rig,
    poses: { still: compiledFrames[Math.min(stillFrame, compiledFrames.length - 1)].frame },
    timelines: { main: { name: "main", tickMs, loop, frames: compiledFrames } },
    warnings: [],
    stats: { frames: compiledFrames.length, foldedCells: folded },
  };
}

// 5x7 pixel font (enough for titles). '#' = ink.
export const FONT5x7 = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

/** Glyph grids for a word in FONT5x7 (each 5x7, advance 6). */
export function wordGlyphs(word) {
  return [...word.toUpperCase()].map((ch) => {
    const g = FONT5x7[ch];
    if (!g) throw new Error(`FONT5x7 has no glyph for "${ch}"`);
    return g.map((r) => [...r].map((c) => (c === "#" ? 1 : 0)));
  });
}

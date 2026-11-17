// UI widgets that use sub-cell precision: spinners inside one cell, an orbit
// in a 2x2 block, a progress bar that fills half a cell at a time, an
// equalizer with half-row steps and a scrolling sparkline.

import { Canvas, makeScene, palette, prng, hsv } from "./kit.mjs";

const SNAKE = [
  [0, 0], [1, 0], [1, 1], [0, 1],
]; // one cell, clockwise
const RING = [
  [1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 2], [0, 1],
]; // 4x4 sub-pixels

export function widgetsScene() {
  const cols = 40;
  const rows = 7;
  const W = cols * 2;
  const rand = prng(3);
  const T = 96;
  const bars = 14;
  const eq = Array.from({ length: bars }, () => ({ phase: rand() * Math.PI * 2, speed: 0.15 + rand() * 0.25 }));
  const spark = Array.from({ length: 200 }, (_, i) => 3.5 + 2.6 * Math.sin(i * 0.37) * Math.cos(i * 0.11) + (rand() - 0.5) * 1.2);
  const frames = [];

  for (let t = 0; t < T; t++) {
    const c = new Canvas(W, rows * 2);
    // 1) one-cell spinner: three lit quadrants chasing (col 1, row 1)
    for (let k = 0; k < 3; k++) {
      const [dx, dy] = SNAKE[(t + k) % 4];
      c.set(2 + dx, 2 + dy, "s");
    }
    // 2) orbit in a 2x2-cell block (cols 3-4, rows 1-2) with a tail
    for (let k = 0; k < 3; k++) {
      const [dx, dy] = RING[(t - k + 800) % RING.length];
      c.set(6 + dx, 2 + dy, "o");
    }
    // 3) progress bar: cols 7..32, fills one sub-pixel per tick, gradient per cell
    const barX = 14;
    const barLen = 52;
    const fill = Math.min(barLen, Math.floor((t / (T - 16)) * barLen));
    for (let x = 0; x < barLen; x++) {
      const cellIdx = ((barX + x) >> 1) - (barX >> 1);
      const tok = x < fill ? "pqrstuvwxyz"[Math.min(10, Math.floor((cellIdx / (barLen / 2)) * 11))] : "g";
      c.set(barX + x, 2, tok);
      c.set(barX + x, 3, tok);
    }
    const pct = `${String(Math.round((fill / barLen) * 100)).padStart(3)}%`;
    // 4) equalizer: rows 4-6 (y 8..13), bars one sub-pixel wide, 6 levels
    for (let b = 0; b < bars; b++) {
      const e = eq[b];
      const h = Math.max(1, Math.round(3 + 2.8 * Math.sin(t * e.speed + e.phase)));
      for (let k = 0; k < h; k++) c.set(2 + b * 2, 13 - k, k >= 4 ? "E" : k >= 2 ? "e" : "f");
    }
    // 5) sparkline scrolling right to left (cols 17..38, rows 4-6)
    const sx0 = 34;
    for (let x = 0; x < W - sx0 - 2; x++) {
      const v = spark[(x + t) % spark.length];
      const y = 13 - Math.max(0, Math.min(5, Math.round(v)));
      c.set(sx0 + x, y, "k");
      if (x > 0) {
        const pv = spark[(x - 1 + t) % spark.length];
        const py = 13 - Math.max(0, Math.min(5, Math.round(pv)));
        for (let yy = Math.min(y, py) + 1; yy < Math.max(y, py); yy++) c.set(sx0 + x, yy, "k");
      }
    }
    frames.push({
      canvas: c,
      overlays: [
        { text: "spin", col: 0, row: 0, fg: "L" },
        { text: "orbit", col: 5, row: 0, fg: "L" },
        { text: "progress · ½-cell steps", col: 11, row: 0, fg: "L" },
        { text: pct, col: 34, row: 1, fg: "P" },
        { text: "equalizer", col: 1, row: 3, fg: "L" },
        { text: "sparkline", col: 17, row: 3, fg: "L" },
      ],
    });
  }
  const pal = {
    s: "#7cf3d6", o: "#ffb86b", g: "#2b3044", E: "#ff6b8b", e: "#ffd166", f: "#5ee08a",
    k: "#7aa2ff", L: "#8088a8", P: "#e8ecff",
  };
  "pqrstuvwxyz".split("").forEach((tk, i) => (pal[tk] = hsv(150 + i * 9, 0.6, 0.95)));
  return makeScene({
    name: "widgets",
    title: "Widgets",
    description: "Sub-cell spinners, an orbit, a half-cell progress bar, an equalizer and a scrolling sparkline.",
    cols,
    rows,
    palette: palette(pal),
    tickMs: 60,
    frames,
  });
}

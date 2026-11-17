// Campfire: the classic heat-propagation fire on the sub-pixel grid. Up to
// four heat levels can meet in one cell; the compiler folds each cell to its
// two dominant colors — this scene shows how well that degrades.

import { Canvas, makeScene, palette, prng, hexToRgb } from "./kit.mjs";

const STOPS = ["#3b0a0a", "#7a1410", "#c2290f", "#ef5a12", "#ff8f1f", "#ffc43d", "#fff1a8"];
const TOK = "1234567";

export function fireScene({ cols = 30, rows = 7, frames: count = 72 } = {}) {
  const W = cols * 2;
  const H = rows * 2;
  const MAX = 24;
  const heat = Array.from({ length: H + 1 }, () => new Array(W).fill(0));
  const rand = prng(42);
  // Fuel shape: hotter in the middle, logs at the bottom edges.
  const fuel = (x) => {
    const d = Math.abs(x - W / 2) / (W / 2);
    return d < 0.5 ? MAX : 0;
  };
  for (let x = 0; x < W; x++) heat[H][x] = fuel(x);
  const step = () => {
    for (let y = 1; y <= H; y++) {
      for (let x = 0; x < W; x++) {
        const r = Math.floor(rand() * 3); // wind -1..+1, symmetric
        const dst = Math.min(W - 1, Math.max(0, x - r + 1));
        // Flames cool faster away from the centre line: a teardrop, not a wall.
        const side = Math.abs(x - W / 2) / (W / 2);
        const decay = (rand() < 0.62 ? 1 : 0) + (rand() < 0.62 ? 1 : 0) + (rand() < 0.5 ? 1 : 0) + (side > 0.22 ? 1 : 0) + (side > 0.4 && rand() < 0.7 ? 1 : 0);
        heat[y - 1][dst] = Math.max(0, heat[y][x] - decay);
      }
    }
    for (let x = 0; x < W; x++) heat[H][x] = fuel(x) && rand() < 0.93 ? MAX : fuel(x) ? MAX - 4 : 0;
  };
  for (let i = 0; i < 60; i++) step();

  const pal = {};
  const stops = STOPS.map(hexToRgb);
  TOK.split("").forEach((t, i) => (pal[t] = stops[i]));
  pal.L = "#5a3a22";
  pal.l = "#3a2414";

  const out = [];
  for (let f = 0; f < count; f++) {
    step();
    const c = new Canvas(W, H);
    // One heat level per horizontal sub-pixel pair (the hotter of the two):
    // a cell then holds at most two colors, top and bottom, so nothing folds.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x += 2) {
        const v = Math.max(heat[y][x], heat[y][x + 1] ?? 0);
        if (v <= 3) continue;
        const idx = Math.min(TOK.length - 1, Math.floor(((v - 3) / (MAX - 3)) * TOK.length));
        c.set(x, y, TOK[idx]);
        c.set(x + 1, y, TOK[idx]);
      }
    }
    // Two crossed logs in front of the flames.
    c.line(Math.round(W * 0.2), H - 1, Math.round(W * 0.62), H - 2, "L");
    c.line(Math.round(W * 0.38), H - 2, Math.round(W * 0.8), H - 1, "l");
    out.push({ canvas: c });
  }
  return makeScene({
    name: "fire",
    title: "Campfire",
    description: "Heat-propagation fire with 7 heat colors: one heat level per sub-pixel pair keeps every cell to two colors (upper and lower half).",
    cols,
    rows,
    palette: palette(pal),
    tickMs: 70,
    frames: out,
  });
}

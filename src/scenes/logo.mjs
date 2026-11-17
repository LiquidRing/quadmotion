// Title card: letters drop in with overshoot, a rainbow wave flows through
// them per terminal column, a shine sweeps across, sparkles twinkle, then the
// word falls away. Color changes per cell, so no cell ever needs 3 colors.

import { Canvas, makeScene, palette, hsv, prng, wordGlyphs } from "./kit.mjs";

const HUES = "abcdefghijkl";

export function logoScene({ word = "QUADMOTION" } = {}) {
  const glyphs = wordGlyphs(word);
  // Each font pixel is 2 sub-pixels wide (one cell column): ~square pixels.
  const ADV = 12;
  const width = glyphs.length * ADV + 4;
  const cols = Math.ceil(width / 2);
  const W = cols * 2;
  const H = 12;
  const x0 = 2 * Math.floor((W - (glyphs.length * ADV - 2)) / 4);
  const pal = { W: "#ffffff", u: "#3a3f5c", s: "#ffe9a8" };
  [...HUES].forEach((t, i) => (pal[t] = hsv((i * 360) / HUES.length + 200, 0.62, 1)));
  const rand = prng(7);
  const sparkles = Array.from({ length: 7 }, () => ({ col: Math.floor(rand() * cols), phase: Math.floor(rand() * 18) }));

  const frames = [];
  const DROP = [-9, -7, -5, -3, -1, 1, 0];
  const FALL = [0, 1, 2, 4, 7, 11, 16];
  const reveal = glyphs.length * 3 + DROP.length;
  const shimmer = 64;
  const outro = glyphs.length * 2 + FALL.length;
  const total = reveal + shimmer + outro + 6;

  for (let t = 0; t < total; t++) {
    const c = new Canvas(W, H);
    const shineCol = t >= reveal ? Math.floor((t - reveal) * 2.2) - 6 : -99;
    glyphs.forEach((g, i) => {
      let dy = 0;
      if (t < reveal) {
        const k = t - i * 3;
        if (k < 0) return;
        dy = DROP[Math.min(k, DROP.length - 1)];
      } else if (t >= reveal + shimmer) {
        const k = t - reveal - shimmer - (glyphs.length - 1 - i) * 2;
        if (k >= FALL.length) return;
        dy = k < 0 ? 0 : FALL[k];
      }
      const gx = x0 + i * ADV;
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 5; x++) {
          if (!g[y][x]) continue;
          const px = gx + x * 2;
          const cell = px >> 1;
          const hue = HUES[Math.floor(cell * 0.35 + t * 0.4) % HUES.length];
          const shine = cell >= shineCol && cell < shineCol + 3;
          c.set(px, 2 + y + dy, shine ? "W" : hue);
          c.set(px + 1, 2 + y + dy, shine ? "W" : hue);
        }
      }
    });
    // Underline grows with the reveal and shrinks with the outro.
    const span = W - 2 * x0;
    const grow = t < reveal ? t / reveal : t >= reveal + shimmer ? Math.max(0, 1 - (t - reveal - shimmer) / outro) : 1;
    const len = Math.round(span * grow);
    const mid = W / 2;
    c.hline(Math.round(mid - len / 2), Math.round(mid + len / 2) - 1, 11, "u");

    const overlays = [];
    if (t >= reveal - 4 && t < reveal + shimmer) {
      for (const s of sparkles) {
        const k = (t + s.phase) % 18;
        const ch = ["·", "+", "*", "+", "·"][k];
        if (ch) overlays.push({ text: ch, col: s.col, row: 0, fg: "s" });
      }
    }
    frames.push({ canvas: c, overlays });
  }
  return makeScene({
    name: "logo",
    title: "Title card",
    description: "5x7 pixel font, drop-in with overshoot, per-cell rainbow wave, shine sweep, twinkling overlay sparkles.",
    cols,
    rows: 6,
    palette: palette(pal),
    tickMs: 60,
    frames,
    stillFrame: reveal + 10,
  });
}

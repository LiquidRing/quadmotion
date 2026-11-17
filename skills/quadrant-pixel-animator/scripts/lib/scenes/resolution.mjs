// Why quadrants: the same animation rendered at three effective resolutions
// side by side — full blocks (1x1 per cell), half blocks (1x2), quadrants (2x2).
// Lower resolutions are emulated by drawing at full res and then making every
// cell (or half cell) uniform, so all three go through the same compiler.

import { Canvas, makeScene, palette } from "./kit.mjs";

const PANEL_COLS = 14;
const ROWS = 6; // panel height; the scene adds one label row on top

function downsample(src, mode) {
  // mode "full": each 2x2 cell uniform; "half": each column pair uniform.
  const out = new Canvas(src.width, src.height);
  for (let y = 0; y < src.height; y += 2) {
    for (let x = 0; x < src.width; x += 2) {
      const block = [src.get(x, y), src.get(x + 1, y), src.get(x, y + 1), src.get(x + 1, y + 1)];
      if (mode === "full") {
        const on = block.filter(Boolean);
        const tok = on.length >= 2 ? majority(on) : null;
        out.rect(x, y, 2, 2, tok);
      } else {
        const top = [block[0], block[1]].filter(Boolean);
        const bot = [block[2], block[3]].filter(Boolean);
        out.rect(x, y, 2, 1, top.length ? majority(top) : null);
        out.rect(x, y + 1, 2, 1, bot.length ? majority(bot) : null);
      }
    }
  }
  return out;
}

function majority(list) {
  const m = new Map();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function drawPanel(t) {
  const c = new Canvas(PANEL_COLS * 2, ROWS * 2);
  // A ball orbiting a ring, with a thin clock hand: thin features and
  // diagonals are where low resolutions fall apart.
  const cx = PANEL_COLS;
  const cy = 6;
  const a = (t / 48) * Math.PI * 2;
  c.ellipse(cx, cy, 11, 5.5, "r");
  c.ellipse(cx, cy, 9, 4.5, null);
  c.line(cx, cy, cx + Math.cos(-a * 0.25) * 8, cy + Math.sin(-a * 0.25) * 4, "h");
  c.ellipse(cx + Math.cos(a) * 10, cy + Math.sin(a) * 5, 2.2, 1.2, "b");
  c.set(cx, cy, "h");
  return c;
}

export function resolutionScene() {
  const gap = 2;
  const cols = PANEL_COLS * 3 + gap * 2;
  const frames = [];
  for (let t = 0; t < 48; t++) {
    const full = new Canvas(cols * 2, (ROWS + 1) * 2);
    const hi = drawPanel(t);
    full.blit(downsample(hi, "full").px, 0, 2);
    full.blit(downsample(hi, "half").px, (PANEL_COLS + gap) * 2, 2);
    full.blit(hi.px, (PANEL_COLS + gap) * 4, 2);
    frames.push({
      canvas: full,
      overlays: [
        { text: "█ 1×1", col: 0, row: 0, fg: "t" },
        { text: "▀▄ 1×2", col: PANEL_COLS + gap, row: 0, fg: "t" },
        { text: "▚ 2×2", col: (PANEL_COLS + gap) * 2, row: 0, fg: "t" },
      ],
    });
  }
  return makeScene({
    name: "resolution",
    title: "Why quadrants",
    description: "One animation at three effective resolutions: full blocks, half blocks, 2x2 quadrants. Same compiler, same cell count.",
    cols,
    rows: ROWS + 1,
    palette: palette({ r: "#5b6cff", h: "#ffd166", b: "#ff5d8f", t: "#9aa3c7" }),
    tickMs: 70,
    frames,
  });
}

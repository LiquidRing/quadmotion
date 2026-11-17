// Bouncing ball with squash & stretch, a contact shadow that tracks height,
// and a fading ▓▒░ trail drawn as overlays in the cells the ball just left.

import { Canvas, makeScene, palette } from "./kit.mjs";

export function physicsScene() {
  const cols = 36;
  const rows = 6;
  const W = cols * 2;
  const H = rows * 2;
  const R = 3.2; // vertical radius in sub-pixels (horizontal = 2R)
  const floor = H - 2;
  let x = 8;
  let y = 2 + R;
  let vx = 1.6;
  let vy = 0;
  const g = 0.32;
  const frames = [];
  const trail = [];
  let squash = 0;
  for (let t = 0; t < 150; t++) {
    vy += g;
    x += vx;
    y += vy;
    if (y + R >= floor) {
      y = floor - R;
      // Lose a little energy, but keep bouncing and never leave the canvas:
      // apex = vy^2 / 2g must stay under the ~6 sub-pixels of head room.
      vy = -Math.min(1.95, Math.max(1.6, Math.abs(vy) * 0.9));
      squash = 3;
    }
    if (x - 2 * R < 1 || x + 2 * R > W - 2) {
      vx = -vx;
      x = Math.max(1 + 2 * R, Math.min(W - 2 - 2 * R, x));
    }
    const c = new Canvas(W, H);
    // floor
    c.hline(0, W - 1, H - 1, "f");
    // shadow: wider and darker the closer the ball is
    const height = floor - (y + R);
    const sw = Math.max(1, Math.round(2 * R * 2 - height * 0.7));
    c.hline(Math.round(x - sw / 2), Math.round(x + sw / 2), H - 1, "d");
    // squash on contact, stretch when fast
    const speed = Math.min(1, Math.abs(vy) / 4.5);
    let rx = 2 * R * (1 - 0.18 * speed);
    let ry = R * (1 + 0.25 * speed);
    if (squash > 0) {
      rx = 2 * R * (1 + 0.12 * squash);
      ry = R * (1 - 0.12 * squash);
      squash--;
    }
    const cy = squash > 0 ? floor - ry : y;
    c.ellipse(x, cy, rx, ry, "b");
    c.ellipse(x - rx * 0.35, cy - ry * 0.35, rx * 0.3, ry * 0.3, "h");

    // trail: cells the ball occupied in the last frames, fading
    const cell = { col: Math.round(x) >> 1, row: Math.round(cy) >> 1 };
    trail.unshift(cell);
    if (trail.length > 7) trail.pop();
    const overlays = [];
    const used = new Set();
    for (let y2 = 0; y2 < H; y2++) for (let x2 = 0; x2 < W; x2++) if (c.get(x2, y2) && c.get(x2, y2) !== "f" && c.get(x2, y2) !== "d") used.add(`${x2 >> 1},${y2 >> 1}`);
    trail.slice(2).forEach((p, i) => {
      const key = `${p.col},${p.row}`;
      if (used.has(key) || p.row >= rows - 1) return;
      used.add(key);
      overlays.push({ text: ["▓", "▒", "░", "░", "░"][i] ?? "░", col: p.col, row: p.row, fg: i < 1 ? "b" : "t" });
    });
    frames.push({ canvas: c, overlays });
  }
  return makeScene({
    name: "physics",
    title: "Squash & stretch",
    description: "Gravity, wall bounces, squash on contact, stretch with speed, a height-aware shadow and a ▓▒░ trail.",
    cols,
    rows,
    palette: palette({ b: "#ff6f59", h: "#ffd3c4", f: "#3d4566", d: "#1f2335", t: "#8a4a44" }),
    tickMs: 45,
    frames,
  });
}

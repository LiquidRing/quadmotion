// "Pip's run": a little platformer story on a 52x6-cell stage. Run cycle,
// coin pickups with sparkles, anticipation crouch, a jump arc over a crate,
// landing dust, a dash with a fading ▓▒░ trail, a waving flag, a speech
// bubble with Cyrillic text, drifting clouds. Everything is one fixed canvas.

import { Canvas, makeScene, palette } from "./kit.mjs";

const PIP = {
  default: [
    "........AA........",
    "....##########....",
    "...##E######E##...",
    "..##############..",
    "....##......##....",
    "..................",
  ],
  look_right: [
    "........AA........",
    "....##########....",
    "...###E######E#...",
    "..##############..",
    "....##......##....",
    "..................",
  ],
  crouch: [
    "..................",
    "........AA........",
    "...############...",
    "..##E########E##..",
    ".################.",
    "....##......##....",
  ],
  jump: [
    ".#..####AA####..#.",
    ".#.##E######E##.#.",
    "..##############..",
    "....##......##....",
    "..................",
    "..................",
  ],
  dash: [
    "..........AA......",
    "#...##########....",
    ".#.###E######E#...",
    "..##############..",
    "...##.......##....",
    "..................",
  ],
  wave_a: [
    "........AA........",
    "....##########..#.",
    "...##E######E##.#.",
    "..#############...",
    "....##......##....",
    "..................",
  ],
  wave_b: [
    "........AA........",
    "....##########...#",
    "...##E######E##.#.",
    "..#############...",
    "....##......##....",
    "..................",
  ],
};
const legs = (pose, row) => [...pose.slice(0, 4), row, pose[5]];
PIP.run1 = legs(PIP.look_right, "...##........##...");
PIP.run2 = legs(PIP.look_right, ".....##....##.....");
const SPR = Object.fromEntries(Object.entries(PIP).map(([k, v]) => [k, Canvas.sprite(v)]));

const CLOUD = Canvas.sprite(["...wwww.....", ".wwwwwwwww..", "wwwwwwwwwwww"]);
const CRATE = Canvas.sprite(["cccccccc", "cCCCCCCc", "cCcCCcCc", "cccccccc"]);
const FLAG = [Canvas.sprite(["FFFFF.", "FFFFFF", "FFFF.."]), Canvas.sprite(["FFFF..", "FFFFFF", "FFFFF."])];

export function runnerScene() {
  const cols = 52;
  const rows = 6;
  const W = cols * 2;
  const H = rows * 2;
  const BASE = 4; // sprite top when standing; feet land on y = 8, ground at y = 10
  const CRATE_X = 40;
  const FLAG_X = 98;
  const coins = [
    { x: 14, y: 6, taken: -1 },
    { x: 72, y: 4, taken: -1 },
  ];

  // Script: one entry per tick { pose, x, y, extra }
  const script = [];
  let x = -18;
  for (let i = 0; x < 26; i++, x += 2) script.push({ pose: i % 4 < 2 ? "run1" : "run2", x, y: BASE });
  script.push({ pose: "crouch", x: 26, y: BASE }, { pose: "crouch", x: 26, y: BASE });
  const ARC = [3, 1, 0, 0, 0, 0, 0, 1, 3];
  ARC.forEach((dy, i) => script.push({ pose: "jump", x: 28 + i * 2, y: dy }));
  script.push({ pose: "crouch", x: 46, y: BASE, dust: true }, { pose: "crouch", x: 46, y: BASE, dust: true });
  for (let i = 0, xx = 48; xx <= 52; i++, xx += 2) script.push({ pose: i % 4 < 2 ? "run1" : "run2", x: xx, y: BASE });
  for (let i = 0; i < 4; i++) script.push({ pose: "look_right", x: 52, y: BASE });
  script.push({ pose: "crouch", x: 52, y: BASE }, { pose: "crouch", x: 52, y: BASE });
  const DASH = [62, 70, 76, 80];
  let prevX = 52;
  for (const dx of DASH) {
    script.push({ pose: "dash", x: dx, y: BASE, trailFrom: prevX });
    prevX = dx;
  }
  script.push({ pose: "crouch", x: 80, y: BASE, dust: true }, { pose: "crouch", x: 80, y: BASE });
  for (let i = 0; i < 4; i++) script.push({ pose: "default", x: 80, y: BASE });
  for (let i = 0; i < 24; i++) script.push({ pose: i % 6 < 3 ? "wave_a" : "wave_b", x: 80, y: BASE, say: "Готово!" });
  for (let i = 0; i < 8; i++) script.push({ pose: "default", x: 80, y: BASE, say: i < 4 ? "Готово!" : null });

  const trails = []; // { col, row, born }
  const frames = [];
  script.forEach((s, t) => {
    const c = new Canvas(W, H);
    // sky clouds, drifting slowly
    c.blit(CLOUD, ((30 - Math.floor(t / 3)) % (W + 14) + W + 14) % (W + 14) - 12, 0);
    c.blit(CLOUD, ((84 - Math.floor(t / 4)) % (W + 14) + W + 14) % (W + 14) - 12, 1);
    // ground: grass line + soil with pebbles
    c.hline(0, W - 1, 10, "G");
    c.hline(0, W - 1, 11, "S");
    for (let px = 4; px < W; px += 14) c.rect(px, 11, 2, 1, "s");
    // crate and flag
    c.blit(CRATE, CRATE_X, 6);
    for (let y = 1; y <= 9; y++) c.set(FLAG_X, y, "p");
    c.blit(FLAG[Math.floor(t / 4) % 2], FLAG_X + 1, 1);
    // coins (spin by changing width), collected when Pip overlaps them
    const overlays = [];
    for (const coin of coins) {
      const hit = coin.taken < 0 && s.x + 4 <= coin.x + 1 && s.x + 13 >= coin.x && s.y + 5 >= coin.y && s.y <= coin.y + 1;
      if (hit) coin.taken = t;
      if (coin.taken < 0) {
        const phase = Math.floor(t / 3) % 4;
        if (phase === 1) c.rect(coin.x, coin.y, 1, 2, "Y");
        else c.rect(coin.x, coin.y, 2, 2, phase === 3 ? "y" : "Y");
      } else if (t - coin.taken < 6) {
        overlays.push({ text: ["*", "+", "·", "+", "*", "·"][t - coin.taken], col: coin.x >> 1, row: Math.max(0, (coin.y >> 1) - 1), fg: "Y" });
      }
    }
    // Pip
    c.blit(SPR[s.pose].map((r) => r), s.x, s.y);
    // dash trail: cells Pip swept through fade ▓ → ▒ → ░
    if (s.trailFrom != null) {
      for (let px = s.trailFrom + 4; px < s.x + 2; px += 2) trails.push({ col: px >> 1, row: 3, born: t });
    }
    const pipCells = new Set();
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (c.get(xx, y) && ["#", "E", "A"].includes(c.get(xx, y))) pipCells.add(`${xx >> 1},${y >> 1}`);
    for (const tr of trails) {
      const age = t - tr.born;
      if (age > 3 || pipCells.has(`${tr.col},${tr.row}`)) continue;
      overlays.push({ text: ["▓", "▒", "░", "░"][age], col: tr.col, row: tr.row, fg: age < 2 ? "#" : "d" });
    }
    if (s.dust) {
      const fc = (s.x >> 1) + 1;
      overlays.push({ text: "░", col: fc, row: 4, fg: "d" }, { text: "░", col: fc + 7, row: 4, fg: "d" });
    }
    if (s.say) {
      const col = Math.min(cols - s.say.length - 2, (s.x >> 1) - 7);
      overlays.push({ text: `‹${s.say}›`, col, row: 1, fg: "t" });
    }
    frames.push({ canvas: c, overlays });
  });

  return makeScene({
    name: "runner",
    title: "Pip's run",
    description: "Run cycle, coin pickups, anticipation, a jump arc over a crate, landing dust, a dash with a ▓▒░ trail, a waving flag and a speech bubble.",
    cols,
    rows,
    palette: palette({
      "#": "#40c0a8",
      E: "#161a26",
      A: "#facc48",
      G: "#4caf50",
      S: "#5b3a24",
      s: "#7d5a3c",
      w: "#4b5784",
      c: "#8a5a2b",
      C: "#b07a3e",
      p: "#c9c9d6",
      F: "#ff5d73",
      Y: "#ffd23f",
      y: "#c99a1c",
      d: "#6e7891",
      t: "#f2f4ff",
    }),
    tickMs: 70,
    frames,
    stillFrame: script.findIndex((s) => s.pose === "jump") + 4,
  });
}

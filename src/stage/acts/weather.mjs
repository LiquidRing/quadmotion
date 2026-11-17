// Act group "weather": Pip reacting to rain, nightfall, snow and fireflies.
// See acts/basics.mjs for the act contract.
//
// Each act owns one controller prop (kind "weather") that draws the sky and
// simulates the condition; Pip's script drives it. The script runs "tethered":
// it pings the controller every tick, and the controller winds itself down
// (rain stops, stars fade, ground restored, props removed) when the script
// ends or is interrupted, so the world is always left restorable.

import { wait, pose, settle } from "../world.mjs";
import { EYES, MOUTHS, ARMS, drawPip } from "../pip.mjs";
import { Canvas } from "../../scenes/kit.mjs";
import { happyHops } from "./basics.mjs";

const at = (entries) => Object.fromEntries(entries);
const snap = (x) => Math.round(x / 2) * 2;
const floorEven = (y) => Math.floor(y / 2) * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const PALETTE = {
  5: { name: "snow", rgb: [236, 242, 255], ansi16: 97 },
  6: { name: "cloud", rgb: [158, 166, 190], ansi16: 37 },
  7: { name: "cloud-shade", rgb: [104, 110, 136], ansi16: 90 },
  8: { name: "puddle", rgb: [62, 118, 216], ansi16: 34 },
  9: { name: "grass-dusk", rgb: [50, 116, 62], ansi16: 32 },
  N: { name: "grass-night", rgb: [30, 70, 48], ansi16: 32 },
  P: { name: "soil-dusk", rgb: [66, 42, 28], ansi16: 33 },
  n: { name: "soil-night", rgb: [40, 28, 22], ansi16: 30 },
  O: { name: "firefly", rgb: [214, 255, 104], ansi16: 93 },
  q: { name: "firefly-dim", rgb: [112, 146, 58], ansi16: 32 },
  Q: { name: "puddle-shine", rgb: [156, 206, 255], ansi16: 96 },
};

// The umbrella grip: the front arm goes up past the head and hooks in over it
// (a free row between the hand and the head), so the shaft sits near the middle.
ARMS.brolly = [[0, 0], [0, -1], [0, -2], [0, -3], [0, -4], [0, -5], [0, -6], [-2, -5], [-2, -6], [-4, -5], [-4, -6]];
MOUTHS.yawn = [".##.", "####", "####", ".##."];
MOUTHS.chatter = ["#.#.", ".#.#"];

// ------------------------------------------------------------------ helpers

/** Pip's box for the current tick (pip.box lags one frame behind). */
function pipBox(w) {
  if (w._wxBoxT === w.t && w._wxBoxState === w.pip.state) return w._wxBox;
  const p = w.pip;
  const box = drawPip(new Canvas(w.W, w.H), { ...p.state, x: p.x, ground: w.ground, facing: p.facing, feet: p.feet ?? undefined });
  w._wxBoxT = w.t;
  w._wxBoxState = p.state;
  w._wxBox = box;
  return box;
}

const bulbX = (w, box = pipBox(w)) => box.x - 2 + (w.pip.facing > 0 ? 2 : 0) + Math.round((w.pip.state.antenna ?? 0) / 2) * 2;

function cellFree(c, x, y) {
  const cx = Math.floor(x / 2) * 2;
  const cy = Math.floor(y / 2) * 2;
  return !c.get(cx, cy) && !c.get(cx + 1, cy) && !c.get(cx, cy + 1) && !c.get(cx + 1, cy + 1);
}

/** Draw a token only where its cell is still empty (things behind Pip and props). */
function putBehind(c, x, y, tok) {
  x = Math.round(x);
  y = Math.round(y);
  if (cellFree(c, x, y)) c.set(x, y, tok);
}

/** Blit a sprite, skipping every cell that already holds something. */
function blitBehind(c, rows, x0, y0, { remap, clipY = Infinity } = {}) {
  const blocked = new Set();
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== "." && !cellFree(c, x0 + i, y0 + j)) blocked.add(`${Math.floor((x0 + i) / 2)},${Math.floor((y0 + j) / 2)}`);
  }));
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === "." || y0 + j >= clipY) return;
    if (blocked.has(`${Math.floor((x0 + i) / 2)},${Math.floor((y0 + j) / 2)}`)) return;
    c.set(x0 + i, y0 + j, remap?.[ch] ?? ch);
  }));
}

/** Author sprites per cell column: every character becomes 2 sub-pixels wide. */
const wide = (rows) => rows.map((r) => [...r].map((ch) => ch + ch).join(""));

// Ground tint for dusk (1) and night (2). Pip never draws on the ground rows.
const TINT = [null, { G: "9", D: "P", o: "D" }, { G: "N", D: "n", o: "P" }];
function tintGround(c, w, level) {
  const m = TINT[level];
  if (!m) return;
  for (const y of [w.ground, w.ground + 1]) for (let x = 0; x < w.W; x++) {
    const t = c.get(x, y);
    if (m[t]) c.set(x, y, m[t]);
  }
}

function* until(pip, w, pred, max = 400) {
  for (let i = 0; i < max && !pred(); i++) yield;
}

/** Hold a pose, with optional blink at tick b (2 ticks) and a slow breath. */
function* hold(pip, w, n, { blinkAt = -1, breathe = 0 } = {}) {
  const s = pip.state;
  const eyes = s.eyes;
  const body = s.body;
  for (let i = 0; i < n; i++) {
    if (blinkAt >= 0 && i === blinkAt) s.eyes = "blink";
    if (blinkAt >= 0 && i === blinkAt + 2) s.eyes = eyes;
    if (breathe && (body === "n" || body === "b")) s.body = (w.t % breathe) < breathe / 2 ? "b" : "n";
    yield;
  }
  if (breathe) s.body = body;
}

// ------------------------------------------------------------------ controller

class Ctl {
  constructor(w) {
    this.kind = "weather";
    this.layer = "front";
    this.w = w;
    this.t = 0;
    this.alive = -1;
    this.ending = false;
    this.born = w.t;
    this.level = 0; // ground tint now (0 day, 1 dusk, 2 night)
    this.goal = 0; // ground tint to ease toward, one step every 6 ticks
  }
  step(w) {
    this.t++;
    if (this.level !== this.goal && this.t - (this.levelAt ?? -99) >= 6) {
      this.level += Math.sign(this.goal - this.level);
      this.levelAt = this.t;
    }
    if (!this.ending && this.alive >= 0 && w.t - this.alive > 2) this.end();
    if (!this.ending && this.alive < 0 && this.t > 900) this.end();
  }
  end() {
    this.ending = true;
    this.goal = 0;
  }
}

/** Run an act script while keeping its controller alive; release it at the end. */
function* tethered(pip, w, ctl, script) {
  const gen = script(pip, w, ctl);
  for (;;) {
    if (ctl.dead || ctl.ending) {
      // cut short (another act took over): drop props, stand up, light on
      pip.state.bulb = "on";
      yield* settle(pip, w);
      return;
    }
    ctl.alive = w.t;
    if (gen.next().done) break;
    yield;
  }
  ctl.end();
}

function begin(w, ctl, script, extraProps = []) {
  for (const p of w.props) if (p.kind === "weather") p.end();
  w.props.push(...extraProps, ctl);
  w.pip.do(tethered, ctl, script);
  return ctl;
}

// ================================================================== RAIN

const CLOUDS = {
  a: ["....666...666...", "..66666666666...", ".6666666666666..", "6666666666666666", "6666666666666666", ".77777777777777."],
  b: ["...6666...", ".66666666.", "6666666666", ".77777777."],
  c: ["......6666.....66...", "...66666666666666...", ".66666666666666666..", "66666666666666666666", "66666666666666666666", "..7777777777777777.."],
  d: ["...66666....", ".6666666666.", "666666666666", ".7777777777."],
};
const CLOUD_DARK = { 6: "7", 7: "k" };

// Canopy states, authored per cell column; the middle column is the shaft.
const CANOPY = [
  [".U.", ".U.", ".U.", ".u."],
  ["..U..", ".UUU.", ".UUU.", ".u.u."],
  ["....UUU....", "..UUUUUUU..", ".UUUUUUUUU.", ".u.u...u.u."],
  [".....UUUUUUU.....", "..UUUUUUUUUUUUU..", "UUUUUUUUUUUUUUUUU", "u.u.u.u...u.u.u.u"],
].map(wide);

/** Umbrella in Pip's front hand; drawn only while that arm holds it up. */
class Brolly {
  constructor(pip) {
    this.kind = "brolly";
    this.pip = pip;
    this.open = 0;
    this.lift = 0;
    this.geo = null;
  }
  draw(c, w) {
    this.geo = null;
    const s = this.pip.state;
    if (s.armR !== "brolly" || this.dead) return;
    const box = pipBox(w);
    const bw = box.right - box.left + 1;
    const h = box.bodyBottom - box.bodyTop + 1;
    const hx = this.pip.facing > 0 ? box.left + bw - 4 : box.left + 2;
    const handTop = box.bodyTop + (h >= 8 ? 3 : 2) - 6;
    const rows = CANOPY[this.open];
    const W = rows[0].length;
    const left = hx + 1 - W / 2;
    const top = Math.max(0, floorEven(handTop - 5) - 2 * this.lift);
    rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== "." && c.set(left + i, top + j, ch)));
    c.set(hx, top - 1, "K");
    c.set(hx + 1, top - 1, "K");
    for (let y = top + 4; y < handTop; y++) {
      c.set(hx, y, "K");
      c.set(hx + 1, y, "K");
    }
    const profile = [];
    for (let i = 0; i < W; i++) {
      const j = rows.findIndex((r) => r[i] !== ".");
      profile.push(j < 0 ? null : top + j);
    }
    this.geo = { left, right: left + W - 1, top, profile, cx: hx + 1 };
  }
}

class RainCtl extends Ctl {
  constructor(w, { dir }) {
    super(w);
    this.dir = dir;
    this.brolly = new Brolly(w.pip);
    const px = snap(w.pip.x);
    // left edges for dir = 1, mirrored for dir = -1
    const mk = (shape, off, y, from, delay) => {
      const cw = shape[0].length * 2;
      const tx = dir > 0 ? px + off : px - off - cw;
      return { rows: wide(shape), cw, tx, x: from * dir < 0 ? -cw : w.W, y, delay };
    };
    this.clouds = [
      mk(CLOUDS.a, -16, 0, -1, 0),
      mk(CLOUDS.d, -44, 2, -1, 10),
      mk(CLOUDS.b, 20, 2, 1, 4),
      mk(CLOUDS.c, 44, 0, 1, 12),
    ];
    this.dark = false;
    this.rate = 0;
    this.acc = 0;
    this.hitAt = 0;
    this.puddle = { x: snap(clamp(px + dir * 22, 14, w.W - 14)), vol: 0, units: 0, splash: 0, ripples: new Map() };
  }
  end() {
    if (this.ending) return;
    super.end();
    this.rate = 0;
    this.brolly.dead = true;
    this.clearSky();
  }
  /** The clouds move on with the wind (leftward, like the rain). */
  clearSky() {
    if (this.cleared) return;
    this.cleared = true;
    for (const c of this.clouds) c.tx = -c.cw - 8 - Math.max(0, c.x) / 3;
  }
  /** One drop, falling slowly from the cloud straight onto the bulb. */
  dropOnBulb() {
    const w = this.w;
    const box = pipBox(w);
    w.particles.push({ x: bulbX(w, box) + 0.5, y: 5, vx: 0, vy: 0.55, g: 0, life: 60, tok: "r", splash: true, first: true });
  }
  step(w) {
    super.step(w);
    for (const c of this.clouds) {
      if (c.delay > 0) {
        c.delay--;
        continue;
      }
      const d = c.tx - c.x;
      c.x += Math.sign(d) * Math.min(Math.abs(d), Math.max(0.5, Math.abs(d) * 0.12), 2.4);
    }
    // drops fall from the cloud bellies
    this.acc += this.rate;
    const over = this.clouds.filter((c) => c.x > -c.cw + 4 && c.x < w.W - 4);
    while (this.acc >= 1 && over.length) {
      this.acc -= 1;
      const c = over[Math.floor(w.rand() * over.length)];
      w.particles.push({ x: c.x + 2 + w.rand() * (c.cw - 4), y: c.y + 4, vx: -0.3, vy: 1.6, g: 0, life: 40, tok: "r", splash: true });
    }
    if (!over.length) this.acc = 0;
    // puddle fills while it rains, dries after
    const P = this.puddle;
    if (this.rate > 0) P.vol = Math.min(13, P.vol + this.rate * 0.08);
    else if (this.ending || this.t > 0) P.vol = Math.max(0, P.vol - (this.ending ? 0.25 : 0.02));
    P.units = P.vol < 1 ? 0 : 2 * Math.floor((P.vol - 1) / 2) + 1;
    if (P.splash > 0) P.splash--;
    for (const [k, v] of P.ripples) v <= 1 ? P.ripples.delete(k) : P.ripples.set(k, v - 1);
    // drops meet the umbrella, Pip, the puddle
    const box = pipBox(w);
    const g = this.brolly.geo;
    const bx = bulbX(w, box);
    for (const q of w.particles) {
      if (q.tok !== "r" || q.life <= 0) continue;
      const X = Math.round(q.x + q.vx);
      const Y = Math.round(q.y + q.vy + (q.g ?? 0));
      if (g && X >= g.left && X <= g.right && g.profile[X - g.left] != null && Y >= g.profile[X - g.left] - 1 && Y <= w.ground) {
        q.life = 0;
        if (q.splash) w.spray(X, g.profile[X - g.left] - 2, 1, { tok: "r", dir: X < g.cx ? -1 : 1, speed: 0.5, up: 0.45, g: 0.15, life: 4 });
        continue;
      }
      if (X >= box.left && X <= box.right && Y <= box.bodyBottom) {
        const surf = X >= bx && X <= bx + 1 ? box.top : box.bodyTop;
        if (Y >= surf - 1) {
          q.life = 0;
          if (q.splash) w.spray(X, surf - 2, 1, { tok: "r", speed: 0.35, up: 0.5, g: 0.15, life: 4 });
          if (q.first) {
            this.hitAt = w.t;
            w.spray(bx - 1, box.top, 1, { tok: "r", dir: -1, speed: 0.4, up: 0.5, g: 0.12, life: 6 });
            w.spray(bx + 2, box.top, 1, { tok: "r", dir: 1, speed: 0.4, up: 0.5, g: 0.12, life: 6 });
          }
          continue;
        }
      }
      if (q.splash && Y >= w.ground - 1 && P.units) {
        const u = Math.round((X - P.x) / 2);
        if (Math.abs(u) <= (P.units - 1) / 2) P.ripples.set(u, 3);
      }
    }
    if (this.ending && P.vol <= 0 && this.clouds.every((c) => c.x <= -c.cw || c.x >= w.W)) this.dead = true;
  }
  splashAt(x, big) {
    const w = this.w;
    if (big) {
      // from just outside the squashed body, so the crown of the splash is seen
      w.spray(x - 16, w.ground - 2, 4, { tok: "Q", dir: -1, speed: 1.1, up: 1.4, g: 0.16, life: 9 });
      w.spray(x + 16, w.ground - 2, 4, { tok: "Q", dir: 1, speed: 1.1, up: 1.4, g: 0.16, life: 9 });
      this.puddle.splash = 4;
    } else {
      w.spray(x - 15, w.ground - 1, 2, { tok: "Q", dir: -1, speed: 0.5, up: 0.6, g: 0.16, life: 5 });
      w.spray(x + 15, w.ground - 1, 2, { tok: "Q", dir: 1, speed: 0.5, up: 0.6, g: 0.16, life: 5 });
    }
  }
  draw(c, w) {
    for (const cl of this.clouds) blitBehind(c, cl.rows, snap(cl.x), cl.y, { remap: this.dark ? CLOUD_DARK : null });
    const P = this.puddle;
    if (P.units) {
      const half = (P.units - 1) / 2 + (P.splash > 0 ? 1 : 0);
      for (let u = -half; u <= half; u++) {
        const x = P.x + 2 * u;
        const edge = Math.abs(u) === half;
        const froth = P.splash > 0 && Math.abs(u) <= 2;
        const tok = froth || P.ripples.has(u) ? "Q" : "8";
        for (const dx of [0, 1]) {
          c.set(x + dx, w.ground, tok);
          if (!edge) c.set(x + dx, w.ground + 1, "8");
        }
      }
    }
  }
}

/** Hop forward holding the umbrella up: crouch, arc, splash-down, settle. */
function* brollyHop(pip, w, ctl, dx) {
  const s = pip.state;
  const dir = Math.sign(dx) || pip.facing;
  Object.assign(s, { body: "s1", legLen: 1, armL: "back", eyes: "happy", mouth: "smile", antenna: 0, look: 0, lookY: 0 });
  ctl.splashAt(pip.x, false);
  yield;
  Object.assign(s, { body: "s2", legLen: 0 });
  yield;
  yield;
  const x0 = pip.x;
  const n = 10;
  Object.assign(s, { body: "t1", legLen: 3, armL: "up", antenna: -2 * dir, mouth: "o", eyes: "open" });
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pip.x = x0 + dx * t;
    s.y = Math.round(4 * 4 * t * (1 - t));
    if (t > 0.25 && t < 0.75) Object.assign(s, { body: "n", legLen: 1, antenna: 0 });
    else if (t >= 0.75) Object.assign(s, { body: "t1", legLen: 2, armL: "out", antenna: 2 * dir });
    yield;
  }
  s.y = 0;
  Object.assign(s, { body: "s2", legLen: 0, armL: "out", eyes: "happy", mouth: "grin" });
  ctl.splashAt(pip.x, true);
  yield* wait(pip, w, 3);
  Object.assign(s, { body: "s1", legLen: 1, antenna: 0 });
  yield;
  Object.assign(s, { body: "n", legLen: 2, armL: "down" });
  yield;
}

function* rainScript(pip, w, ctl) {
  const s = pip.state;
  const dir = ctl.dir;
  const B = ctl.brolly;
  // clouds roll in from behind; the eyes catch the big one and ride along
  const main = ctl.clouds[0];
  yield* wait(pip, w, 6);
  for (let k = 0; k < 40 && Math.abs(main.tx - main.x) > 1; k++) {
    Object.assign(s, { eyes: "look_up", lookY: -1, look: clamp(Math.round((main.x + main.cw / 2 - pip.x) / 8), -3, 3) });
    yield;
  }
  yield* pose(pip, w, { look: 0 }, 6);
  yield* pose(pip, w, { eyes: "blink", lookY: 0 }, 2);
  yield* pose(pip, w, { eyes: "open" }, 6);
  // the first drop lands on the bulb
  ctl.dropOnBulb();
  yield* until(pip, w, () => ctl.hitAt);
  Object.assign(s, { eyes: "closed", body: "s1", legLen: 1, bulb: "glow", antenna: 0 });
  yield;
  yield;
  Object.assign(s, { eyes: "blink", body: "n", legLen: 2, bulb: "on" });
  yield;
  yield* pose(pip, w, { eyes: "look_up", lookY: -1 }, 10);
  ctl.rate = 0.25;
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* pose(pip, w, { eyes: "look_up", look: -2 }, 6);
  ctl.rate = 0.6;
  yield* pose(pip, w, { look: 2 }, 6);
  yield* pose(pip, w, { look: 0, lookY: 0, eyes: "open", mouth: "flat" }, 6);
  ctl.rate = 1.0;
  // pull the umbrella: reach behind, swing it up, open it in steps
  yield* pose(pip, w, { body: "s1", legLen: 1, armR: "back", look: -2 * dir }, 3);
  B.open = 0;
  yield* pose(pip, w, { body: "t1", legLen: 2, armR: "brolly", eyes: "look_up", lookY: -1, look: 0, mouth: null }, 4);
  B.open = 1;
  yield* pose(pip, w, { body: "n" }, 2);
  B.open = 2;
  yield* wait(pip, w, 2);
  B.open = 3;
  B.lift = 1;
  ctl.rate = 1.6;
  yield* pose(pip, w, { body: "s1", legLen: 1, eyes: "closed" }, 1);
  B.lift = 0;
  yield* pose(pip, w, { body: "n", legLen: 2, eyes: "open", lookY: 0 }, 2);
  yield* pose(pip, w, { eyes: "happy", mouth: "smile" }, 10);
  // heavy rain drums on the canopy; a puddle grows in front
  ctl.dark = true;
  ctl.rate = 2.6;
  yield* pose(pip, w, { eyes: "look_up", mouth: null, lookY: -1 }, 8);
  // bob along to the drumming
  for (let k = 0; k < 3; k++) {
    yield* pose(pip, w, { body: "s1", legLen: 1, eyes: "happy", lookY: 0 }, 2);
    yield* pose(pip, w, { body: "n", legLen: 2 }, 4);
  }
  yield* pose(pip, w, { eyes: "open", lookY: 1, look: 2 * dir }, 10);
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* pose(pip, w, { eyes: "open" }, 4);
  yield* brollyHop(pip, w, ctl, ctl.puddle.x - pip.x);
  // a second, smaller stomp
  yield* pose(pip, w, { eyes: "happy", mouth: "smile" }, 4);
  yield* pose(pip, w, { body: "s1", legLen: 1 }, 2);
  ctl.splashAt(pip.x, false);
  ctl.puddle.splash = 2;
  yield* pose(pip, w, { body: "n", legLen: 2 }, 6);
  // the rain stops
  ctl.rate = 1.2;
  yield* pose(pip, w, { mouth: null, eyes: "open" }, 6);
  ctl.rate = 0.5;
  yield* wait(pip, w, 6);
  ctl.rate = 0;
  ctl.dark = false;
  yield* pose(pip, w, { eyes: "look_up", lookY: -1 }, 6);
  yield* pose(pip, w, { armL: "out" }, 10);
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* pose(pip, w, { eyes: "open", lookY: 0, armL: "down" }, 3);
  ctl.clearSky();
  B.open = 2;
  yield* wait(pip, w, 2);
  B.open = 1;
  yield* wait(pip, w, 2);
  B.open = 0;
  yield* wait(pip, w, 3);
  yield* pose(pip, w, { armR: "back", body: "t1" }, 3);
  yield* pose(pip, w, { armR: "down", body: "n" }, 3);
  // shake off the droplets
  yield* pose(pip, w, { body: "s1", legLen: 1, eyes: "closed" }, 3);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    Object.assign(s, { body: i % 2 ? "t1" : "n", legLen: 2, antenna: 2 * side, look: side, armL: i % 2 ? "out" : "down", armR: i % 2 ? "down" : "out" });
    const box = pipBox(w);
    if (i < 6) {
      w.spray(box.left - 2, box.bodyTop + 2, 1, { tok: "r", dir: -1, speed: 0.9, up: 0.6, g: 0.15, life: 6 });
      w.spray(box.right + 2, box.bodyTop + 2, 1, { tok: "r", dir: 1, speed: 0.9, up: 0.6, g: 0.15, life: 6 });
    }
    yield;
  }
  yield* settle(pip, w);
  yield* pose(pip, w, { eyes: "happy", mouth: "smile" }, 8);
  yield* settle(pip, w);
}

function startRain(w) {
  const dir = w.pip.x < w.W / 2 ? 1 : -1;
  w.pip.facing = dir;
  const ctl = new RainCtl(w, { dir });
  begin(w, ctl, rainScript, [ctl.brolly]);
}

// ================================================================== NIGHT

// 12 x 6 sub-pixels reads round (a sub-pixel is twice as tall as wide); dim craters.
const MOON = ["..MMMMMMMM..", "MMMMMMMMsMMM", "MMMsMMMMMMMM", "MMMssMMMMMMM", "MMMMMMMMMsMM", "..MMMMMMMM.."];

class NightCtl extends Ctl {
  constructor(w) {
    super(w);
    this.want = 0;
    this.stars = [];
    this.lastStar = -99;
    const px = w.pip.x;
    this.moon = { x: px < w.W / 2 ? w.W - 22 : 10, y: w.ground + 2, ty: w.ground + 2 };
    this.zs = [];
  }
  end() {
    if (this.ending) return;
    super.end();
    this.want = 0;
    this.moon.ty = this.w.ground + 2;
    if (this.ownsBulb) this.w.pip.state.bulb = "on";
  }
  addStar(w) {
    let best = null;
    for (let k = 0; k < 12; k++) {
      const x = 2 + Math.floor(w.rand() * (w.W - 4));
      const y = Math.floor(w.rand() * 10);
      if (Math.abs(x - (this.moon.x + 6)) < 13 && y < 11) continue;
      if (Math.abs(x - w.pip.x) < 18 && y > 3) continue;
      const d = Math.min(99, ...this.stars.map((s) => Math.abs(s.x - x) + 2 * Math.abs(s.y - y)));
      if (!best || d > best.d) best = { x, y, d };
    }
    if (!best) return;
    this.stars.push({ x: best.x, y: best.y, big: w.rand() < 0.35, born: this.t, period: 14 + Math.floor(w.rand() * 16), phase: Math.floor(w.rand() * 30), fade: null });
    this.newest = this.stars[this.stars.length - 1];
  }
  z(ch) {
    const w = this.w;
    const box = pipBox(w);
    this.zs.push({ ch, col: Math.round(w.pip.x / 2) + 2 * w.pip.facing, row: Math.floor(box.top / 2) - 1, age: 0 });
  }
  step(w) {
    super.step(w);
    const live = this.stars.filter((s) => s.fade === null);
    if (live.length < this.want && this.t - this.lastStar >= 3) {
      this.addStar(w);
      this.lastStar = this.t;
    } else if (live.length > this.want && this.t - this.lastStar >= 2) {
      live[Math.floor(w.rand() * live.length)].fade = this.t;
      this.lastStar = this.t;
    }
    this.stars = this.stars.filter((s) => s.fade === null || this.t - s.fade < 4);
    const d = this.moon.ty - this.moon.y;
    this.moon.y += Math.sign(d) * Math.min(Math.abs(d), 0.4);
    for (const z of this.zs) {
      z.age++;
      const row = z.row - Math.floor(z.age / 7);
      const col = z.col + Math.floor(z.age / 9) * w.pip.facing;
      if (row >= 0 && z.age < 28) w.overlays.push({ text: z.ch, col, row, fg: "z", until: w.t + 1 });
    }
    this.zs = this.zs.filter((z) => z.age < 28);
    if (this.ending) {
      if (!this.stars.length && this.moon.y >= w.ground + 1 && this.level === 0) this.dead = true;
    }
  }
  draw(c, w) {
    tintGround(c, w, this.level);
    for (const s of this.stars) {
      const age = this.t - s.born;
      let tok;
      if (s.fade !== null) tok = this.t - s.fade < 2 && s.big ? "s" : this.t - s.fade < 2 ? "s" : null;
      else if (age < 2) tok = "S";
      else {
        const tw = (this.t + s.phase) % s.period < 2;
        tok = s.big ? (tw ? "s" : "S") : tw ? null : "s";
      }
      if (tok) putBehind(c, s.x, s.y, tok);
    }
    blitBehind(c, MOON, this.moon.x, Math.round(this.moon.y), { clipY: w.ground });
  }
}

function* nightScript(pip, w, ctl) {
  const s = pip.state;
  const lookAt = (x) => clamp(Math.round((x - pip.x) / 10), -3, 3);
  // dusk: the ground dims, the stars come out one by one; the eyes find each
  yield* wait(pip, w, 4);
  ctl.goal = 1;
  ctl.want = 14;
  for (let k = 0; k < 5; k++) {
    yield* until(pip, w, () => ctl.newest && ctl.newest !== ctl._seen, 20);
    ctl._seen = ctl.newest;
    Object.assign(s, { eyes: "look_up", lookY: -1, look: lookAt(ctl.newest.x) });
    yield* wait(pip, w, 5);
  }
  ctl.goal = 2;
  s.bulb = "glow";
  ctl.ownsBulb = true;
  // the moon rises on the far side
  ctl.moon.ty = 3;
  yield* pose(pip, w, { look: lookAt(ctl.moon.x + 4), mouth: "o" }, 10);
  yield* wait(pip, w, 12);
  yield* pose(pip, w, { mouth: null, lookY: 0, eyes: "open" }, 4);
  yield* pose(pip, w, { eyes: "blink" }, 3);
  yield* pose(pip, w, { eyes: "sleepy", look: 0 }, 8);
  // yawn: inhale and stretch, mouth wide, then a squashed exhale
  yield* pose(pip, w, { body: "b", eyes: "closed", mouth: "o" }, 4);
  yield* pose(pip, w, { body: "t2", legLen: 2, mouth: "yawn", antenna: 0 }, 10);
  yield* pose(pip, w, { body: "s1", legLen: 1, mouth: "o" }, 3);
  yield* pose(pip, w, { body: "n", legLen: 2, mouth: null, eyes: "sleepy" }, 3);
  // the bulb dims: glow, on, a stutter, off
  for (const [b, n] of [["on", 4], ["off", 1], ["on", 2], ["off", 1], ["on", 1], ["off", 2]]) yield* pose(pip, w, { bulb: b }, n);
  // sit down with a soft plop
  yield* pose(pip, w, { body: "s1", legLen: 1 }, 2);
  w.dust(pip.x, 0);
  yield* pose(pip, w, { body: "s2", legLen: 0 }, 2);
  yield* pose(pip, w, { body: "n", legLen: 0 }, 6);
  // eyes droop, one nod back awake, then closed
  yield* pose(pip, w, { eyes: "blink" }, 6);
  yield* pose(pip, w, { eyes: "open", antenna: 0 }, 3);
  yield* pose(pip, w, { eyes: "sleepy" }, 8);
  yield* pose(pip, w, { eyes: "blink", antenna: 2 * pip.facing }, 6);
  // sleep: long slow breaths, z Z z drifting up
  for (const [k, len] of [32, 40, 50].entries()) {
    const inhale = Math.round(len * 0.45);
    for (let i = 0; i < len; i++) {
      s.body = i < inhale ? "b" : "n";
      if (k % 2 === 0 && i === inhale) ctl.z("z");
      if (k % 2 === 0 && i === inhale + 8) ctl.z("Z");
      if (k % 2 === 0 && i === inhale + 16) ctl.z("z");
      yield;
    }
  }
  // morning: the bulb flickers back on
  ctl.goal = 1;
  for (const [b, n] of [["on", 2], ["off", 3], ["on", 1], ["off", 4], ["on", 3]]) yield* pose(pip, w, { bulb: b }, n);
  ctl.ownsBulb = false;
  // wakes with a start
  w.mark("!", 8, { dx: 2 * pip.facing });
  yield* pose(pip, w, { body: "t2", legLen: 3, eyes: "wide", armL: "out", armR: "out", antenna: -2 * pip.facing }, 4);
  yield* pose(pip, w, { body: "n", legLen: 2, eyes: "open", armL: "down", armR: "down", antenna: 2 * pip.facing }, 2);
  yield* pose(pip, w, { antenna: 0, look: -2 }, 4);
  yield* pose(pip, w, { look: 2 }, 4);
  yield* pose(pip, w, { look: 0, eyes: "blink" }, 2);
  // stretch: crouch, arms up and tall, release
  yield* pose(pip, w, { eyes: "open", body: "s1", legLen: 1 }, 2);
  yield* pose(pip, w, { body: "t2", legLen: 3, armL: "up", armR: "up", eyes: "closed", mouth: "o" }, 10);
  yield* pose(pip, w, { body: "s1", legLen: 1, armL: "out", armR: "out", mouth: null }, 2);
  yield* settle(pip, w);
  // the stars fade, the moon sets, day is back
  ctl.want = 0;
  ctl.moon.ty = w.ground + 2;
  yield* pose(pip, w, { eyes: "look_up", lookY: -1, look: 1 }, 10);
  ctl.goal = 0;
  yield* pose(pip, w, { eyes: "happy", lookY: 0, look: 0, mouth: "smile" }, 10);
  yield* settle(pip, w);
}

function startNight(w) {
  begin(w, new NightCtl(w), nightScript);
}

// ================================================================== SNOW

class SnowCtl extends Ctl {
  constructor(w) {
    super(w);
    this.rate = 0;
    this.acc = 0;
    this.flakes = [];
    this.ground = new Array(w.cols).fill(0);
    this.pile = new Map(); // unit offset from Pip's x -> height
    this.focus = 0.25; // share of flakes spawned over Pip, so the cap builds in time
    this.melted = 0;
  }
  end() {
    if (this.ending) return;
    super.end();
    this.rate = 0;
  }
  /** A lone flake that sways down and lands exactly on x (the bulb). */
  guided(x, vy = 0.3) {
    const f = { x, y: -1, vy, ph: 0, amp: 0, home: x, y0: -1 };
    this.flakes.push(f);
    return f;
  }
  pileUnits(box) {
    // units fully over the body's top row, minus the antenna's column
    const stalk = Math.floor((bulbX(this.w, box) - box.x) / 2);
    const ks = [];
    for (let x = box.left + 2; x <= box.right - 3; x += 2) {
      const k = (x - box.x) / 2;
      if (k !== stalk) ks.push(k);
    }
    return ks;
  }
  /** The whole cap flies off at once, from just above the (new) head. */
  shakeOff() {
    const w = this.w;
    const box = pipBox(w);
    for (const [k, h] of this.pile) {
      const x = box.x + 2 * k + (k < 0 ? -2 : 2);
      w.spray(x, box.top - 1, h, { tok: "5", dir: k < 0 ? -1 : 1, speed: 1.1, up: 1.1, g: 0.12, life: 12, spread: 1 });
    }
    this.pile.clear();
    this.noPile = true;
  }
  step(w) {
    super.step(w);
    this.acc += this.rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      const near = w.rand() < this.focus;
      this.flakes.push({ x: near ? w.pip.x - 14 + w.rand() * 28 : w.rand() * (w.W + 16) - 8, y: -1, vy: 0.4 + w.rand() * 0.2, ph: w.rand() * 6.28, amp: 0.12 + w.rand() * 0.14 });
    }
    const box = pipBox(w);
    const units = new Set(this.pileUnits(box));
    const bx = bulbX(w, box);
    for (const f of this.flakes) {
      f.y += f.vy;
      if (f.home != null) {
        const left = clamp(1 - (f.y - f.y0) / (box.top - 1 - f.y0), 0, 1);
        f.x = f.home + Math.sin((f.y - f.y0) * 0.45) * 7 * left;
      } else f.x += Math.sin(f.ph + this.t * 0.22) * f.amp - 0.04;
      const X = Math.round(f.x);
      const Y = Math.round(f.y);
      if (X >= bx && X <= bx + 1 && Y >= box.top - 1 && Y <= box.top + 1) {
        f.dead = true;
        this.melted++;
        this.meltAt = w.t;
        w.particles.push({ x: bx + 0.5, y: box.top - 2, vx: 0.1, vy: -0.35, g: 0, life: 5, tok: "d", floor: false });
        continue;
      }
      const k = Math.floor((X - box.x) / 2);
      if (units.has(k) && Y >= box.bodyTop - 1 - (this.pile.get(k) ?? 0)) {
        f.dead = true;
        this.addPile(k, units);
        continue;
      }
      if (X >= box.left && X <= box.right && Y >= box.bodyTop && Y <= box.footY) {
        f.dead = true;
        continue;
      }
      if (Y >= w.ground - 1) {
        f.dead = true;
        const u = Math.floor(X / 2);
        if (u >= 0 && u < this.ground.length) this.ground[u]++;
      }
    }
    this.flakes = this.flakes.filter((f) => !f.dead && f.x > -10 && f.x < w.W + 10);
    if (this.ending) {
      if (this.t % 2 === 0) {
        const u = this.ground.findIndex((v) => v > 0);
        if (u >= 0) this.ground[u] = 0;
        const v = this.ground.findLastIndex((v) => v > 0);
        if (v >= 0) this.ground[v] = 0;
      }
      if (!this.flakes.length && this.ground.every((v) => !v)) this.dead = true;
    }
  }
  /** A flake settles in the lowest spot next to where it hit: an even, domed cap. */
  addPile(k, units) {
    if (this.noPile) return;
    const ks = [...units].sort((a, b) => a - b);
    const mid = (ks[0] + ks[ks.length - 1]) / 2;
    const cap = (j) => Math.max(1, 4 - Math.floor(Math.abs(j - mid) / 1.8));
    const h = (j) => this.pile.get(j) ?? 0;
    let best = null;
    for (const j of [k, k - 1, k + 1, k - 2, k + 2]) {
      if (!units.has(j) || h(j) >= cap(j)) continue;
      if (best === null || h(j) < h(best)) best = j;
    }
    if (best !== null) this.pile.set(best, h(best) + 1);
  }
  draw(c, w) {
    for (let u = 0; u < this.ground.length; u++) if (this.ground[u] >= 1) {
      c.set(2 * u, w.ground, "5");
      c.set(2 * u + 1, w.ground, "5");
    }
    for (const f of this.flakes) putBehind(c, f.x, f.y, "5");
  }
}

/** The snow pile is drawn before Pip so his own pixels always win. */
class SnowCap {
  constructor(ctl) {
    this.kind = "snowcap";
    this.ctl = ctl;
  }
  step() {
    if (this.ctl.dead) this.dead = true;
  }
  draw(c, w) {
    const box = pipBox(w);
    const units = new Set(this.ctl.pileUnits(box));
    for (const [k, h] of this.ctl.pile) {
      if (!units.has(k)) continue;
      const x = box.x + 2 * k;
      for (let j = 1; j <= h; j++) {
        c.set(x, box.bodyTop - j, "5");
        c.set(x + 1, box.bodyTop - j, "5");
      }
    }
  }
}

function* snowScript(pip, w, ctl) {
  const s = pip.state;
  const box0 = pipBox(w);
  // the first flake drifts down toward the bulb; the eyes ride it down
  yield* wait(pip, w, 6);
  const first = ctl.guided(bulbX(w, box0) + 0.5, 0.3);
  yield* wait(pip, w, 6);
  for (let k = 0; k < 120 && !ctl.melted; k++) {
    const dy = first.y - pipBox(w).top;
    Object.assign(s, { eyes: dy < -2 ? "look_up" : "open", lookY: -1, look: clamp(Math.round((first.x - pip.x) / 3), -2, 2) });
    yield;
  }
  // tss: the warm bulb melts it
  Object.assign(s, { bulb: "glow", eyes: "blink", body: "s1", legLen: 1 });
  yield;
  yield;
  Object.assign(s, { bulb: "on", eyes: "look_up", body: "n", legLen: 2, look: 0 });
  yield* wait(pip, w, 8);
  yield* pose(pip, w, { eyes: "happy", lookY: 0, mouth: "smile" }, 8);
  // snow sets in; Pip stands still and it piles on his head
  ctl.rate = 0.8;
  yield* pose(pip, w, { eyes: "open", mouth: null }, 10);
  ctl.rate = 1.6;
  yield* hold(pip, w, 26, { blinkAt: 14 });
  yield* pose(pip, w, { eyes: "look_up", lookY: -1 }, 8);
  yield* pose(pip, w, { eyes: "open", lookY: 0 }, 10);
  // brr
  w.mark("brr", 10, { dx: 3 * pip.facing });
  for (let i = 0; i < 8; i++) yield* pose(pip, w, { eyes: "closed", mouth: i % 2 ? "chatter" : "flat", body: i % 2 ? "b" : "n" }, 1);
  yield* pose(pip, w, { eyes: "open", mouth: null, body: "n" }, 16);
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* pose(pip, w, { eyes: "look_up", lookY: -1 }, 10);
  yield* pose(pip, w, { eyes: "open", lookY: 0, mouth: "flat" }, 4);
  // shake it off: squash, then pop tall and the whole cap flies
  yield* pose(pip, w, { body: "s1", legLen: 1, eyes: "closed", mouth: null }, 3);
  Object.assign(s, { body: "t2", legLen: 3, armL: "out", armR: "out", antenna: 2 });
  ctl.shakeOff();
  ctl.rate = 0.5;
  yield* wait(pip, w, 2);
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? -1 : 1;
    Object.assign(s, { body: i % 2 ? "t1" : "n", legLen: 2, antenna: 2 * side, look: side, armL: i % 2 ? "down" : "out", armR: i % 2 ? "out" : "down" });
    yield;
  }
  yield* settle(pip, w);
  yield* pose(pip, w, { eyes: "happy", mouth: "smile" }, 6);
  ctl.rate = 0.3;
  // admire the white ground, then a happy hop
  yield* pose(pip, w, { eyes: "open", mouth: null, lookY: 1, look: -2 }, 8);
  yield* pose(pip, w, { look: 2 }, 8);
  yield* pose(pip, w, { look: 0, lookY: 0 }, 2);
  ctl.rate = 0;
  yield* happyHops(pip, w, { times: 1 });
  yield* wait(pip, w, 12);
}

function startSnow(w) {
  const ctl = new SnowCtl(w);
  begin(w, ctl, snowScript, [new SnowCap(ctl)]);
}

// ================================================================== FIREFLIES

class FireflyCtl extends Ctl {
  constructor(w) {
    super(w);
    this.flies = [];
    this.mode = "wander";
  }
  end() {
    if (this.ending) return;
    super.end();
    this.scatter();
  }
  spawn(x, y) {
    const w = this.w;
    const f = { x, y, vx: 0, vy: 0, tx: x, ty: y, flashes: [], nextIdle: this.t + 8 + Math.floor(w.rand() * 20), i: this.flies.length };
    this.flies.push(f);
    return f;
  }
  flash(f, n = 1, delay = 0, every = 6) {
    for (let i = 0; i < n; i++) f.flashes.push(this.t + delay + i * every);
    f.nextIdle = Math.max(f.nextIdle, this.t + delay + n * every + 14);
  }
  lit(f) {
    for (const s of f.flashes) {
      const a = this.t - s;
      if (a >= 0 && a < 2) return "O";
      if (a === 2) return "q";
    }
    return this.mode === "wander" ? null : "q";
  }
  scatter() {
    this.mode = "scatter";
    for (const f of this.flies) {
      const side = f.x < this.w.pip.x ? -1 : 1;
      f.tx = f.x + side * (30 + this.w.rand() * 40);
      f.ty = -12;
    }
  }
  step(w) {
    super.step(w);
    for (const [t, fn] of this.later ?? []) if (this.t === t) fn();
    const box = pipBox(w);
    const bx = bulbX(w, box) + 0.5;
    this.flies.forEach((f, i) => {
      if (this.mode === "wander") {
        if (Math.abs(f.tx - f.x) + Math.abs(f.ty - f.y) < 2) {
          const ox = f.home ? f.home.x : f.x;
          const oy = f.home ? f.home.y : f.y;
          const r = f.home ? 8 : 30;
          f.tx = clamp(ox + (w.rand() - 0.5) * r, 6, w.W - 6);
          f.ty = clamp(oy + (w.rand() - 0.5) * (f.home ? 4 : 8), 4, w.ground - 6);
        }
        if (this.t >= f.nextIdle) this.flash(f, 1, 0);
      } else if (this.mode === "gather") {
        const a = this.t * 0.09 + (i * 2 * Math.PI) / this.flies.length;
        f.tx = bx + Math.cos(a) * 15;
        f.ty = box.top + 3 + Math.sin(a) * 5;
      } else if (this.mode === "land" && i === this.lander) {
        f.tx = bx;
        f.ty = box.top - 2;
      } else if (this.mode === "land") {
        const a = this.t * 0.09 + (i * 2 * Math.PI) / this.flies.length;
        f.tx = bx + Math.cos(a) * 17;
        f.ty = box.top + 3 + Math.sin(a) * 6;
      }
      const k = this.mode === "scatter" ? 0.06 : this.mode === "wander" ? 0.03 : 0.18;
      const max = this.mode === "scatter" ? 1.4 : this.mode === "wander" ? 0.35 : 0.9;
      f.vx = clamp(f.vx * 0.8 + (f.tx - f.x) * k, -max, max);
      f.vy = clamp(f.vy * 0.8 + (f.ty - f.y) * k, -max / 2, max / 2);
      if (this.mode === "land" && i === this.lander && Math.abs(f.tx - f.x) < 1 && Math.abs(f.ty - f.y) < 1) {
        f.x = f.tx;
        f.y = f.ty;
        f.vx = f.vy = 0;
        f.landed = true;
      }
      f.x += f.vx;
      f.y += f.vy;
      if (this.mode === "scatter" && this.t % 7 === i % 7) f.flashes.push(this.t);
    });
    if (this.mode === "scatter") this.flies = this.flies.filter((f) => f.y > -4 && f.x > -4 && f.x < w.W + 4);
    if (this.ending) {
      if (!this.flies.length && this.level === 0) this.dead = true;
    }
  }
  draw(c, w) {
    tintGround(c, w, this.level);
    // lit: a bright half-cell over a dim one; dim: a half-cell ember
    for (const f of this.flies) {
      const tok = this.lit(f);
      if (!tok) continue;
      const x = Math.floor(f.x / 2) * 2;
      const y = Math.round(f.y);
      const rows = tok === "O" ? ["OO", "qq"] : ["qq"];
      blitBehind(c, rows, x, y);
    }
  }
}

function* fireflyScript(pip, w, ctl) {
  const s = pip.state;
  const dir = pip.x < w.W / 2 ? 1 : -1;
  pip.facing = dir;
  const lookAt = (f) => clamp(Math.round((f.x - pip.x) / 6), -2, 2);
  ctl.goal = 1;
  ctl.later = [[24, () => (ctl.goal = 2)]];
  // fireflies wake up around the stage
  const lead = ctl.spawn(pip.x + dir * 24, 9);
  lead.home = { x: pip.x + dir * 22, y: 9 };
  lead.nextIdle = ctl.t + 14;
  for (const [dx, y] of [[-40, 8], [44, 6], [-18, 5], [60, 11]]) ctl.spawn(clamp(pip.x + dx * dir, 6, w.W - 6), y);
  yield* hold(pip, w, 14, { breathe: 32 });
  // the first blink: the eyes find it, the antenna leans toward it
  yield* until(pip, w, () => ctl.lit(lead) === "O", 30);
  yield;
  yield* pose(pip, w, { look: lookAt(lead), lookY: -1, eyes: "open" }, 6);
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* pose(pip, w, { eyes: "open", antenna: 2 * dir }, 4);
  // the call: two flashes of the bulb
  yield* pose(pip, w, { body: "b", antenna: 0 }, 3);
  for (let k = 0; k < 2; k++) {
    yield* pose(pip, w, { bulb: "glow", body: "n" }, 2);
    yield* pose(pip, w, { bulb: "on" }, 4);
  }
  ctl.flash(lead, 2, 6);
  yield* hold(pip, w, 6);
  for (let k = 0; k < 12; k++) yield* pose(pip, w, { look: lookAt(lead) }, 1);
  yield* pose(pip, w, { eyes: "wide" }, 3);
  yield* pose(pip, w, { eyes: "happy", body: "s1", legLen: 1 }, 1);
  yield* pose(pip, w, { body: "n", legLen: 2 }, 4);
  // three flashes; everybody answers at once
  yield* pose(pip, w, { body: "b", eyes: "open" }, 3);
  for (let k = 0; k < 3; k++) {
    yield* pose(pip, w, { bulb: "glow", body: "n" }, 2);
    yield* pose(pip, w, { bulb: "on" }, 4);
  }
  for (const f of ctl.flies) ctl.flash(f, 3, 6);
  yield* pose(pip, w, { look: 0, lookY: -1 }, 6);
  yield* pose(pip, w, { eyes: "wide", look: -2 }, 6);
  yield* pose(pip, w, { look: 2 }, 6);
  yield* pose(pip, w, { look: 0, lookY: 0 }, 2);
  yield* happyHops(pip, w, { times: 1 });
  // they gather and circle the bulb, pulsing with it
  ctl.mode = "gather";
  for (let k = 0; k < 60; k++) {
    const f = ctl.flies[0];
    Object.assign(s, { look: lookAt(f), lookY: f.y < pipBox(w).bodyTop ? -1 : 0, eyes: "open", mouth: "smile" });
    s.bulb = k % 12 < 2 ? "glow" : "on";
    if (k % 12 === 0) for (const g of ctl.flies) ctl.flash(g, 1, 0);
    yield;
  }
  // one lands on the bulb
  ctl.mode = "land";
  ctl.lander = 0;
  yield* until(pip, w, () => ctl.flies[0]?.landed, 40);
  yield* pose(pip, w, { look: 0, lookY: -1, eyes: "look_up", blush: false, mouth: null }, 8);
  ctl.flash(ctl.flies[0], 1, 0);
  yield* wait(pip, w, 4);
  yield* pose(pip, w, { bulb: "glow" }, 2);
  yield* pose(pip, w, { bulb: "on", eyes: "happy", blush: true }, 8);
  // try to cup it: crouch, reach up - and it's gone
  yield* pose(pip, w, { body: "s1", legLen: 1, armL: "back", armR: "back", eyes: "open", blush: false }, 3);
  Object.assign(s, { body: "t2", legLen: 3, armL: "up", armR: "up", eyes: "wide" });
  ctl.scatter();
  yield* wait(pip, w, 4);
  yield* pose(pip, w, { body: "n", legLen: 2, armL: "down", armR: "down", eyes: "look_up" }, 6);
  for (let k = 0; k < 16; k++) {
    const f = ctl.flies[0];
    if (f) s.look = lookAt(f);
    yield;
  }
  // wave them goodbye
  yield* pose(pip, w, { eyes: "happy", lookY: 0, mouth: "smile" }, 2);
  for (let k = 0; k < 2; k++) {
    yield* pose(pip, w, { armR: "wave" }, 4);
    yield* pose(pip, w, { armR: "up" }, 4);
  }
  yield* settle(pip, w);
  ctl.goal = 0;
  yield* wait(pip, w, 6);
}

function startFireflies(w) {
  begin(w, new FireflyCtl(w), fireflyScript);
}

// ------------------------------------------------------------------ acts

export const ACTS = {
  rain: {
    title: "Rain",
    description: "Clouds roll in, a single drop hits the bulb (flinch, look up), the umbrella opens in steps and drops bounce off it, a splash-down hop into the puddle, then the shake-off.",
    ticks: 306,
    setup(w) {
      w.pip.x = 44;
    },
    at: at([[0, startRain]]),
    run: startRain,
  },
  night: {
    title: "Night",
    description: "The ground dims and the eyes find each new star; a squashed yawn, the bulb stutters off, he sits and nods off with drifting z's, then the bulb flickers back and he wakes with a start.",
    ticks: 356,
    setup(w) {
      w.pip.x = 52;
    },
    at: at([[0, startNight]]),
    run: startNight,
  },
  snow: {
    title: "Snow",
    description: "The warm bulb melts the first flake, then a cap of snow builds on his head while he stands still; a squash and a pop throw the whole cap off.",
    ticks: 254,
    setup(w) {
      w.pip.x = 64;
    },
    at: at([[0, startSnow]]),
    run: startSnow,
  },
  fireflies: {
    title: "Fireflies",
    description: "Call and response at dusk: Pip flashes his bulb twice, one firefly answers, three times and they all answer; they circle him, one lands on the bulb, and they scatter when he reaches.",
    ticks: 282,
    setup(w) {
      w.pip.x = 56;
    },
    at: at([[0, startFireflies]]),
    run: startFireflies,
  },
};

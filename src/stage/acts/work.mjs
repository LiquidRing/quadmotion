// Act group "work": Pip reacting to the agent's work (tool calls, success,
// errors, effort, ideas). See acts/basics.mjs for the act contract.
//
// Every act uses the same grammar: eyes lead, an anticipation opposite to the
// action, a release with a big silhouette change, a held contact where the
// prop reacts on the same tick, follow-through, a settle back to neutral.

import { walkTo, wait, pose, settle } from "../world.mjs";
import { EYES, MOUTHS, ARMS, BODY_SIZES } from "../pip.mjs";
import { Crate } from "../props.mjs";

const snap = (x) => Math.round(x / 2) * 2;
const roomDir = (w) => (w.pip.x < w.W / 2 ? 1 : -1);
const halfW = (body) => BODY_SIZES[body][0] / 2;
/** A 2-wide pixel pair at Pip-relative offset o (even), mirrored with facing. */
const pairX = (ax, dir, o) => (dir > 0 ? ax + o : ax - 2 - o);
/** True when the 2x2 cell holding (x, y) is still empty. */
const cellFree = (c, x, y) => {
  const cx = x & ~1;
  const cy = y & ~1;
  return !c.get(cx, cy) && !c.get(cx + 1, cy) && !c.get(cx, cy + 1) && !c.get(cx + 1, cy + 1);
};

// ------------------------------------------------------------ puppet parts
// Names are prefixed "wk" so they never clash with other groups' entries.

// Pip lying flat on his face (width a multiple of 4, like the others).
BODY_SIZES.wkFlat = [32, 5];

EYES.wkSqueeze = ["..", "##"]; // shut tight with effort
EYES.wkSteely = ["##", "##"]; // determined, a bit lower and narrower than open
MOUTHS.wkGrit = ["######", "#.##.#"];

// Seated typing (body "n" only). armR is always the near (facing-side) arm.
ARMS.wkTap = [[0, 0], [2, 0], [2, 1], [4, 1], [4, 2]]; // near hand down on a key
ARMS.wkHover = [[0, 0], [2, 0], [2, -1], [4, -1], [4, 0]]; // near hand lifted
// The far arm reaches round the front of the body: its points are given with
// dx <= -(bodyWidth + 2) so only the part in front of the torso is drawn.
ARMS.wkFarTap = [[-30, 1], [-32, 1], [-32, 2], [-34, 2]];
ARMS.wkFarHover = [[-30, 0], [-32, 0], [-32, -1], [-34, -1], [-34, 0]];
// Standing.
ARMS.wkScratch = [[0, 0], [2, -1], [2, -2], [2, -3], [0, -4]];
ARMS.wkScratch2 = [[0, 0], [2, -1], [2, -2], [0, -2]];
ARMS.wkPoint = [[0, 0], [2, -1], [4, -2], [6, -2]];
ARMS.wkFist = [[0, 0], [2, 0], [2, -1], [2, -2]];
ARMS.wkBrush = [[0, 0], [2, 1], [4, 1]];
ARMS.wkBrush2 = [[0, 0], [2, 0], [4, -1]];

export const PALETTE = {
  e: { name: "sweat", rgb: [120, 196, 255], ansi16: 96 },
  g: { name: "pebble", rgb: [150, 150, 164], ansi16: 37 },
  j: { name: "idea-ray", rgb: [255, 238, 150], ansi16: 93 },
};

// ------------------------------------------------------------------ props

/** Laptop on the floor in front of a seated Pip. ax = Pip's x, dir = facing. */
class WorkLaptop {
  constructor(ax, dir) {
    this.kind = "wk-laptop";
    this.ax = ax;
    this.dir = dir;
    this.layer = "front";
    this.lines = [6, 4, 0]; // code line lengths, last one is being typed
    this.key = null; // { o, t } lit key under a hand
    this.progress = null; // 0..8 sub-pixels of the bar
    this.done = 0; // ticks the check mark has been shown
  }
  typeChar(w) {
    const k = this.lines.length - 1;
    this.lines[k] += 2;
    if (this.lines[k] >= 2 + 2 * Math.floor(w.rand() * 4)) {
      this.lines.push(0);
      if (this.lines.length > 3) this.lines.shift();
    }
  }
  press(o, t = 2) {
    this.key = { o, t };
  }
  step() {
    if (this.key && --this.key.t <= 0) this.key = null;
    if (this.done) this.done++;
  }
  draw(c, w) {
    const g = w.ground;
    const { ax, dir } = this;
    const px = (o, y, tok) => {
      const x = pairX(ax, dir, o);
      c.set(x, y, tok);
      c.set(x + 1, y, tok);
    };
    // deck and base
    for (let o = 14; o < 36; o += 2) {
      const lit = this.key && this.key.o === o;
      px(o, g - 2, lit ? "y" : "L");
      px(o, g - 1, lit ? "y" : "K");
    }
    // screen: 12 x 8, 2-px border so every cell holds two colors at most
    const sl = dir > 0 ? ax + 24 : ax - 36;
    const top = g - 10;
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 12; i++) {
        const edge = j < 2 || i < 2 || i >= 10;
        c.set(sl + i, top + j, edge ? "L" : "l");
      }
    }
    const inner = sl + 2;
    if (this.done) {
      const tick = ["......##", ".....##.", "##..##..", ".####...", "..##....", "........"];
      const flash = this.done < 3;
      tick.forEach((row, j) => [...row].forEach((ch, i) => c.set(inner + i, top + 2 + j, flash ? (ch === "#" ? "l" : "y") : ch === "#" ? "y" : "l")));
    } else if (this.progress !== null) {
      for (let i = 0; i < 8; i++) c.set(inner + i, top + 4, i < this.progress ? "y" : "L");
      for (let i = 0; i < 8; i++) c.set(inner + i, top + 5, i < this.progress ? "y" : "L");
    } else {
      this.lines.forEach((len, k) => {
        for (let i = 0; i < len; i++) c.set(inner + i, top + 2 + 2 * k, "y");
      });
    }
  }
}

/** A pebble that catches a foot. */
class Pebble {
  constructor(x) {
    this.kind = "wk-pebble";
    this.x = x;
    this.wiggle = 0;
  }
  step() {
    if (this.wiggle > 0) this.wiggle--;
  }
  draw(c, w) {
    const y = w.ground - 2 - (this.wiggle % 2);
    for (let i = 0; i < 4; i++) c.set(this.x + i, y + 1, "g");
    c.set(this.x + 1, y, "g");
    c.set(this.x + 2, y, "g");
  }
}

/** Stars circling above Pip's head after a fall. */
class DizzyStars {
  constructor(pip, life) {
    this.kind = "wk-stars";
    this.pip = pip;
    this.life = life;
    this.t = 0;
    this.layer = "front";
  }
  step() {
    this.t++;
    if (--this.life <= 0) this.dead = true;
  }
  draw(c) {
    const box = this.pip.box;
    if (!box) return;
    const n = this.life < 6 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const a = this.t * 0.45 + (k * 2 * Math.PI) / 3;
      const x = snap(this.pip.x - 1 + Math.cos(a) * 10);
      const y = Math.round(box.top - 3 + Math.sin(a) * 1.6);
      const tok = Math.sin(a) > 0 ? "Y" : "s";
      if (y < 0 || !cellFree(c, x, y)) continue;
      c.set(x, y, tok);
      c.set(x + 1, y, tok);
    }
  }
}

/** Light rays bursting from Pip's bulb. */
class IdeaRays {
  constructor(pip, life = 8) {
    this.kind = "wk-rays";
    this.pip = pip;
    this.life = life;
    this.age = 0;
    this.layer = "front";
  }
  step() {
    this.age++;
    if (this.age >= this.life) this.dead = true;
  }
  draw(c) {
    const box = this.pip.box;
    if (!box) return;
    const cx = this.pip.x - 1;
    const cy = box.top + 1;
    const r = 4 + this.age;
    for (let k = 0; k < 8; k++) {
      if (this.age > 4 && k % 2) continue;
      const a = (k * Math.PI) / 4;
      for (const d of [r, r + 2]) {
        const x = snap(cx + Math.cos(a) * d * 1.4);
        const y = Math.round(cy + Math.sin(a) * d * 0.6);
        if (y < 0 || !cellFree(c, x, y)) continue;
        c.set(x, y, "j");
        c.set(x + 1, y, "j");
      }
    }
  }
}

/** Keeps confetti fluttering: terminal velocity, sideways sway. */
class ConfettiWind {
  constructor(life = 70) {
    this.kind = "wk-wind";
    this.life = life;
    this.t = 0;
  }
  step(w) {
    this.t++;
    for (const q of w.particles) {
      if (!q.confetti) continue;
      if (q.y >= w.ground - 1.5 && q.vy >= 0) {
        q.vx *= 0.5;
        continue;
      }
      if (q.vy > 0.4) q.vy = 0.4;
      q.vx = q.vx * 0.9 + Math.sin(this.t * 0.4 + q.phase) * 0.2;
    }
    if (--this.life <= 0) this.dead = true;
  }
  draw() {}
}

/** A crate twice as heavy: tall, cell-aligned, no one-sided shake. */
class HeavyCrate extends Crate {
  constructor(x) {
    super(x, { w: 12, h: 10 });
    this.kind = "wk-crate";
  }
  draw(c, w) {
    const y0 = w.ground - this.h;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const edge = j === 0 || j === this.h - 1 || i < 2 || i >= this.w - 2;
        const plank = j === 4 || j === 5;
        c.set(this.x + i, y0 + j, edge || plank ? "c" : "C");
      }
    }
  }
}

function confetti(w, x, y, n = 28) {
  const toks = ["f", "F", "h"];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    w.particles.push({
      x: x + side * (8 + w.rand() * 8),
      y: y - w.rand() * 2,
      vx: side * (0.2 + w.rand() * 1.9),
      vy: -(0.9 + w.rand() * 0.8),
      g: 0.1,
      life: 45 + Math.floor(w.rand() * 25),
      tok: toks[i % 3],
      confetti: true,
      phase: w.rand() * 6.28,
    });
  }
}

/** Dust on both sides of a wide (squashed or flat) body, outside its cells. */
function wideDust(w, x, half = 16, n = 3) {
  w.spray(x - half, w.ground - 1, n, { tok: "d", dir: -1, speed: 0.6, up: 0.3, life: 6 });
  w.spray(x + half, w.ground - 1, n, { tok: "d", dir: 1, speed: 0.6, up: 0.3, life: 6 });
}

/** Remove every prop this group placed, so acts chain in the playground. */
const clearProps = (w) => {
  w.props = w.props.filter((p) => !String(p.kind).startsWith("wk-"));
};

// ------------------------------------------------------------- actions

/** Typing at a laptop on the floor: sit, type, think, burst, compile, win. */
function* typing(pip, w, lap) {
  const s = pip.state;
  const dir = lap.dir;
  // eyes lead
  yield* pose(pip, w, { look: 2 }, 4);
  yield* pose(pip, w, { eyes: "blink" }, 1);
  yield* pose(pip, w, { eyes: "open" }, 2);
  yield* walkTo(pip, w, lap.ax, { speed: 0.7 });
  pip.facing = dir;
  // sit down: crouch, plop with a squash and a poof
  yield* pose(pip, w, { body: "s1", legLen: 1, look: 1 }, 2);
  Object.assign(s, { body: "s2", legLen: 0, armL: "out", armR: "out" });
  wideDust(w, pip.x, 20, 2);
  yield* wait(pip, w, 2);
  yield* pose(pip, w, { body: "n", legLen: 0, armL: "down", armR: "down", antenna: 2 }, 2);
  yield* pose(pip, w, { antenna: 0, look: 2, lookY: 1 }, 3);
  // hands up to the keys
  yield* pose(pip, w, { armR: "wkHover", armL: "wkFarHover" }, 3);

  const tap = function* (k, hold, lift) {
    const near = k % 2 === 0;
    s.armR = near ? "wkTap" : "wkHover";
    s.armL = near ? "wkFarHover" : "wkFarTap";
    lap.press(near ? 16 : 20, hold);
    lap.typeChar(w);
    s.bulb = k % 4 < 2 ? "glow" : "on";
    yield* wait(pip, w, hold);
    if (lift) {
      Object.assign(s, { armR: "wkHover", armL: "wkFarHover" });
      yield* wait(pip, w, lift);
    }
  };
  for (let k = 0; k < 8; k++) yield* tap(k, 2, 1);
  // stop to think: hands lift, eyes up and away, "…", bulb pulses slowly
  Object.assign(s, { armR: "wkHover", armL: "wkFarHover", bulb: "on" });
  yield* wait(pip, w, 2);
  Object.assign(s, { eyes: "look_up", look: -1, lookY: -1, antenna: -2 });
  w.mark("…", 16, { dx: -dir * 2 });
  for (let i = 0; i < 4; i++) {
    s.bulb = i % 2 ? "on" : "off";
    if (i === 2) s.antenna = 0;
    yield* wait(pip, w, 3);
  }
  // got it: blink, glow, back to the screen
  yield* pose(pip, w, { eyes: "blink", bulb: "glow" }, 1);
  yield* pose(pip, w, { eyes: "open", look: 2, lookY: 1 }, 2);
  for (let k = 0; k < 12; k++) yield* tap(k, 1, 1);
  // compile: hands hover, the bar fills while he watches
  Object.assign(s, { armR: "wkHover", armL: "wkFarHover", bulb: "on", lookY: 0 });
  lap.progress = 0;
  for (let i = 1; i <= 8; i++) {
    yield* wait(pip, w, 2);
    lap.progress = i;
    s.bulb = i % 2 ? "glow" : "on";
  }
  yield* wait(pip, w, 2);
  // done: the screen flips to a check on the same tick, Pip reacts instantly
  lap.done = 1;
  lap.progress = null;
  w.mark("✓", 20, { dx: dir * 14, row: 3, fg: "y" });
  yield* pose(pip, w, { eyes: "wide", look: 2, lookY: -1, armR: "down", armL: "down", bulb: "glow" }, 2);
  // victory: tiny crouch, arms up
  yield* pose(pip, w, { body: "s2", eyes: "happy", look: -dir, lookY: 0, armR: "out", armL: "out" }, 2);
  Object.assign(s, { body: "t1", armR: "up", armL: "up", blush: true, mouth: "smile", antenna: -2 });
  yield* wait(pip, w, 2);
  yield* pose(pip, w, { antenna: 2 }, 2);
  yield* pose(pip, w, { antenna: 0 }, 6);
  // stand back up
  yield* pose(pip, w, { body: "n", armR: "down", armL: "down", blush: false, mouth: null, bulb: "on", look: 0 }, 2);
  yield* pose(pip, w, { body: "s1", legLen: 1 }, 2);
  yield* settle(pip, w);
}

/** End of a turn: crouch, confetti burst, a big jump, squash landing, a bow. */
function* success(pip, w) {
  const s = pip.state;
  const dir = pip.facing;
  // look up first
  yield* pose(pip, w, { lookY: -1, look: 0 }, 3);
  // anticipation
  Object.assign(s, { body: "s1", legLen: 1, armL: "back", armR: "back", lookY: 0, eyes: "closed" });
  wideDust(w, pip.x, 16, 2);
  yield;
  yield* pose(pip, w, { body: "s2", legLen: 0 }, 2);
  // release: stretched, arms up, confetti on the same tick
  confetti(w, pip.x, (pip.box?.bodyTop ?? 12) - 2);
  w.props.push(new ConfettiWind(80));
  Object.assign(s, { body: "t2", legLen: 3, armL: "up", armR: "up", eyes: "happy", antenna: 0 });
  const n = 11;
  const height = 8;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    s.y = Math.round(4 * height * t * (1 - t));
    if (t > 0.2 && t < 0.7) Object.assign(s, { body: "n", legLen: 1, antenna: 0 });
    else if (t >= 0.7) Object.assign(s, { body: "t1", legLen: 2, antenna: -2 });
    yield;
  }
  // land: squash held, blush, dust
  // look = -dir puts the eyes on even columns in the wide/tall bodies, so
  // blush and mouth never share a cell with an eye
  Object.assign(s, { y: 0, body: "s2", legLen: 0, armL: "out", armR: "out", blush: true, mouth: "smile", antenna: 2, look: -dir });
  wideDust(w, pip.x, 20);
  yield* wait(pip, w, 3);
  yield* pose(pip, w, { body: "s1", legLen: 1, antenna: 0 }, 1);
  yield* pose(pip, w, { body: "n", legLen: 2, armL: "down", armR: "down", look: 0 }, 4);
  // bow: rise a little, then dip with eyes closed, antenna forward
  yield* pose(pip, w, { body: "t1", eyes: "open", mouth: null, blush: false, look: -dir }, 2);
  Object.assign(s, { body: "s1", legLen: 1, eyes: "closed", lookY: 1, antenna: 2 * dir, armL: "down", armR: "down" });
  yield* wait(pip, w, 6);
  yield* pose(pip, w, { body: "t1", legLen: 2, lookY: 0, eyes: "happy", antenna: -2 * dir }, 2);
  yield* pose(pip, w, { body: "n", antenna: 0, look: 0, blush: true }, 6);
  yield* settle(pip, w);
}

/** An error: walking, a foot catches a pebble, a fall, dizzy, getting up. */
function* oops(pip, w, pebble) {
  const s = pip.state;
  const dir = pip.facing;
  // walk until a swinging foot's toe reaches the pebble
  const gen = walkTo(pip, w, pip.x + dir * 80, { speed: 0.8 });
  let caught = -1;
  for (;;) {
    const r = gen.next();
    if (r.done) break;
    const feet = pip.feet ?? [];
    caught = feet.findIndex((f) => !f.planted && (dir > 0 ? f.x + 4 >= pebble.x : f.x - 2 <= pebble.x + 4));
    if (caught >= 0) break;
    yield;
  }
  if (caught < 0) return yield* settle(pip, w);
  const other = 1 - caught;
  const footX = dir > 0 ? pebble.x - 4 : pebble.x + 6;
  let feet = pip.feet.map((f, k) => (k === caught ? { x: footX, lift: 0, planted: true } : { x: snap(f.x), lift: 0, planted: true }));
  pip.feet = feet;
  // catch: the toe hits the pebble, it wiggles, the body keeps going
  pebble.wiggle = 3;
  Object.assign(s, { eyes: "wide", antenna: -2 * dir, armL: "back", armR: "back", legLen: 2, body: "n" });
  w.mark("!", 8, { dx: 0 });
  pip.x += dir * 2;
  yield;
  pip.x += dir * 2;
  yield;
  // pitch forward: the other foot comes off the ground, arms flail
  feet = feet.map((f, k) => (k === other ? { x: f.x + dir * 2, lift: 2, planted: false } : f));
  pip.feet = feet;
  Object.assign(s, { body: "t1", legLen: 3, armL: "up", armR: "up", look: 2 });
  pip.x += dir * 3;
  yield;
  feet = feet.map((f, k) => (k === other ? { x: f.x + dir * 2, lift: 1, planted: false } : f));
  pip.feet = feet;
  Object.assign(s, { body: "n", legLen: 2, armL: "out", armR: "reach" });
  pip.x += dir * 4;
  yield;
  Object.assign(s, { body: "s1", legLen: 1, armL: "out", armR: "out" });
  pip.x += dir * 4;
  yield;
  // slam: flat on his face, x_x, bulb knocked out
  pip.x = snap(pip.x + dir * 4);
  pip.feet = [{ x: pip.x - 6, lift: 0, planted: false }, { x: pip.x + 4, lift: 0, planted: false }];
  Object.assign(s, { body: "wkFlat", legLen: 0, eyes: "x", armL: "out", armR: "out", antenna: 2 * dir, look: 0, bulb: "off", mouth: null });
  wideDust(w, pip.x, 18, 4);
  yield;
  // skid a little further on his face
  for (const dx of [4, 2]) {
    pip.x += dir * dx;
    pip.feet = [{ x: pip.x - 6, lift: 0, planted: false }, { x: pip.x + 4, lift: 0, planted: false }];
    w.spray(pip.x + dir * 16, w.ground - 1, 1, { dir, speed: 0.5, up: 0.3, life: 5 });
    yield;
  }
  yield* pose(pip, w, { body: "s2", antenna: -2 * dir, look: -dir }, 1);
  yield* pose(pip, w, { body: "wkFlat", antenna: 0, look: 0 }, 1);
  w.props.push(new DizzyStars(pip, 34));
  yield* wait(pip, w, 14);
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* pose(pip, w, { eyes: "x" }, 4);
  // get up in stages: push up on the arms, kneel, stand
  yield* pose(pip, w, { body: "s2", eyes: "wkSqueeze", armL: "down", armR: "down", look: -dir }, 4);
  pip.feet = null;
  yield* pose(pip, w, { body: "s1", legLen: 1, eyes: "sleepy", bulb: "on" }, 2);
  yield* pose(pip, w, { bulb: "off" }, 1);
  yield* pose(pip, w, { bulb: "on" }, 2);
  yield* pose(pip, w, { body: "n", legLen: 2, eyes: "open", look: 0 }, 3);
  // shake it off: the body wobbles over planted feet, antenna lags behind
  const x0 = pip.x;
  pip.feet = [{ x: x0 - 6, lift: 0, planted: true }, { x: x0 + 4, lift: 0, planted: true }];
  Object.assign(s, { eyes: "closed", armL: "out", armR: "out" });
  for (const [k, off] of [2, 0, -2, 0, 2, 0, -2, 0].entries()) {
    pip.x = x0 + off;
    s.antenna = -off;
    if (off) w.spray(pip.x + Math.sign(off) * 14, (pip.box?.bodyTop ?? 12) + 2, 1, { dir: Math.sign(off), speed: 0.6, up: 0.4, life: 5 });
    if (k === 4) Object.assign(s, { armL: "down", armR: "down" });
    yield;
  }
  pip.feet = null;
  // determined: fist up, steely eyes
  yield* pose(pip, w, { eyes: "open", antenna: 0, look: 0, armL: "down", armR: "down" }, 2);
  yield* pose(pip, w, { body: "s1", legLen: 1, armR: "back" }, 2);
  Object.assign(s, { body: "t1", legLen: 2, eyes: "wkSteely", mouth: "flat", armR: "wkFist", look: 2, bulb: "glow" });
  yield* wait(pip, w, 3);
  yield* pose(pip, w, { body: "n", bulb: "on" }, 8);
  yield* settle(pip, w);
}

/** Push a heavy crate: lean in, strain, slide in small steps, a final shove. */
function* pushCrate(pip, w, crate) {
  const s = pip.state;
  const dir = pip.facing;
  const cw = crate.w;
  // where Pip stands so his "out" hands touch the crate in the s1 pose
  const contactX = () => (dir > 0 ? crate.x - halfW("s1") - 6 : crate.x + cw + halfW("s1") + 6);
  // eyes lead
  yield* pose(pip, w, { look: 2 }, 4);
  yield* pose(pip, w, { eyes: "blink" }, 1);
  yield* pose(pip, w, { eyes: "open" }, 2);
  yield* walkTo(pip, w, contactX(), { speed: 0.8 });
  pip.facing = dir;
  yield* pose(pip, w, { look: 2, lookY: -1 }, 3);
  // anticipation: lean back, arms back
  yield* pose(pip, w, { body: "t1", legLen: 2, armL: "back", armR: "back", eyes: "wkSteely", lookY: 0 }, 3);
  let feet = [{ x: pip.x - 6, lift: 0, planted: true }, { x: pip.x + 4, lift: 0, planted: true }];
  pip.feet = feet;
  // lean in: hands on the crate
  Object.assign(s, { body: "s1", legLen: 1, armR: "out", armL: "back", eyes: "wkSqueeze", mouth: "wkGrit", antenna: -2 * dir });
  w.spray(crate.x + (dir > 0 ? 0 : cw), w.ground - 1, 2, { dir: -dir, speed: 0.3, up: 0.2, life: 4 });
  yield* wait(pip, w, 3);
  const strain = function* (n) {
    for (let i = 0; i < n; i++) {
      s.antenna = i % 2 ? -2 * dir : 0;
      s.bulb = i % 2 ? "glow" : "on";
      yield;
    }
    s.bulb = "on";
  };
  const sweat = () =>
    w.particles.push({ x: pip.x - dir * 10, y: (pip.box?.bodyTop ?? 14) + 1, vx: -dir * 0.5, vy: -0.7, g: 0.14, life: 10, tok: "e" });
  const slide = function* (dx) {
    crate.x += dir * dx;
    pip.x += dir * dx;
    w.spray(dir > 0 ? crate.x + cw : crate.x, w.ground - 1, 2, { dir, speed: 0.4, up: 0.2, life: 5 });
    w.spray(dir > 0 ? crate.x : crate.x + cw, w.ground - 1, 1, { dir: -dir, speed: 0.3, up: 0.15, life: 4 });
    s.antenna = -2 * dir;
    yield* wait(pip, w, 2);
  };
  const step = function* (k) {
    feet = feet.map((f, j) => (j === k ? { x: f.x + dir * 2, lift: 1, planted: false } : f));
    pip.feet = feet;
    yield;
    feet = feet.map((f, j) => (j === k ? { x: f.x + dir * 2, lift: 0, planted: true } : f));
    pip.feet = feet;
    yield;
  };
  const back = dir > 0 ? 0 : 1;
  // room left in front of the crate (keep 2 px from the stage edge)
  const room = () => (dir > 0 ? w.W - 2 - (crate.x + cw) : crate.x - 2);
  for (let cycle = 0; cycle < 3 && room() >= 4 + 12; cycle++) {
    yield* strain(cycle === 0 ? 5 : 3);
    if (cycle !== 1) sweat();
    yield* slide(2);
    yield* strain(2);
    yield* slide(2);
    s.antenna = 0;
    yield* step(back);
    yield* step(1 - back);
  }
  // final shove: draw back, then drive through
  s.eyes = "wkSteely";
  yield* strain(2);
  pip.x -= dir * 2;
  Object.assign(s, { armR: "hold", antenna: 2 * dir, mouth: "wkGrit" });
  yield* wait(pip, w, 3);
  // contact: hands back on the crate and Pip drives it 4 px with him
  pip.x += dir * 2;
  const first = Math.min(4, room());
  crate.x += dir * first;
  pip.x += dir * first;
  Object.assign(s, { armR: "out", armL: "back", eyes: "wide", mouth: "o", antenna: -2 * dir });
  w.spray(dir > 0 ? crate.x + cw : crate.x, w.ground - 1, 3, { dir, speed: 0.6, up: 0.25, life: 5 });
  yield* wait(pip, w, 2);
  // release: the crate slides on alone, Pip stretches after it
  Object.assign(s, { body: "t1", legLen: 2 });
  for (const want of [4, 4, 2, 2, 2]) {
    const dx = Math.min(want, room());
    if (dx <= 0) break;
    crate.x += dir * dx;
    w.spray(dir > 0 ? crate.x + cw : crate.x, w.ground - 1, 2, { dir, speed: 0.5, up: 0.2, life: 5 });
    if (dx === 4) w.spray(dir > 0 ? crate.x : crate.x + cw, w.ground - 1, 1, { dir: -dir, speed: 0.4, up: 0.2, life: 4 });
    yield;
  }
  // catch his balance: body back over the feet, feet home
  Object.assign(s, { body: "n", armR: "down", armL: "down", eyes: "open", mouth: null, antenna: 2 * dir });
  yield;
  yield* step(back);
  s.antenna = 0;
  yield* step(1 - back);
  pip.feet = null;
  yield* pose(pip, w, { look: 2 }, 3);
  // brush off his hands
  yield* pose(pip, w, { eyes: "happy", mouth: "smile", look: 0 }, 2);
  for (let i = 0; i < 4; i++) {
    s.armR = i % 2 ? "wkBrush2" : "wkBrush";
    s.armL = i % 2 ? "down" : "out";
    if (i % 2 === 0) w.spray(pip.x + dir * 18, (pip.box?.bodyTop ?? 12) + 4, 1, { dir, speed: 0.3, up: 0.3, g: 0.05, life: 5 });
    yield* wait(pip, w, 2);
  }
  yield* pose(pip, w, { armR: "down", armL: "down" }, 4);
  yield* settle(pip, w);
}

/** Thinking hard: scratch, the bulb flickers out, then flashes with an idea. */
function* eureka(pip, w) {
  const s = pip.state;
  const dir = pip.facing;
  // look up, scratch the head, "?"
  yield* pose(pip, w, { eyes: "look_up", lookY: -1, look: 1 }, 3);
  w.mark("?", 18, { dx: dir * 3 });
  const bulbs = ["on", "on", "off", "on", "off", "off"];
  for (let i = 0; i < 6; i++) {
    s.armR = i % 2 ? "wkScratch2" : "wkScratch";
    s.bulb = bulbs[i];
    s.look = i < 3 ? 1 : -1;
    yield* wait(pip, w, 3);
  }
  // concentrate: squeeze down, everything dark (anticipation)
  Object.assign(s, { body: "s1", legLen: 1, armR: "down", armL: "down", eyes: "wkSqueeze", lookY: 0, look: 0, bulb: "off", mouth: "flat" });
  for (let i = 0; i < 6; i++) {
    s.antenna = i % 2 ? 2 : -2;
    yield;
  }
  s.antenna = 0;
  yield* wait(pip, w, 2);
  // flash: stretch, bulb blazes, rays, "!"
  Object.assign(s, { body: "t2", legLen: 3, armL: "up", armR: "up", eyes: "wide", mouth: "o", bulb: "glow" });
  w.props.push(new IdeaRays(pip, 9));
  w.mark("!", 10, { dx: dir * 3 });
  yield* wait(pip, w, 2);
  // a little hop of joy
  for (const y of [2, 3, 3, 2]) {
    Object.assign(s, { y, body: "t1", legLen: 2 });
    yield;
  }
  Object.assign(s, { y: 0, body: "s1", legLen: 1, armL: "out", armR: "out", eyes: "happy" });
  wideDust(w, pip.x, 16, 2);
  yield* wait(pip, w, 2);
  // point at the idea, nod
  Object.assign(s, { body: "n", legLen: 2, armR: "wkPoint", armL: "down", eyes: "happy", mouth: "smile", blush: true, look: 2 });
  for (let i = 0; i < 4; i++) {
    s.lookY = i % 2;
    s.bulb = i % 2 ? "on" : "glow";
    yield* wait(pip, w, 3);
  }
  yield* pose(pip, w, { armR: "down", lookY: 0, blush: false, bulb: "on" }, 3);
  yield* settle(pip, w);
}

// ------------------------------------------------------------------- acts

export const ACTS = {
  typing: {
    title: "Typing",
    description: "A tool call: Pip sits at the laptop, two hands alternate on lit keys while code scrolls, he stops to think with a '…' and a pulsing bulb, types a burst, the bar fills, the screen flips to a check and he throws his arms up.",
    ticks: 162,
    setup(w) {
      w.pip.x = 24;
    },
    at: { 0: (w) => ACTS.typing.run(w) },
    run(w) {
      clearProps(w);
      const dir = roomDir(w);
      const ax = snap(w.pip.x + dir * 14);
      w.pip.facing = dir;
      const lap = new WorkLaptop(ax, dir);
      w.props.push(lap);
      w.pip.do(typing, lap);
    },
  },

  success: {
    title: "Success",
    description: "The end of a turn: a crouch with dust, a confetti burst on the release tick, a high jump with arms up, a held squash landing with blush, then a small bow.",
    ticks: 64,
    setup(w) {
      w.pip.x = 64;
    },
    at: { 0: (w) => ACTS.success.run(w) },
    run(w) {
      clearProps(w);
      w.pip.do(success);
    },
  },

  oops: {
    title: "Oops",
    description: "An error: Pip's toe catches a pebble (it wiggles), the body pitches forward, he lands flat with x_x eyes and stars circling, gets up in three stages, shakes it off and raises a determined fist.",
    ticks: 100,
    setup(w) {
      w.pip.x = 30;
    },
    at: { 0: (w) => ACTS.oops.run(w) },
    run(w) {
      clearProps(w);
      const dir = roomDir(w);
      w.pip.facing = dir;
      const px = snap(w.pip.x + dir * 22) - (dir > 0 ? 0 : 4);
      w.props.push(new Pebble(px));
      w.pip.do(oops, w.props[w.props.length - 1]);
    },
  },

  "push-crate": {
    title: "Push the crate",
    description: "Effort: Pip leans back, then into a heavy crate with gritted teeth and sweat; the crate slides in small steps with dust while his feet stay planted and step up between shoves, then one big shove and he brushes off his hands.",
    ticks: 124,
    setup(w) {
      w.pip.x = 20;
    },
    at: { 0: (w) => ACTS["push-crate"].run(w) },
    run(w) {
      clearProps(w);
      const dir = roomDir(w);
      w.pip.facing = dir;
      const cx = dir > 0 ? snap(w.pip.x + 28) : snap(w.pip.x - 28) - 12;
      const crate = new HeavyCrate(cx);
      w.props.push(crate);
      w.pip.do(pushCrate, crate);
    },
  },

  eureka: {
    title: "Eureka",
    description: "Thinking hard: Pip scratches his head under a '?', the bulb flickers and goes dark while he squeezes down, then it blazes with rays, he springs up, hops and points at the idea.",
    ticks: 64,
    setup(w) {
      w.pip.x = 64;
    },
    at: { 0: (w) => ACTS.eureka.run(w) },
    run(w) {
      clearProps(w);
      w.pip.facing = roomDir(w);
      w.pip.do(eureka);
    },
  },
};

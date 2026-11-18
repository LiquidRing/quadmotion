// Act group "play": Pip touching things. See acts/basics.mjs for the act contract.
//
// Every act here follows the same grammar: the eyes find the object first,
// an anticipation opposite to the action, a release with a big silhouette
// change, a contact held 2-3 ticks while the object reacts on the same tick,
// follow-through (antenna lag, squash), a settle back to neutral.
//
// Geometry notes (see pip.mjs): Pip is symmetric about x - 0.5, so a 2-wide
// block at offset a in front of Pip (facing right) mirrors to x - a - 2.
// off(X, dir, a, W) gives the left edge of a W-wide block at facing-frame
// offset a. Props are drawn at even x so they never share a cell with Pip.

import { wait, pose, settle, walkTo, wave } from "../world.mjs";
import { EYES, ARMS, MOUTHS, BODY_SIZES } from "../pip.mjs";
import { Canvas } from "../../scenes/kit.mjs";
import { happyHops } from "./basics.mjs";

const spr = (rows) => Canvas.sprite(rows);
const snap = (x) => Math.round(x / 2) * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const at = (entries) => Object.fromEntries(entries);
const off = (X, dir, a, W = 2) => (dir > 0 ? X + a : X - a - W);
/** Which side of Pip has more room: +1 right, -1 left. */
const roomySide = (w) => (w.pip.x < w.W / 2 ? 1 : -1);

export const PALETTE = {
  0: { name: "apple-crumb", rgb: [255, 232, 176], ansi16: 93 },
  1: { name: "sneeze", rgb: [168, 218, 255], ansi16: 96 },
  2: { name: "balloon", rgb: [255, 92, 150], ansi16: 95 },
  3: { name: "string", rgb: [196, 198, 214], ansi16: 37 },
  4: { name: "spark", rgb: [255, 250, 214], ansi16: 97 },
};

// ------------------------------------------------------------- puppet parts

/** Eyes that differ per eye: drawPip stamps the left eye, then the right one. */
function perEye(left, right) {
  let n = 0;
  return { length: left.length, 0: left[0], forEach: (fn) => (n++ % 2 ? right : left).forEach(fn) };
}
// Cross-eyed: both pupils slide in and up, toward the bulb.
EYES.plCross = perEye([".#", "##", ".."], ["#.", "##", ".."]);
EYES.plSquint = ["..", "##", ".."];

// Overhead cradle: the hands come together above the head (one per body width).
ARMS.plCradle = [[0, 0], [0, -1], [0, -2], [-2, -3], [-4, -4], [-6, -5], [-8, -6], [-8, -7]]; // n, b (24 wide)
ARMS.plCradleS = [[0, 0], [0, -1], [-2, -2], [-4, -3], [-6, -4], [-8, -5], [-10, -5], [-10, -6]]; // s1, s2 (28 wide)
ARMS.plCradleT = [[0, 0], [0, -1], [0, -2], [0, -3], [-2, -4], [-4, -5], [-6, -6], [-6, -7]]; // t1, t2 (20 wide)
// Elbows only: the forearms are in front of the body (holding something to the mouth).
ARMS.plHug = [[0, 0], [0, 1], [-2, 2], [-4, 2]];
const cradleFor = (body) => (body === "s1" || body === "s2" ? "plCradleS" : body === "t1" || body === "t2" ? "plCradleT" : "plCradle");

// ----------------------------------------------------------------- helpers

/** Pip's drawn geometry for the current state (mirrors drawPip). */
function geom(pip, w) {
  const s = pip.state;
  const [bw, bh] = BODY_SIZES[s.body ?? "n"];
  const x = snap(pip.x);
  const footY = w.ground - 1 - Math.round(s.y ?? 0);
  const bottom = footY - (s.legLen ?? 2);
  const top = bottom - bh + 1;
  const lean = Math.round((s.antenna ?? 0) / 2) * 2;
  return { x, top, bottom, left: x - bw / 2, bw, bh, footY, sy: top + (bh >= 8 ? 3 : 2), bulbX: x - 2 + (pip.facing > 0 ? 2 : 0) + lean, bulbY: top - 4 };
}

/** Set both feet in world coordinates: front is the foot on the facing side. */
function setFeet(pip, front, back) {
  const fi = pip.facing > 0 ? 1 : 0;
  const f = [];
  f[fi] = front;
  f[1 - fi] = back;
  pip.feet = f.map((o) => ({ x: snap(o.x), lift: o.lift ?? 0, planted: !(o.lift > 0) }));
}

/** Step each foot that is off its standing spot back under the body. */
function* feetHome(pip, w) {
  const home = [snap(pip.x - 6), snap(pip.x + 4)];
  let feet = (pip.feet ?? home.map((x) => ({ x }))).map((f) => ({ x: snap(f.x), lift: 0, planted: true }));
  for (let k = 0; k < 2; k++) {
    if (feet[k].x === home[k]) continue;
    feet = feet.map((f, j) => (j === k ? { x: snap((f.x + home[k]) / 2), lift: 1, planted: false } : f));
    pip.feet = feet;
    yield;
    feet = feet.map((f, j) => (j === k ? { x: home[k], lift: 0, planted: true } : f));
    pip.feet = feet;
    yield;
  }
  pip.feet = null;
}

/** Small planted steps: lead foot, then trail foot, 4 sub-pixels per step. */
function* shuffleTo(pip, w, tx, { stepTicks = 1 } = {}) {
  const s = pip.state;
  tx = snap(tx);
  const dir = Math.sign(tx - pip.x);
  if (!dir) return;
  let feet = [{ x: snap(pip.x - 6), lift: 0, planted: true }, { x: snap(pip.x + 4), lift: 0, planted: true }];
  const lead = dir > 0 ? 1 : 0;
  while (pip.x !== tx) {
    const d = Math.min(4, Math.abs(tx - pip.x)) * dir;
    for (const k of [lead, 1 - lead]) {
      pip.x += d / 2;
      feet = feet.map((f, j) => (j === k ? { x: f.x + d / 2, lift: 1, planted: false } : f));
      pip.feet = feet;
      s.legLen = 2;
      yield* wait(pip, w, stepTicks);
      feet = feet.map((f, j) => (j === k ? { x: f.x + d / 2, lift: 0, planted: true } : f));
      pip.feet = feet;
      yield* wait(pip, w, stepTicks);
    }
  }
  pip.feet = null;
}

/** Eyes on a world point (look is in world space). */
function lookAt(pip, x, y = null) {
  const s = pip.state;
  s.look = clamp(Math.round((x - pip.x) / 8), -2, 2);
  if (y !== null) s.lookY = y < pip.w.ground - 16 ? -1 : y > pip.w.ground - 6 ? 1 : 0;
}

// =============================================================== ball-kick

const BALL = {
  round: [".BBBB.", "BBBBBB", ".BBBB."],
  roll: [".BbbB.", "BBbbBB", ".BbbB."],
  kick: [".BB.", "BBBB", "BBBB", ".BB."], // pressed by the foot: narrow and tall
  flat: [".BBBBBB.", "BBBBBBBB"], // ground impact
};

class KickBall {
  constructor(w, x) {
    this.kind = "ball";
    this.layer = "front";
    this.x = x;
    this.y = w.ground - 3;
    this.vx = 0;
    this.vy = 0;
    this.mode = "rest";
    this.shape = "round";
    this.roll = 0;
    this.freeze = 0;
    this.side = 1;
    this.bounces = 0;
  }
  rollIn(from, to, n) {
    this.x = from;
    this.path = { from, to, n, t: 0 };
    this.mode = "roll";
  }
  launch(vx, vy) {
    this.mode = "fly";
    this.vx = vx;
    this.vy = vy;
    this.shape = "round";
  }
  step(w) {
    const floor = w.ground - 3;
    if (this.mode === "roll") {
      const p = this.path;
      p.t++;
      const k = Math.min(1, p.t / p.n);
      const nx = p.from + (p.to - p.from) * (1 - (1 - k) ** 2);
      this.roll += Math.abs(nx - this.x);
      this.x = nx;
      if (k >= 1) this.mode = "rest";
    } else if (this.mode === "fly") {
      if (this.freeze > 0) {
        if (--this.freeze === 0) this.shape = "round";
        return;
      }
      this.vy += 0.2;
      this.x += this.vx;
      this.y += this.vy;
      this.roll += Math.abs(this.vx);
      if (this.y >= floor) {
        this.y = floor;
        if (this.vy > 0.8) {
          this.vy = -this.vy * 0.55;
          this.vx *= 0.85;
          this.shape = "flat";
          this.freeze = 1;
          this.bounces++;
          w.spray(this.x + 3, w.ground - 1, 3, { tok: "d", speed: 0.6, up: 0.3, life: 5 });
        } else {
          this.vy = 0;
          // rolls on until it leaves the stage (never parks under the next act)
          this.vx = Math.sign(this.vx) * Math.max(0.6, Math.abs(this.vx) * 0.97);
        }
      }
    }
    if (this.x < -10 || this.x > w.W + 10) this.dead = true;
  }
  draw(c) {
    const x = snap(this.x);
    const y = Math.round(this.y);
    if (this.shape === "kick") c.blit(spr(BALL.kick), this.side > 0 ? x : x + 2, y - 1);
    else if (this.shape === "flat") c.blit(spr(BALL.flat), x - 2, y + 1);
    else c.blit(spr(Math.floor(this.roll / 3) % 2 ? BALL.roll : BALL.round), x, y);
  }
}

/** Pip meets a rolling ball at stance S and kicks it away (dir = Pip's facing). */
function* ballKick(pip, w, ball, S) {
  const s = pip.state;
  const dir = pip.facing;
  // Eyes lead: the ball enters, the eyes snap to it a beat later.
  while (!(ball.x < w.W - 2 && ball.x > -4)) yield;
  yield* wait(pip, w, 2);
  lookAt(pip, ball.x);
  s.look = 2 * dir;
  yield* wait(pip, w, 6);
  yield* pose(pip, w, { eyes: "blink" }, 1);
  yield* pose(pip, w, { eyes: "open" }, 2);
  yield* walkTo(pip, w, S, { speed: 0.8 });
  pip.facing = dir;
  s.look = 2 * dir;
  while (ball.mode === "roll") yield;
  // Look down at it.
  yield* pose(pip, w, { lookY: 1 }, 4);

  // Wind-up: lean back, the kicking foot swings back.
  const back = { x: off(S, dir, -6), lift: 0 };
  pip.x = S;
  setFeet(pip, { x: off(S, dir, 0), lift: 1 }, back);
  Object.assign(s, { body: "n", legLen: 2, armL: "out", armR: "back", antenna: 2 * dir });
  yield;
  pip.x = S - 2 * dir;
  setFeet(pip, { x: off(S, dir, -2), lift: 1 }, back);
  Object.assign(s, { body: "b" });
  yield* wait(pip, w, 4);

  // Release: lunge forward, foot out, the ball squashes on the same tick.
  pip.x = S + 2 * dir;
  setFeet(pip, { x: off(S, dir, 12), lift: 1 }, back);
  Object.assign(s, { body: "t1", legLen: 3, armL: "up", armR: "back", antenna: -2 * dir, mouth: "o" });
  ball.mode = "hold";
  ball.shape = "kick";
  ball.side = dir;
  w.spray(off(S, dir, 16), w.ground - 3, 3, { tok: "4", dir, speed: 0.6, up: 0.6, g: 0.05, life: 4 });
  yield* wait(pip, w, 3);

  // Follow-through: the ball flies, the foot keeps going up.
  ball.launch(1.7 * dir, -2.3);
  setFeet(pip, { x: off(S, dir, 10), lift: 2 }, back);
  Object.assign(s, { armL: "up", armR: "out", antenna: -2 * dir, lookY: -1, mouth: null });
  yield* wait(pip, w, 2);
  // Foot down, weight lands forward.
  setFeet(pip, { x: off(S, dir, 10), lift: 0 }, back);
  Object.assign(s, { body: "s1", legLen: 1, armL: "down", armR: "down", antenna: 2 * dir, eyes: "look_up" });
  lookAt(pip, ball.x + 3);
  yield* wait(pip, w, 2);
  Object.assign(s, { body: "n", legLen: 2, antenna: 0 });
  yield;
  yield* feetHome(pip, w);

  // Watch it go: the eyes ride the arc, cheer after the first bounce.
  for (let i = 0, after = 0; i < 40 && !ball.dead && after < 5; i++) {
    lookAt(pip, ball.x + 3, ball.y);
    s.eyes = ball.y < w.ground - 9 ? "look_up" : "open";
    if (ball.bounces > 0) after++;
    yield;
  }
  s.eyes = "open";
  yield* pose(pip, w, { look: 0, lookY: 0, eyes: "happy", mouth: "smile" }, 3);
  w.say("Goal!", 18);
  yield* happyHops(pip, w, { times: 1 });
}

function startKick(w, { S, dir }) {
  w.props = w.props.filter((p) => p.kind !== "ball");
  const ball = new KickBall(w, 0);
  const stop = off(S + 2 * dir, dir, 14, 6);
  ball.rollIn(dir > 0 ? w.W + 2 : -8, stop, 44);
  w.props.push(ball);
  w.pip.do(ballKick, ball, S);
}

// ============================================================= catch-apple

const APPLE = {
  full: ["....GG..", ".RRRRRR.", "RRRRRRRR", ".RRRRRR."],
  squash: ["....GG..", "RRRRRRRR", "RRRRRRRR"],
  bite1: ["....GG..", ".RRRRR..", "RRRRR...", ".RRRRR.."],
  core: ["....GG..", "..RRRR..", "...RR...", "..RRRR.."],
};

class Apple {
  constructor(x) {
    this.kind = "apple";
    this.layer = "front";
    this.x = x;
    this.y = -6;
    this.vy = 0;
    this.mode = "hidden";
    this.shape = "full";
    this.flip = false;
    this.t = 0;
  }
  step(w) {
    this.t++;
    if (this.mode === "peek") {
      // eases down from behind the top edge, then wobbles on its twig
      if (this.y < -1) this.y += 1;
      else this.y = this.t % 6 < 3 ? -1 : 0;
    } else if (this.mode === "fall") {
      this.vy += 0.09;
      this.y += this.vy;
    }
  }
  draw(c) {
    if (this.mode === "hidden" || this.mode === "gone") return;
    c.blit(spr(APPLE[this.shape]), snap(this.x), Math.round(this.y), { flipX: this.flip });
  }
}

function* catchApple(pip, w, apple) {
  const s = pip.state;
  const target = apple.x + 4; // the apple's 8 columns sit over x-4 .. x+3
  const dir = Math.sign(target - pip.x) || pip.facing;
  apple.flip = dir < 0;
  yield* wait(pip, w, 6);
  // Rustle: a couple of leaves drift down, the apple peeks out.
  w.spray(apple.x + 4, 0, 2, { tok: "G", speed: 0.25, up: 0, g: 0.02, life: 26 });
  apple.mode = "peek";
  yield* wait(pip, w, 3);
  // Eyes lead: a look up at it.
  Object.assign(s, { eyes: "look_up", lookY: -1 });
  s.look = clamp(Math.round((target - pip.x) / 6), -2, 2);
  yield* wait(pip, w, 6);
  w.mark("!", 8, { dx: 0 });
  Object.assign(s, { eyes: "wide", lookY: -1 });
  yield* wait(pip, w, 2);
  // It comes loose; Pip shuffles under it, eyes on it.
  apple.mode = "fall";
  Object.assign(s, { eyes: "look_up", armL: "out", armR: "out" });
  pip.facing = dir;
  yield* shuffleTo(pip, w, target);
  s.look = 0;
  // Anticipation: dip, then reach up.
  yield* pose(pip, w, { body: "s1", legLen: 1, armL: "down", armR: "down" }, 2);
  Object.assign(s, { body: "n", legLen: 2, armL: "plCradle", armR: "plCradle" });
  const catchY = (g) => g.top - 6;
  for (let guard = 0; guard < 40; guard++) {
    const g = geom(pip, w);
    if (apple.y + apple.vy + 0.09 >= catchY(g)) break;
    yield;
  }
  // Contact: the apple squashes into the hands, Pip squashes under it.
  apple.mode = "held";
  const hold = (shape = "full") => {
    const g = geom(pip, w);
    apple.shape = shape;
    apple.y = catchY(g);
    s.armL = s.armR = cradleFor(s.body);
  };
  Object.assign(s, { eyes: "closed" });
  hold("squash");
  apple.y += 1;
  yield;
  Object.assign(s, { body: "s1", legLen: 1 });
  hold();
  w.dust(pip.x, 1);
  yield* wait(pip, w, 2);
  Object.assign(s, { body: "n", legLen: 2, eyes: "happy" });
  hold();
  yield* wait(pip, w, 3);
  Object.assign(s, { eyes: "look_up", lookY: -1 });
  hold();
  yield* wait(pip, w, 3);

  // Down to the mouth.
  Object.assign(s, { eyes: "closed", lookY: 0, armL: "out", armR: "out" });
  apple.y = 10;
  yield;
  Object.assign(s, { armL: "plHug", armR: "plHug" });
  apple.y = 13;
  yield;
  apple.y = w.ground - 6; // rows 16..19: below the eyes, inside the body
  Object.assign(s, { eyes: "happy" });
  yield* wait(pip, w, 4);

  // Three bites: lean back (inhale), chomp (squash) with crumbs, chew.
  const bites = ["bite1", "core", null];
  for (const next of bites) {
    yield* pose(pip, w, { body: "b", eyes: "happy" }, 3);
    Object.assign(s, { body: "s1", eyes: "closed" });
    if (next) apple.shape = next;
    else apple.mode = "gone";
    for (const side of [-1, 1]) w.spray(pip.x + side * 13, w.ground - 7, 2, { tok: side === dir ? "0" : "R", dir: side, speed: 0.5, up: 0.7, g: 0.1, life: 8 });
    if (!next) w.spray(pip.x + dir * 13, w.ground - 8, 1, { tok: "G", dir, speed: 0.3, up: 0.6, g: 0.03, life: 20 });
    w.mark("nom", 5, { dx: dir * 7 });
    yield* wait(pip, w, 2);
    // chew: a small one-pixel bob, not another chomp
    for (let k = 0; k < 2; k++) {
      yield* pose(pip, w, { body: "n", eyes: "happy" }, 2);
      yield* pose(pip, w, { body: "b", eyes: "happy" }, 2);
    }
    yield* pose(pip, w, { body: "n", eyes: "happy" }, 1);
  }
  w.props = w.props.filter((p) => p !== apple);
  Object.assign(s, { armL: "down", armR: "down", eyes: "happy", mouth: "smile" });
  yield* wait(pip, w, 3);
  w.say("Yum!", 20);
  yield* happyHops(pip, w, { times: 1 });
  // The last beat: a happy blush (no squash poses here: blush + happy eyes on
  // the wide body would share a cell with the eye).
  Object.assign(s, { eyes: "happy", blush: true, mouth: "smile" });
  yield* wait(pip, w, 12);
  yield* settle(pip, w);
}

function startApple(w, { dir }) {
  w.props = w.props.filter((p) => p.kind !== "apple");
  const apple = new Apple(snap(w.pip.x + dir * 8) - 4);
  w.props.push(apple);
  w.pip.do(catchApple, apple);
}

// =============================================================== butterfly

const WINGS = {
  open: ["vv..vv", ".vkkv.", "vv..vv"],
  shut: ["..vv..", "..kk..", "..vv.."],
  perchOpen: ["vv..vv", "vvkkvv", "..kk.."],
  perchShut: ["..vv..", "..vv..", "..kk.."],
};

class Flutter {
  constructor(x, y) {
    this.kind = "butterfly";
    this.layer = "front";
    this.x = x; // left edge of the 6-wide sprite
    this.y = y;
    this.t = 0;
    this.mode = "fly";
    this.perch = null; // () => { x, y } landing spot (sprite left/top)
    this.flight = null;
  }
  /** Fly to the perch over n ticks along a bobbing path. */
  approach(perch, n) {
    this.perch = perch;
    this.flight = { x0: this.x, y0: this.y, n, t: 0 };
    this.mode = "approach";
  }
  /** Lands on this tick? (lets Pip react on the contact tick) */
  get landingNow() {
    return this.mode === "approach" && this.flight.t + 1 >= this.flight.n;
  }
  flee(dir) {
    this.mode = "flee";
    this.fled = 0;
    this.dir = dir;
  }
  step(w) {
    this.t++;
    if (this.mode === "approach") {
      const f = this.flight;
      f.t++;
      const k = Math.min(1, f.t / f.n);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = this.perch();
      this.x = f.x0 + (p.x - f.x0) * e;
      // bob only upward so it never dips through the bulb before touching down
      this.y = f.y0 + (p.y - f.y0) * e - Math.abs(Math.sin(f.t / 2.2)) * 3 * (1 - k);
      if (k >= 1) {
        this.mode = "perch";
        this.landedAt = this.t;
      }
    } else if (this.mode === "perch") {
      const p = this.perch();
      this.x = p.x;
      this.y = p.y;
    } else if (this.mode === "flee") {
      // a startled jolt straight up, then a panicky zigzag away
      this.fled++;
      if (this.fled <= 2) this.y -= 1;
      else {
        this.x += this.dir * 1.2;
        this.y = Math.max(1, this.y + ((this.fled >> 2) % 2 ? 0.9 : -0.9) - 0.05);
      }
      if (this.x < -8 || this.x > w.W + 8 || this.y < -6) this.dead = true;
    }
  }
  draw(c) {
    const x = snap(this.x);
    const y = Math.round(this.y);
    let rows;
    if (this.mode === "perch") rows = (this.t - this.landedAt) % 14 < 9 ? WINGS.perchOpen : WINGS.perchShut;
    else rows = this.t % 4 < 2 ? WINGS.open : WINGS.shut;
    c.blit(spr(rows), x, y);
  }
}

function* butterflySneeze(pip, w, bf) {
  const s = pip.state;
  const dir = pip.facing;
  const perch = () => {
    const g = geom(pip, w);
    return { x: g.bulbX - 2, y: g.bulbY - 3 };
  };
  // ~1.4 sub-pixels per tick in visual units, whatever the distance
  bf.approach(perch, clamp(Math.round(Math.abs(bf.x - pip.x) / 1.4), 24, 60));
  // Eyes follow it in.
  while (!bf.landingNow) {
    const p = bf.perch();
    lookAt(pip, bf.x + 3);
    const above = bf.y < p.y + 6;
    s.eyes = above && Math.abs(bf.x - p.x) < 10 ? "look_up" : "open";
    s.lookY = above ? -1 : 0;
    yield;
  }
  // Contact: it lands on the bulb; Pip freezes, the eyes cross, the bulb flickers.
  Object.assign(s, { eyes: "wide", look: 0, lookY: 0, armL: "out", armR: "out" });
  s.bulb = "glow";
  yield;
  Object.assign(s, { eyes: "plCross", lookY: -1 });
  const flicker = ["on", "glow", "glow", "on", "off", "glow", "on", "glow", "off", "on", "glow", "on"];
  for (const b of flicker) {
    s.bulb = b;
    yield;
  }
  // The sneeze builds: inhale, inhale more.
  w.say("ah..", 9);
  Object.assign(s, { body: "b", eyes: "plSquint", mouth: "o", bulb: "glow" });
  yield* wait(pip, w, 4);
  s.bulb = "on";
  yield* wait(pip, w, 5);
  w.say("ah-ah..", 9);
  Object.assign(s, { body: "t1", legLen: 3, armL: "out", armR: "out", eyes: "closed", mouth: "open", bulb: "glow" });
  yield* wait(pip, w, 4);
  s.bulb = "on";
  yield* wait(pip, w, 5);
  Object.assign(s, { body: "t2", legLen: 3, armL: "up", armR: "up", antenna: -2 * dir, bulb: "glow" });
  yield* wait(pip, w, 4);
  // ACHOO! Big squash, antenna whips forward, spray, dust both sides.
  w.say("ACHOO!", 16);
  Object.assign(s, { body: "s2", legLen: 0, armL: "back", armR: "back", antenna: 2 * dir, eyes: "closed", mouth: "open", bulb: "on" });
  const g = geom(pip, w);
  w.spray(off(pip.x, dir, 14), g.top + 4, 7, { tok: "1", dir, speed: 1.4, up: 0.5, g: 0.06, life: 10 });
  w.dust(pip.x, 2);
  bf.flee(-dir);
  yield* wait(pip, w, 3);
  Object.assign(s, { antenna: -2 * dir });
  yield* wait(pip, w, 2);
  Object.assign(s, { body: "s1", legLen: 1, antenna: 2 * dir, armL: "down", armR: "down", mouth: null });
  yield* wait(pip, w, 2);
  Object.assign(s, { body: "n", legLen: 2, antenna: 0, eyes: "blink" });
  yield* wait(pip, w, 2);
  // Sniff, embarrassed: two quick sniffs, then a blush and a sheepish look away.
  w.mark("sniff", 10, { dx: dir * 7 });
  for (let k = 0; k < 2; k++) {
    yield* pose(pip, w, { body: "b", eyes: "plSquint" }, 2);
    yield* pose(pip, w, { body: "n", eyes: "open" }, 2);
  }
  Object.assign(s, { blush: true, eyes: "happy", look: -dir, lookY: 0, mouth: "flat" });
  yield* wait(pip, w, 16);
  yield* settle(pip, w);
}

function startButterfly(w, { from }) {
  w.props = w.props.filter((p) => p.kind !== "butterfly");
  const bf = new Flutter(from > 0 ? w.W + 2 : -8, 3);
  w.props.push(bf);
  w.pip.do(butterflySneeze, bf);
}

// ================================================================= balloon

class Balloon {
  constructor(x, y) {
    this.kind = "balloon";
    this.x = x; // left edge of the 6-wide balloon; the string hangs at x + 2
    this.y = y; // top row
    this.t = 0;
    this.mode = "drift";
    this.len = 3;
    this.hand = null;
  }
  driftTo(tx, ty, n) {
    this.flight = { x0: this.x, y0: this.y, tx, ty, n, t: 0 };
    this.mode = "drift";
  }
  step(w) {
    this.t++;
    if (this.mode === "drift" && this.flight) {
      const f = this.flight;
      f.t = Math.min(f.n, f.t + 1);
      const k = f.t / f.n;
      const e = 1 - (1 - k) ** 2;
      this.x = f.x0 + (f.tx - f.x0) * e;
      this.y = f.y0 + (f.ty - f.y0) * e + (k < 1 ? Math.round(Math.sin(this.t / 4)) : 0);
    } else if (this.mode === "held") {
      const h = this.hand();
      this.x = h.x - 2;
      this.y = h.y - this.len - 5 - (this.tug > 0 ? 1 : 0);
      if (this.tug > 0) this.tug--;
    } else if (this.mode === "away") {
      this.x += this.vx;
      this.y -= 0.5;
      if (this.y < -12) this.dead = true;
    }
  }
  draw(c) {
    const x = snap(this.x);
    const y = Math.round(this.y);
    c.blit(spr([".2222.", "222222", "222222", ".2222.", "..22.."]), x, y);
    const free = this.mode !== "held";
    for (let j = 0; j < this.len; j++) {
      const wig = free && (j + (this.t >> 2)) % 3 === 1 ? 1 : 0;
      // the first string row shares a cell with the knot when the knot row is
      // even: draw it in the balloon colour so that cell stays two-colour
      const r = y + 5 + j;
      // ...and a row that would share a cell with the gripping hand is left out
      if (!free && r % 2 === 0 && r + 1 === y + 5 + this.len) continue;
      const tok = j === 0 && (y + 4) % 2 === 0 ? "2" : "3";
      c.set(x + 2 + (tok === "2" ? 0 : wig), y + 5 + j, tok);
    }
  }
}

function* balloonRide(pip, w, bal) {
  const s = pip.state;
  const dir = pip.facing;
  // Where the hand will be at full stretch (t1 body, legLen 3, front arm up).
  const reach = () => {
    const g = geom(pip, w);
    const ox = g.left + g.bw;
    const hx = dir > 0 ? ox : g.left - 2;
    return { x: hx, y: g.sy - 5 };
  };
  // hand at full stretch: t1, legLen 3 from the current stance
  const stretchTop = w.ground - 1 - 3 - BODY_SIZES.t1[1] + 1;
  const handX = off(pip.x, dir, 10);
  const handY = stretchTop + 3 - 5;
  bal.driftTo(handX - 2, handY - 1 - 3 - 5, 40);
  // Eyes find it and follow it down.
  yield* wait(pip, w, 6);
  for (let i = 0; i < 34; i++) {
    lookAt(pip, bal.x + 3);
    s.eyes = bal.y < 4 ? "look_up" : "open";
    s.lookY = -1;
    yield;
  }
  w.mark("?", 8, { dx: dir * 4 });
  yield* pose(pip, w, { look: dir, eyes: "look_up" }, 6);
  // Anticipation: dip, then stretch up on tiptoe and grab the string.
  yield* pose(pip, w, { body: "s1", legLen: 1, armL: "down", armR: "back" }, 2);
  Object.assign(s, { body: "t1", legLen: 3, eyes: "wide", lookY: -1 });
  Object.assign(s, { armR: "up", armL: "out" });
  bal.mode = "held";
  bal.len = 1;
  bal.hand = reach;
  bal.tug = 2;
  yield* wait(pip, w, 3);
  // It pulls: tiptoe, then the feet leave the ground and dangle.
  Object.assign(s, { eyes: "happy", body: "t2", legLen: 3 });
  yield* wait(pip, w, 3);
  w.say("Wheee!", 30);
  Object.assign(s, { body: "n", legLen: 2, armL: "out" });
  const lifts = [1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1];
  for (let i = 0; i < lifts.length; i++) {
    s.y = lifts[i];
    pip.feet = [
      { x: snap(pip.x - 6), lift: i % 4 < 2 ? 1 : 0 },
      { x: snap(pip.x + 4), lift: i % 4 < 2 ? 0 : 1 },
    ];
    if (i % 3 === 2) pip.x += 2 * dir;
    yield;
  }
  // Touch down: squash, dust, and the string slips out of the hand.
  pip.feet = null;
  s.y = 0;
  Object.assign(s, { body: "s2", legLen: 0, armL: "out", eyes: "closed" });
  w.dust(pip.x, 2);
  bal.mode = "away";
  bal.len = 3;
  bal.vx = 0.35 * dir;
  yield* wait(pip, w, 2);
  Object.assign(s, { body: "s1", legLen: 1, armR: "down", armL: "down" });
  yield;
  Object.assign(s, { body: "n", legLen: 2, eyes: "wide", lookY: -1 });
  lookAt(pip, bal.x);
  w.mark("oops", 10, { dx: dir * 5 });
  yield* wait(pip, w, 8);
  for (let i = 0; i < 10; i++) {
    lookAt(pip, bal.x + 3);
    s.eyes = "look_up";
    yield;
  }
  yield* settle(pip, w);
  yield* wave(pip, w, { text: "Bye!", times: 2 });
}

function startBalloon(w, { dir }) {
  w.props = w.props.filter((p) => p.kind !== "balloon");
  const bal = new Balloon(dir > 0 ? w.W + 2 : -8, 3);
  w.props.push(bal);
  w.pip.facing = dir;
  w.pip.do(balloonRide, bal);
}

// ================================================================== acts

export const ACTS = {
  "ball-kick": {
    title: "Ball kick",
    description: "Eyes snap to the rolling ball, a walk to meet it, a wind-up lean, a held contact where the ball squashes against the foot, then an arc with bouncing dust and a goal hop.",
    ticks: 104,
    setup(w) {
      w.pip.x = 44;
    },
    at: at([[0, (w) => startKick(w, { S: 58, dir: 1 })]]),
    run(w) {
      const dir = roomySide(w);
      w.pip.facing = dir;
      startKick(w, { S: snap(w.pip.x + dir * 6), dir });
    },
  },
  "catch-apple": {
    title: "Catch the apple",
    description: "A look up at the wobbling apple, quick planted shuffle steps under it, a dip and a reach, a squashing catch, then three chomps with crumbs and a happy blush.",
    ticks: 124,
    setup(w) {
      w.pip.x = 48;
    },
    at: at([[0, (w) => startApple(w, { dir: 1 })]]),
    run(w) {
      startApple(w, { dir: roomySide(w) });
    },
  },
  butterfly: {
    title: "Butterfly sneeze",
    description: "The eyes follow a butterfly onto the antenna bulb, Pip freezes cross-eyed while the bulb flickers, the sneeze builds in three breaths and snaps with spray, and he sniffs, embarrassed.",
    ticks: 128,
    setup(w) {
      w.pip.x = 60;
    },
    at: at([[0, (w) => startButterfly(w, { from: 1 })]]),
    run(w) {
      startButterfly(w, { from: roomySide(w) });
    },
  },
  balloon: {
    title: "Balloon ride",
    description: "A balloon drifts down, Pip dips and stretches to grab its string, gets lifted off his feet with dangling legs, lands with a squash as it slips away, and waves goodbye.",
    ticks: 124,
    setup(w) {
      w.pip.x = 56;
    },
    at: at([[0, (w) => startBalloon(w, { dir: 1 })]]),
    run(w) {
      startBalloon(w, { dir: roomySide(w) });
    },
  },
};

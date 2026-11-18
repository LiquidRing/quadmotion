// A tiny deterministic world for Pip: ground, props, particles, overlays and
// a behaviour queue. Weather, night and other conditions are props that act
// groups bring with them (see acts/weather.mjs). Actions are generator functions that change Pip's pose
// one tick at a time; the same code drives the browser playground (live
// input) and the recorded scenes (scripted input).
//
// Acting grammar (taken from how Claude Code's own mascot is animated, then
// extended): few crisp poses, holds of 1-5 ticks, an anticipation crouch with
// dust on both sides, a release pose, a held contact, a settle back to the
// neutral pose. Every action starts and ends in the neutral pose so they chain.

import { Canvas, prng } from "../scenes/kit.mjs";
import { drawPip } from "./pip.mjs";

export const TICK_MS = 50;

export const NEUTRAL = Object.freeze({
  body: "n",
  legLen: 2,
  y: 0,
  eyes: "open",
  look: 0,
  lookY: 0,
  mouth: null,
  blush: false,
  armL: "down",
  armR: "down",
  antenna: 0,
  bulb: "on",
});

export class World {
  constructor({ cols = 64, rows = 12, seed = 1, groundRow } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.W = cols * 2;
    this.H = rows * 2;
    this.ground = groundRow ?? this.H - 2;
    this.rand = prng(seed);
    this.t = 0;
    this.props = [];
    this.particles = [];
    this.overlays = []; // { text, col, row, fg, until }
    this.pip = new Pip(this, { x: Math.round(this.W / 4 / 2) * 2 });
    this.listeners = [];
  }

  /** Advance one tick. */
  step() {
    this.t++;
    this.pip.step();
    for (const p of this.props) p.step?.(this);
    this.props = this.props.filter((p) => !p.dead);
    for (const q of this.particles) {
      q.vy += q.g ?? 0;
      q.x += q.vx;
      q.y += q.vy;
      if (q.floor !== false && q.y >= this.ground - 1 && q.vy > 0) {
        if (q.splash) {
          q.life = 0;
          this.spray(q.x, this.ground - 1, 2, { tok: q.tok, speed: 0.6, up: 0.6, life: 3 });
        } else {
          q.y = this.ground - 1;
          q.vy *= -0.3;
          q.vx *= 0.6;
        }
      }
      q.life--;
    }
    this.particles = this.particles.filter((q) => q.life > 0 && q.x > -4 && q.x < this.W + 4 && q.y < this.H + 2);
    this.overlays = this.overlays.filter((o) => o.until > this.t);
    for (const fn of this.listeners) fn(this);
  }

  /** Spawn particles. */
  spray(x, y, n, { tok = "d", speed = 0.7, up = 0.5, g = 0.08, life = 8, dir = 0, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const side = dir || (i % 2 ? 1 : -1);
      this.particles.push({
        x: x + side * this.rand() * 2,
        y,
        vx: side * (0.3 + this.rand() * speed) * spread,
        vy: -(0.15 + this.rand() * up),
        g,
        life: life + Math.floor(this.rand() * 4),
        tok,
      });
    }
  }

  /** Dust puff at the feet: the Clawd crouch "poof", as particles. */
  dust(x, strength = 1) {
    this.spray(x - 6, this.ground - 1, 2 + strength, { tok: "d", dir: -1, speed: 0.5 * strength, up: 0.25, life: 6 });
    this.spray(x + 6, this.ground - 1, 2 + strength, { tok: "d", dir: 1, speed: 0.5 * strength, up: 0.25, life: 6 });
  }

  say(text, ticks = 30, { col, row = 0, fg = "t" } = {}) {
    const width = [...text].length + 2;
    const c = col ?? Math.max(0, Math.min(this.cols - width, Math.round(this.pip.x / 2) - Math.floor(width / 2)));
    this.overlays.push({ text: `‹${text}›`, col: c, row, fg, until: this.t + ticks });
  }

  mark(text, ticks, { dx = 0, row, fg = "t" } = {}) {
    const box = this.pip.box;
    const r = row ?? Math.max(0, Math.floor((box?.top ?? 4) / 2) - 1);
    this.overlays.push({ text, col: Math.round(this.pip.x / 2) + dx, row: r, fg, until: this.t + ticks });
  }

  render() {
    const c = new Canvas(this.W, this.H);
    // ground
    for (let x = 0; x < this.W; x++) {
      c.set(x, this.ground, "G");
      c.set(x, this.ground + 1, (x >> 1) % 7 === 3 ? "o" : "D");
    }
    for (const p of this.props) if (p.layer !== "front") p.draw(c, this);
    this.pip.draw(c);
    for (const p of this.props) if (p.layer === "front") p.draw(c, this);
    // Particles never share a cell with Pip or a prop (a third color there
    // would be folded away by the compiler).
    const busy = (x, y) => {
      const cx = x & ~1;
      const cy = y & ~1;
      return c.get(cx, cy) || c.get(cx + 1, cy) || c.get(cx, cy + 1) || c.get(cx + 1, cy + 1);
    };
    for (const q of this.particles) {
      const x = Math.round(q.x);
      const y = Math.round(q.y);
      if (y >= this.ground - 1 && y < this.ground) {
        if (!busy(x, y - 1) && !c.get(x, y)) c.set(x, y, q.tok);
      } else if (!busy(x, y)) c.set(x, y, q.tok);
    }
    const overlays = this.overlays.map(({ text, col, row, fg }) => ({ text, col, row, fg }));
    return { canvas: c, overlays };
  }
}

export class Pip {
  constructor(world, { x }) {
    this.w = world;
    this.x = x;
    this.facing = 1;
    this.state = { ...NEUTRAL };
    this.queue = [];
    this.current = null;
    this.feet = null; // planted feet while walking, null = default stance
    this.idleClock = 0;
    this.nextBlink = 40;
    this.box = null;
  }

  get busy() {
    return Boolean(this.current) || this.queue.length > 0;
  }

  /** Queue an action generator: do(jump), do(walkTo, 80). */
  do(action, ...args) {
    this.queue.push(() => action(this, this.w, ...args));
    return this;
  }

  /** Replace whatever is queued (for interruptions like a click). */
  interrupt(action, ...args) {
    this.queue = [];
    this.current = null;
    this.reset();
    return this.do(action, ...args);
  }

  reset() {
    this.state = { ...NEUTRAL, bulb: this.state.bulb };
    this.feet = null;
  }

  step() {
    if (!this.current && this.queue.length) this.current = this.queue.shift()();
    if (this.current) {
      const r = this.current.next();
      if (r.done) this.current = null;
      this.idleClock = 0;
    } else {
      this.idle();
    }
  }

  /** Life while nothing is queued: blinks, glances, a breath. */
  idle() {
    const s = this.state;
    this.idleClock++;
    const k = this.idleClock;
    if (k >= this.nextBlink && k < this.nextBlink + 2) s.eyes = "blink";
    else if (s.eyes === "blink") s.eyes = "open";
    if (k === this.nextBlink + 2) this.nextBlink = k + 50 + Math.floor(this.w.rand() * 60);
    // an occasional glance to one side and back (eyes only, outline still)
    const g = k % 140;
    if (k > 60 && g === 100) this.glance = this.w.rand() < 0.5 ? -2 : 2;
    if (g === 101) s.look = this.glance ?? 0;
    if (g === 118) s.look = 0;
    // a slow breath: the body swells by one sub-pixel every ~1.6 s
    if (s.body === "n" || s.body === "b") s.body = k % 32 < 14 ? "b" : "n";
  }

  draw(c) {
    this.box = drawPip(c, { ...this.state, x: this.x, ground: this.w.ground, facing: this.facing, feet: this.feet ?? undefined });
  }
}

// ---------------------------------------------------------------- actions
// Each yields once per tick. Helpers keep choreography readable.

/** Hold the current pose for n ticks. */
export function* wait(pip, w, n = 1) {
  for (let i = 0; i < n; i++) yield;
}

/** Set pose fields and hold n ticks. */
export function* pose(pip, w, patch, n = 1) {
  Object.assign(pip.state, patch);
  for (let i = 0; i < n; i++) yield;
}

/** Back to neutral, keeping the bulb, with a 1-tick settle. */
export function* settle(pip, w, n = 2) {
  const bulb = pip.state.bulb;
  Object.assign(pip.state, { ...NEUTRAL, bulb, body: "t1" });
  yield;
  Object.assign(pip.state, { ...NEUTRAL, bulb });
  pip.feet = null;
  for (let i = 1; i < n; i++) yield;
}

/**
 * Walk to x with planted feet. speed in sub-pixels per tick (0.5 walk, 1.2 run).
 * Feet: each foot is either in stance (fixed in the world) or swinging forward
 * with a small lift; the body is placed between them and bobs at passing.
 */
export function* walkTo(pip, w, targetX, { speed = 0.6, run = false, held = null } = {}) {
  // held: optional () => boolean; walk toward targetX only while it returns true
  // (live keyboard control), then stop with the same planted-feet settle.
  const dir = Math.sign(targetX - pip.x) || pip.facing;
  pip.facing = dir;
  const S = run ? 8 : 6;
  const hips = [-6, 4];
  // Start a quarter cycle in: foot 0 is planted exactly at its standing spot
  // and foot 1 lifts from its standing spot, so nothing slides on the first tick.
  let d = 0.5 * S;
  let v = 0;
  const total = Math.abs(targetX - pip.x);
  const s = pip.state;
  s.antenna = 0;
  let travelled = 0;
  while (travelled < total) {
    if (held && !held()) break;
    const remaining = held ? Math.max(total - travelled, speed * 4) : total - travelled;
    // ease in over ~6 ticks, ease out over the last stride
    v = Math.min(speed, v + speed / 5, Math.max(0.25, remaining / 3));
    const dx = Math.min(v, remaining);
    travelled += dx;
    d += dx;
    pip.x += dir * dx;
    const feet = hips.map((hip, i) => {
      const u = (d / (2 * S) + i * 0.5) % 1;
      const stance = u < 0.5;
      const off = stance ? 1 - 4 * u : 4 * u - 3;
      return { x: pip.x + hip + dir * (S / 2) * off, lift: stance ? 0 : Math.max(1, Math.round(Math.sin(Math.PI * (u - 0.5) * 2) * (run ? 3 : 2))), u, planted: stance };
    });
    pip.feet = feet;
    const passing = feet.some((f) => f.lift > (run ? 1 : 0));
    s.legLen = passing ? 3 : 2;
    s.body = run && passing ? "t1" : "n";
    s.antenna = -dir * (run ? 2 : v > speed * 0.6 ? 2 : 0); // lags behind
    s.armL = run ? (passing ? "back" : "out") : "down";
    s.armR = run ? (passing ? "out" : "back") : "down";
    if (run && feet.some((f) => f.lift === 0 && f.u < 0.08)) w.spray(pip.x - dir * 4, w.ground - 1, 1, { dir: -dir, speed: 0.6, up: 0.2, life: 5 });
    yield;
  }
  if (!held) pip.x = targetX;
  // Stop: put down a swinging foot where it is, then step each foot that is
  // off its standing spot back under the body (lift one tick, place).
  const home = hips.map((hip) => Math.round((pip.x + hip) / 2) * 2);
  let feet = (pip.feet ?? []).map((f) => ({ x: Math.round(f.x / 2) * 2, lift: 0, planted: true }));
  pip.feet = feet;
  for (let k = 0; k < feet.length; k++) {
    if (feet[k].x === home[k]) continue;
    feet = feet.map((f, j) => (j === k ? { x: (f.x + home[k]) / 2, lift: 1, planted: false } : f));
    pip.feet = feet;
    s.legLen = 2;
    yield;
    feet = feet.map((f, j) => (j === k ? { x: home[k], lift: 0, planted: true } : f));
    pip.feet = feet;
    yield;
  }
  pip.feet = null;
  // antenna overshoots forward (follow-through)
  s.legLen = 1;
  s.body = "s1";
  s.antenna = dir * 2;
  s.armL = s.armR = "down";
  yield;
  s.legLen = 2;
  s.body = "n";
  yield;
  s.antenna = 0;
  yield;
}

/**
 * Jump: anticipation crouch with dust, stretch at takeoff, a parabolic arc
 * (height in sub-pixels, distance dx), tucked legs at the apex, landing squash
 * held 2 ticks with dust, settle. The arc length is chosen in visual units
 * (a sub-pixel is twice as tall as wide).
 */
export function* jump(pip, w, { dx = 0, height = 8, ticks } = {}) {
  const s = pip.state;
  const dir = Math.sign(dx) || pip.facing;
  if (dx) pip.facing = dir;
  const n = ticks ?? Math.max(8, Math.round(6 + Math.sqrt(height) * 1.6 + Math.abs(dx) / 6));
  // anticipation
  Object.assign(s, { body: "s1", legLen: 1, armL: "back", armR: "back", antenna: 0, eyes: "open" });
  w.dust(pip.x, 1);
  yield;
  Object.assign(s, { body: "s2", legLen: 0 });
  yield;
  yield;
  // takeoff
  const x0 = pip.x;
  Object.assign(s, { body: "t2", legLen: 3, armL: "up", armR: "up", antenna: -2 * dir });
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pip.x = x0 + dx * t;
    s.y = Math.round(4 * height * t * (1 - t));
    if (t > 0.25 && t < 0.75) Object.assign(s, { body: "n", legLen: 1, antenna: 0 });
    else if (t >= 0.75) Object.assign(s, { body: "t1", legLen: 2, armL: "out", armR: "out", antenna: 2 * dir });
    yield;
  }
  // landing
  s.y = 0;
  Object.assign(s, { body: "s2", legLen: 0, armL: "out", armR: "out" });
  w.dust(pip.x, 2);
  yield;
  yield;
  Object.assign(s, { body: "s1", legLen: 1 });
  yield;
  yield* settle(pip, w);
}

/** Look around: right, left, back (Clawd's LOOK_AROUND, with eye travel). */
export function* lookAround(pip, w) {
  const s = pip.state;
  for (const [look, n] of [[2, 1], [3, 6], [0, 1], [-3, 1], [-4, 6], [0, 2]]) {
    s.look = look;
    yield* wait(pip, w, n);
  }
}

/** Wave hello with a speech bubble. */
export function* wave(pip, w, { text = "Привет!", times = 3 } = {}) {
  const s = pip.state;
  Object.assign(s, { eyes: "happy", blush: true, mouth: "smile" });
  w.say(text, 8 * times + 6);
  for (let i = 0; i < times; i++) {
    s.armR = "wave";
    yield* wait(pip, w, 4);
    s.armR = "up";
    yield* wait(pip, w, 4);
  }
  s.armR = "down";
  yield* wait(pip, w, 2);
  yield* settle(pip, w);
}

/** Spin: flips facing a few times with arms out, ends with arms up. */
export function* spin(pip, w) {
  const s = pip.state;
  Object.assign(s, { armL: "out", armR: "out" });
  for (let i = 0; i < 4; i++) {
    pip.facing *= -1;
    s.look = 0;
    yield* wait(pip, w, 2);
  }
  Object.assign(s, { armL: "up", armR: "up", eyes: "happy" });
  yield* wait(pip, w, 4);
  yield* settle(pip, w);
}


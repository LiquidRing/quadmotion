// Basic acts: locomotion, greetings, the Clawd-style click reactions.
//
// Act contract (all groups):
//   { title, description, ticks, setup(w), at: { tick: fn(w) }, run(w) }
//  - setup/at drive the recorded showcase from a fresh world (deterministic);
//  - run(w) plays the same scenario from wherever Pip stands now, for the
//    live playground; it may place props relative to Pip and queue actions.
// Pip's behaviour lives in action generators (world.mjs and the group files);
// scripts only place props and queue actions, the way a user or a game would.

import { walkTo, jump, wave, lookAround, wait, pose, settle, spin } from "../world.mjs";
import { Crate } from "../props.mjs";

const at = (entries) => Object.fromEntries(entries);
const snap = (x) => Math.round(x / 2) * 2;

/** Clawd's jump beat: crouch + dust, arms up, land; twice. */
export function* happyHops(pip, w, { times = 2 } = {}) {
  const s = pip.state;
  for (let i = 0; i < times; i++) {
    Object.assign(s, { body: "s1", legLen: 1, armL: "down", armR: "down" });
    w.dust(pip.x, 1);
    yield;
    yield;
    Object.assign(s, { body: "t1", legLen: 2, armL: "up", armR: "up", eyes: "happy", y: 2 });
    yield;
    s.y = 4;
    yield;
    s.y = 3;
    yield;
    Object.assign(s, { y: 0, body: "s1", legLen: 1, armL: "out", armR: "out" });
    yield;
    Object.assign(s, { body: "n", legLen: 2, armL: "down", armR: "down" });
    yield;
  }
  yield* settle(pip, w);
}

/** Clawd's entrance "skip": hop in from the side in three bounds. */
export function* skipIn(pip, w, { to, step = 10 } = {}) {
  const s = pip.state;
  const dir = Math.sign(to - pip.x) || 1;
  pip.facing = dir;
  while (Math.abs(to - pip.x) > 0.5) {
    const dx = Math.min(step, Math.abs(to - pip.x)) * dir;
    Object.assign(s, { body: "s1", legLen: 1, armL: "back", armR: "back" });
    w.dust(pip.x, 1);
    yield;
    const x0 = pip.x;
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      pip.x = x0 + dx * t;
      s.y = Math.round(4 * 4 * t * (1 - t));
      Object.assign(s, { body: t < 0.5 ? "t1" : "n", legLen: 2, armL: "up", armR: "up" });
      yield;
    }
    Object.assign(s, { y: 0, body: "s1", legLen: 1, armL: "out", armR: "out" });
    yield;
  }
  yield* settle(pip, w);
}

/** Startled double take: look, freeze wide-eyed with a "!", then relax. */
export function* doubleTake(pip, w, { side = 1 } = {}) {
  const s = pip.state;
  yield* pose(pip, w, { look: 2 * side }, 4);
  yield* pose(pip, w, { look: 0 }, 3);
  Object.assign(s, { look: 3 * side, eyes: "wide", body: "t1", legLen: 3, armL: "out", armR: "out", antenna: -2 * side });
  w.mark("!", 10, { dx: 0 });
  yield* wait(pip, w, 10);
  yield* pose(pip, w, { eyes: "blink" }, 2);
  yield* settle(pip, w);
}

export const PALETTE = {};

export const ACTS = {
  "walk-jump": {
    title: "Walk, look, jump",
    description: "Planted-foot walk with an eased start and stop, a look at the crate, an anticipation crouch, an arc over it, a held landing squash with dust.",
    ticks: 150,
    setup(w) {
      w.pip.x = 12;
      w.props.push(new Crate(60));
    },
    at: at([
      [0, (w) => w.pip.do(wait, 10).do(walkTo, 38, { speed: 0.6 })],
      [1, (w) => w.pip.do(wait, 4).do(pose, { look: 2 }, 6).do(pose, { eyes: "blink" }, 2).do(pose, { eyes: "open" }, 3).do(jump, { dx: 50, height: 9 })],
      [2, (w) => w.pip.do(wait, 4).do(pose, { look: -3 }, 8).do(pose, { look: 0 }, 2).do(wave, { text: "Хоп!", times: 2 }).do(walkTo, 140, { speed: 0.9 })],
    ]),
    run(w) {
      const dir = w.pip.x < w.W / 2 ? 1 : -1;
      const crateX = snap(w.pip.x + dir * 22);
      w.props = w.props.filter((p) => p.kind !== "crate");
      w.props.push(new Crate(dir > 0 ? crateX : crateX - 8));
      w.pip.facing = dir;
      w.pip.do(pose, { look: 2 }, 6).do(pose, { eyes: "blink" }, 2).do(pose, { eyes: "open" }, 2).do(jump, { dx: dir * 44, height: 9 }).do(wave, { text: "Хоп!", times: 2 });
    },
  },

  hello: {
    title: "Hello",
    description: "Clawd-style entrance: three skips in from the edge with dust at every take-off, then a wave with a speech bubble.",
    ticks: 90,
    setup(w) {
      w.pip.x = -16;
    },
    at: at([[0, (w) => w.pip.do(skipIn, { to: 44 }).do(wave, { text: "Привет!", times: 3 })]]),
    run(w) {
      w.pip.do(wave, { text: "Привет!", times: 3 });
    },
  },

  "click-hops": {
    title: "Happy hops",
    description: "The click reaction: crouch with dust on both sides, pop up with arms raised, land, twice. Short, snappy, 0.7 s per beat.",
    ticks: 50,
    setup(w) {
      w.pip.x = 64;
    },
    at: at([[4, (w) => w.pip.do(happyHops, { times: 2 })]]),
    run(w) {
      w.pip.do(happyHops, { times: 2 });
    },
  },

  "look-around": {
    title: "Look around",
    description: "Only the eyes travel: right, hold, left, hold, back. The outline stays still, the double take adds a freeze and a '!'.",
    ticks: 70,
    setup(w) {
      w.pip.x = 64;
    },
    at: at([[4, (w) => w.pip.do(lookAround).do(doubleTake, { side: 1 })]]),
    run(w) {
      w.pip.do(lookAround).do(doubleTake, { side: 1 });
    },
  },

  spin: {
    title: "Spin",
    description: "Arms out, facing flips every two ticks, a pop with arms up and happy eyes, settle.",
    ticks: 36,
    setup(w) {
      w.pip.x = 64;
    },
    at: at([[4, (w) => w.pip.do(spin).do(happyHops, { times: 1 })]]),
    run(w) {
      w.pip.do(spin).do(happyHops, { times: 1 });
    },
  },

  "idle-life": {
    title: "Idle life",
    description: "Nothing queued: a breath every 1.6 s, irregular blinks, the bulb never stops. What Pip does between your actions.",
    ticks: 120,
    setup(w) {
      w.pip.x = 64;
      w.pip.nextBlink = 12;
    },
    at: {},
    run() {},
  },
};

# Character modules

The stage (`scripts/lib/stage/`) runs a small world: ground, props, particles,
speech, and a character driven by action generators. Pip is the built-in
character; a character module replaces him with yours, and every action and
act works with it.

## The contract

```js
export const name = "ember";            // kebab-case id
export const rows = 16;                 // optional stage height in cells (default 12)
export const palette = {                // any one-character tokens, as many colors as you need
  "α": { name: "outline", rgb: [42, 23, 18], ansi16: 30 },
  "β": { name: "fur", rgb: [232, 121, 43], ansi16: 33 },
};
export function draw(canvas, s) { ... return box; }
export const acts = { ... };            // optional extra acts (same contract as the built-in ones)
```

Use tokens that do not clash with the stage's own (grass `G`, soil `D`,
dust `d`, props): Greek letters or other symbols work well.

`draw(canvas, s)` is called once per tick with the pose state:

| Field | Meaning |
| --- | --- |
| `x`, `ground`, `facing` | centre between the feet (sub-pixels), first ground row, 1 or -1 |
| `y` | height of the feet above the ground (jumps) |
| `legLen` | hip to foot: 0-1 crouch, 2 standing, 3 passing step |
| `body` | squash/stretch: `s2`, `s1`, `n`, `b` (inhale), `t1`, `t2` |
| `eyes` | `open`, `blink`, `closed`, `wide`, `happy`, `look_up`, `sleepy`, `x` (acts may add names: fall back to `open`) |
| `look`, `lookY` | eye shift in sub-pixels |
| `mouth`, `blush` | `smile`, `o`, `open`, `grin` or null; cheeks |
| `armL`, `armR` | `down`, `out`, `up`, `wave`, `back`, `hold`, `reach`, `type` (fall back to `down`) |
| `antenna` | -2..2 secondary motion: lean of an antenna, ears, tail wag |
| `bulb` | `on`, `off`, `glow`: any light the character has |
| `feet` | `[{ x, lift, planted }]` while walking; otherwise draw your standing stance |

Return `{ x, left, right, top, footY, bodyTop, bodyBottom, feet: [{ x, y, planted }] }`.
The checks use it: a standing character (`y = 0`) must touch the row above
the ground, a planted foot must keep its x.

## How to draw one

1. Draw into your own layer: `const L = new canvas.constructor(canvas.width, canvas.height)`.
2. Build from parts back to front: tail, legs, torso, arms, ears, head, face.
   Use `L.ellipse`, `L.rect`, `L.line`, `L.set`, and stamp small authored
   pieces (eyes, mouths) from string rows.
3. Size parts from the `body` state with a small table of integers, so
   squash and stretch change the shape in whole sub-pixels (no shimmer).
4. Shade and outline the layer: `L.rim("fur", "fur-shade", "bottom")`,
   `L.outline("outline")`, then `canvas.blit(L.px, 0, 0)`.
5. Place features from the pose: eyes from `look`, a tail from `antenna`,
   legs from `feet` (each foot is drawn where the stage says it is).

## Commands

```bash
node scripts/strip.mjs --module my-character.mjs --act walk-jump --view compare --crop pip --width 30
node scripts/compile.mjs --module my-character.mjs --act hello --target svg --source --out dist
node scripts/compile.mjs --module my-character.mjs --act hello --target ansi --out dist
```

Acts: `walk-jump`, `hello`, `click-hops`, `look-around`, `spin`, `idle-life`,
`ball-kick`, `catch-apple`, `butterfly`, `balloon`, `rain`, `night`, `snow`,
`fireflies`, `typing`, `success`, `oops`, `push-crate`, `eureka`.

## Writing actions and acts

Actions are generators that change the pose one tick at a time; acts place
props and queue actions. Every action starts and ends in the neutral pose so
actions chain, and a click can interrupt cleanly.

```js
export function* jump(pip, w, { dx = 0, height = 8 } = {}) {
  Object.assign(pip.state, { body: "s1", legLen: 1, armL: "back", armR: "back" });
  w.dust(pip.x, 1);           // anticipation, with the dust poof
  yield; yield;
  // release: stretch, arms up; arc; land: squash held 2 ticks, dust; settle
}

export const acts = {
  "my-act": {
    title: "My act", description: "What to watch for.", ticks: 120,
    setup(w) { w.pip.x = 40; },
    at: { 0: (w) => w.pip.do(walkTo, 70).do(jump, { dx: 30 }) },
    run(w) { w.pip.do(jump, { dx: 30 }); },
  },
};
```

Import helpers from the engine (`scripts/lib/stage/world.mjs`: `walkTo`,
`jump`, `wave`, `spin`, `lookAround`, `pose`, `wait`, `settle`) with a
relative path from your module.

## Procedural scenes

For a game screen or an effect, draw frames directly on a canvas and compile
them like a scene: `scripts/lib/scenes/kit.mjs` exports `Canvas`, `makeScene`,
`palette`, `prng`, `hsv` and a 5x7 font. The built-in demos (`fire`,
`physics`, `widgets`, `resolution`, `logo`) are working examples.

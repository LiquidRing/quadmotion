# Puppet acts

Frame lists work for a mascot with a handful of poses. A mascot that walks,
kicks a ball, opens an umbrella and reacts to clicks needs a puppet. This is
how Pip is built in QuadMotion (`src/stage/`).

## Parts, not frames

- A body in a few authored sizes: squash 2, squash 1, neutral, inhale,
  stretch 1, stretch 2. Widths are multiples of 4 so the half-width is even.
- Eye states (open, blink, closed, wide, happy, look up), mouths, arm poses
  (down, out, up, wave, back, hold, reach, type), legs drawn from the hip to
  each foot, an antenna that leans by whole cells.
- Code only places parts on whole sub-pixels. Rasterising shapes from floats
  makes the outline shimmer from frame to frame.

## Keeping two colors per cell while moving

- Root x is always even and every part has an even width and x offset, so the
  puppet is cell-aligned horizontally; vertical position is free (half cells).
- Features (eyes, mouth, blush) sit at least 2 sub-pixels inside the body.
- Particles and dust never draw into a cell the puppet occupies.
- A test fails the act if any cell on the puppet needs three colors.

## Feet are the source of truth

- A planted foot sits on the row above the ground and keeps its world x.
- Walking: each foot is in stance (fixed in the world) or swinging forward
  with a lift; the body is placed between the feet and rises at passing.
- Start a walk a quarter cycle in, so the first planted foot is exactly where
  it stood. Stop by putting a swinging foot down where it is, then stepping
  each foot back under the body.
- In the air the feet hang from the body; a jump is a parabola in time, with
  height chosen in visual units (one sub-pixel is two units tall).

## Actions are generators

```js
export function* jump(pip, w, { dx = 0, height = 8 } = {}) {
  Object.assign(pip.state, { body: "s1", legLen: 1, armL: "back", armR: "back" });
  w.dust(pip.x, 1);           // anticipation, with the Clawd "poof"
  yield; yield;
  // ... release: stretch, arms up; arc; land: squash held 2 ticks, dust; settle
}
pip.do(walkTo, 40).do(jump, { dx: 44, height: 9 }).do(wave, { text: "Hi!" });
```

Each yield is one tick. Actions start and end in the neutral pose, so any
action can follow any other, and a click can interrupt cleanly.

## Checks on every act

Record the act and fail it when:

- Pip stands (`y = 0`) but no foot pixel touches the ground row (floating);
- a foot that is planted in two consecutive ticks changes x (sliding);
- Pip moves more than 8 sub-pixels in one tick (teleport);
- any cell inside Pip's box needs 3+ colors.

Then look at the consecutive frames anyway. Checks catch mechanics, not charm.

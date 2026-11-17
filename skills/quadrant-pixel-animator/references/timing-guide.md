# Timing guide

Motion reads as alive because of *holds*, not frame rate. Use a fixed base
tick and hold key poses for many ticks; keep in-betweens to 1-3 ticks.

## Base ticks

| Use | tickMs | Why |
| --- | --- | --- |
| Interactive terminal mascot | 60 | ~16 fps is enough for 1-sub-pixel moves |
| Claude Code mod band | 140-150 | the band redraws about 10 times a second (up to 30 when expanded in the terminal) |
| Status line / sparse idle | 150+ | redraw only when the frame changes |

## Recipes (holds at 60 ms)

**Idle** (loop): default 40-60, blink 2, default 30-40, look_left 10-12,
default 3, look_right 10-12, default 20-30, double blink (blink 2, default 2,
blink 2), back to default. Only the eye sub-pixels change; the outline stays still.

**Jump + wave** (once): anticipation crouch 3-4 -> jump (arms up) 5-6 ->
landing squash 2 -> default 3 -> wave_a 4 / wave_b 4 x2 -> default 10.

**Celebrate** (loop, 2 passes in mods): crouch 3 -> jump 5 (+ sparkle
overlays) -> crouch 2 (+ dust `░`) -> default 6-8.

**Dash with trail**: look toward the dash 3 -> arms-up stance 2 -> 3 frames
moving with `dx` -> squash on landing 2. Draw the trail as overlays fading
`▓ -> ▒ -> ░` in the cells the sprite just left.

## Loops

The last frame of a loop must lead into the first. The validator warns
(`loop-seam`) when they differ in more than 60% of the sprite's pixels.

## Reduced motion

Always set `reducedMotionPose`. Players draw it once when
`QUADMOTION_REDUCED_MOTION=1`; the Ink component takes a `reducedMotion` prop;
the mod has a `REDUCED_MOTION` constant; SVGs switch to it under
`prefers-reduced-motion: reduce`.

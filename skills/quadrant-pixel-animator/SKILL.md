---
name: quadrant-pixel-animator
description: Designs, animates, checks and compiles terminal pixel-art mascots drawn with 2x2 Unicode quadrant glyphs (fixed-height box, hold timelines, flicker-free DEC 2026 output) into a standalone ANSI player, an Ink component, a Claude Code mod or animated SVG. Use for terminal sprites, CLI mascots, animated status widgets and Claude Code mods. Not for skeletal 2D rigs (Spine) or 3D.
license: MIT
compatibility: Node.js 20+ (no npm dependencies). Ink output needs react and ink in the target project.
allowed-tools: Bash(node:*) Read Write Edit
---

# Quadrant Pixel Animator

Turns a JSON rig (pixel grids at 2x terminal resolution, a palette and hold
timelines) into crisp quadrant-block art (▘ ▝ ▀ ▖ ▌ ▞ ▛ ▗ ▚ ▐ ▜ ▄ ▙ ▟ █).
The scripts do all glyph math and render your frames to PNG so you can see
them. You edit pixel grids and timing; you never type glyphs.

Paths below are relative to this skill's folder (`scripts/`, `assets/`, `references/`).

## Rules

- Never type quadrant glyphs by hand. Draw poses as rows of one-character
  tokens in the rig; `scripts/compile.mjs` picks the glyphs.
- One token = one sub-pixel. A terminal cell is 2 sub-pixels wide and 2 tall,
  so a canvas of `cols x rows` cells is `cols*2` characters x `rows*2` lines.
  A sub-pixel is twice as tall as it is wide: a round shape is twice as many
  characters wide as it is lines tall.
- `.` and space are transparent. Every other token must be in `palette`.
- At most 2 tokens per 2x2 cell (transparent counts). Eyes are a dark token
  inside a body cell (body + eye = 2 colors), which also keeps them visible on
  light terminal themes.
- Judge motion only from rendered frames (`scripts/strip.mjs`), never from
  reading the rig. Reading pixel rows does not show you floating feet, sliding,
  popping or a flat jump; the PNG does.
- Draw whatever character the user asks for. When the user supplies artwork
  or a reference image, use it as the basis for the character design.

## Workflow

1. **Fix the canvas.** Pick `canvas.cols` and `canvas.rows` once; every frame
   keeps that size, which is what stops the screen below from jumping.
   Compact mascot: 9x3 cells (18x6 sub-pixels). Hats, speech bubbles or jump
   arcs: 5 rows. Leave the bottom sub-pixel row empty in the neutral pose so a
   1-sub-pixel crouch fits.
2. **Start from the template.** Copy `assets/starter-companion.rig.json`, rename
   it, change palette and pixels. Format: `references/rig-format.md`.
3. **Palette.** Each token has `rgb` (true color) and `ansi16` (30-37/90-97
   fallback; `ansi16Bg` defaults to `ansi16 + 10`). Declare the body color
   first: on a tie it becomes the foreground.
4. **Poses.** `pixels` rows, or reuse: `{ "pose": "default", "remap": { "E": "#" } }`
   (blink), `{ "layers": ["body", { "pose": "hat", "dx": 2 }] }` (costumes;
   `dx`/`dy` in sub-pixels). Small motions read best: move one eye sub-pixel
   for a look, drop the body 1 sub-pixel for a crouch.
5. **Act it out.** Every action uses the same grammar, the one that makes
   Claude Code's own mascot feel alive:
   anticipation (a crouch, opposite to the action, with dust) → the action
   (a big silhouette change on the release frame, arms up) → a held contact
   (2-3 ticks) → follow-through (overshoot, squash) → settle back to the
   neutral pose so actions chain. Eyes lead: look at a thing before acting on
   it. Recipes and tick counts: `references/timing-guide.md`.
6. **Timelines.** Frames are `{ "pose", "hold" }` over `tickMs` (60 ms typical;
   140-150 ms for mods and sparse status animations). Hold key poses, keep
   in-betweens to 1-3 ticks. Set `reducedMotionPose`, and `events`
   (`session.start`, `idle`, `tool.call`, `turn.complete`) when targeting a
   Claude Code mod.
7. **Inspect while drawing:** `node scripts/inspect.mjs --input rig.json --pose NAME`
   prints each pose's grid split into 2x2 cells next to the glyphs it compiles to.
8. **Look at the motion:** `node scripts/strip.mjs --input rig.json --timeline NAME --count 24 --columns 6`
   writes `records/<name>-<timeline>-0.png` with consecutive frames (a bar
   above each frame shows its hold). Open the PNG with your image reader.
   Fix the worst thing you see, render again. At least three rounds per
   timeline; look for floating, sliding, popping, dead holds, unreadable speed.
9. **Validate (0 errors):** `node scripts/validate.mjs --input rig.json`
   - `cell-colors`: a cell has 3+ tokens. Move a boundary pixel by one
     sub-pixel so each 2x2 cell holds at most 2; do not rely on folding.
   - `pixels-ragged`: pad rows with `.` to equal length.
   - `loop-seam` (warning): end a loop on a pose close to its first frame.
10. **Compile:**
    `node scripts/compile.mjs --input rig.json --target ansi,ink,claude-mod,svg,text --out dist`
    - `ansi`: `dist/<name>.player.mjs`, a standalone player with diffed
      redraws, DEC 2026 (probed with DECRQM) and cursor restore:
      `node dist/<name>.player.mjs <timeline>`.
    - `ink`: `dist/<Name>Mascot.mjs`, a React/Ink component with a fixed height.
    - `claude-mod`: `dist/<name>-mascot/`, a mod that draws the mascot above
      the prompt and reacts to tool calls and turn ends. Check it with
      `claude plugin validate <dir>` and `claude plugin test <dir>`.
    - `svg`: animated SMIL SVGs (1:2 sub-pixels; `--square` for 1:1) plus one per pose.
    - `text`/`json`: glyph snapshots and the compiled bundle.
11. **Preview** in a real terminal: `node scripts/preview.mjs --input rig.json --timeline idle`.

## Beyond frame lists

When a mascot needs many interactions (walking, objects, weather), hand-made
frame lists stop scaling. Build a puppet instead: small authored parts placed
on whole sub-pixels, feet as the source of truth, actions as generators that
change the pose one tick at a time, and checks that fail on floating feet,
sliding and 3-color cells. `references/puppet-acts.md` describes the method
used for Pip in the QuadMotion repository.

## Output

Deliver the validated rig JSON, the compiled artifacts, the validator's
summary, a strip PNG of the main timeline and the preview command. Show the
`text` snapshot of key poses in your reply.

## Troubleshooting

- Glyphs look stretched or have gaps on macOS Terminal.app: the renderer
  switches to bg-fill (solid cells painted as colored spaces) and 16 colors
  automatically; force it with `QUADMOTION_BG_FILL=1`.
- Fragments after partial redraws (some Windows Terminal versions): `QUADMOTION_FULL_REPAINT=1`.
- tmux before 3.7 drops DEC 2026; force with `QUADMOTION_SYNC_OUTPUT=1` only on tmux 3.7+.
- CJK text in overlays takes 2 columns per character; the compiler clips and warns.
- More detail: `references/quadrant-spec.md` (mask table, color rules, terminals).

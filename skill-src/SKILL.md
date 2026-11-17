---
name: quadrant-pixel-animator
description: Designs, validates and compiles 2x2 Unicode quadrant pixel-art mascots and flicker-free terminal animations (fixed-height container, hold timelines, DEC Mode 2026 sync output) into a standalone ANSI player, an Ink component, a Claude Code mod or SVG. Use for terminal sprites, CLI mascots, animated status widgets and Claude Code mods. Not for skeletal 2D rigs (Spine) or 3D.
license: MIT
compatibility: Node.js 20+ (no npm dependencies). Ink output needs react and ink in the target project.
allowed-tools: Bash(node:*) Read Write Edit
---

# Quadrant Pixel Animator

Turns a JSON rig (pixel grids at 2x terminal resolution + palette + hold
timelines) into crisp quadrant-block art (▘ ▝ ▀ ▖ ▌ ▞ ▛ ▗ ▚ ▐ ▜ ▄ ▙ ▟ █). The
scripts do all glyph math; you only ever edit pixel grids.

Paths below are relative to this skill's folder (`scripts/`, `assets/`, `references/`).

## Rules

- Never type quadrant glyphs by hand. Draw poses as rows of single-character
  tokens in the rig; `scripts/compile.mjs` picks the glyphs.
- One token = one sub-pixel. A terminal cell = 2 sub-pixels wide x 2 tall, so a
  canvas of `cols x rows` cells is a grid of `cols*2` characters x `rows*2` lines.
- `.` and space are transparent. Every other token must be in `palette`.
- At most 2 tokens per 2x2 cell (transparent counts). Eyes are a dark token
  inside a body cell (body + eye = 2 colors), which also keeps them visible on
  light terminal themes.
- Create original characters unless the user supplies artwork. Do not
  reproduce trademarked mascots (for example Anthropic's Clawd) or their colors.

## Workflow

1. **Fix the canvas.** Pick `canvas.cols`/`canvas.rows` once; it never changes
   between frames (that is what keeps the screen below from jumping).
   Compact mascot: 9x3 cells (18x6 sub-pixels). Hats, speech bubbles or jump
   arcs: 5 rows. Leave the bottom sub-pixel row empty in the neutral pose so a
   1-sub-pixel crouch fits.
2. **Start from the template.** Copy `assets/starter-companion.rig.json`, rename
   it, change palette and pixels. Format details: `references/rig-format.md`.
3. **Palette.** Each token: `rgb` (true color) and `ansi16` (30-37/90-97
   fallback; `ansi16Bg` defaults to `ansi16 + 10`). Declare the body color
   first: on a tie it becomes the foreground.
4. **Poses.** `pixels` rows, or reuse: `{ "pose": "default", "remap": { "E": "#" } }`
   (blink), `{ "layers": ["body", { "pose": "hat", "dx": 2 }] }` (costumes; `dx`/`dy` in sub-pixels).
   Small motions read best: move one eye sub-pixel for a look, shift the body
   1 sub-pixel for a crouch.
5. **Timelines.** Frames are `{ "pose", "hold" }` over `tickMs` (60 ms typical;
   140-150 ms for mods and sparse status animations). Hold key poses, keep
   in-betweens short. Recipes: `references/timing-guide.md`.
   Set `reducedMotionPose` and `events` (`session.start`, `idle`, `tool.call`,
   `turn.complete`) when targeting a Claude Code mod.
6. **Inspect while drawing:**
   `node scripts/inspect.mjs --input rig.json --pose NAME` prints each pose's
   grid split into 2x2 cells next to the glyphs it compiles to.
7. **Validate (must pass with 0 errors):**
   `node scripts/validate.mjs --input rig.json`
   - `cell-colors`: a cell has 3+ tokens. Move a boundary pixel by one
     sub-pixel so each 2x2 cell holds at most 2; do not rely on folding.
   - `pixels-ragged`: pad rows with `.` to equal length.
   - `loop-seam` (warning): end a loop on a pose close to its first frame.
8. **Compile:**
   `node scripts/compile.mjs --input rig.json --target ansi,ink,claude-mod,svg,text --out dist`
   - `ansi`: `dist/<name>.player.mjs`, a standalone player with diffed
     redraws, DEC 2026 (probed with DECRQM) and cursor restore. Play it with
     `node dist/<name>.player.mjs <timeline>`.
   - `ink`: `dist/<Name>Mascot.mjs`, a React/Ink component with a fixed height.
   - `claude-mod`: `dist/<name>-mascot/`, a mod folder (band above the prompt; the
     timer starts in `session.start`). Check it with `claude plugin validate <dir>`
     and `claude plugin test <dir>` (generated tests in `tests/`).
   - `svg`: animated SMIL SVGs (1:2 sub-pixels; `--square` for 1:1) plus one SVG per pose.
   - `text`/`json`: glyph snapshots and the compiled bundle.
9. **Preview** in a real terminal: `node scripts/preview.mjs --input rig.json --timeline idle`.

## Output

Deliver the validated rig JSON, the compiled artifacts, the validator's
summary, and the preview command. Show the `text` snapshot of key poses in your reply.

## Troubleshooting

- Glyphs look stretched or have gaps on macOS Terminal.app: the renderer
  switches to bg-fill (solid cells painted as colored spaces) and 16 colors
  automatically; force it with `QUADMOTION_BG_FILL=1`.
- Fragments after partial redraws (some Windows Terminal versions): `QUADMOTION_FULL_REPAINT=1`.
- tmux before 3.7 drops DEC 2026; force with `QUADMOTION_SYNC_OUTPUT=1` only on tmux 3.7+.
- CJK text in overlays takes 2 columns per character; the compiler clips and warns.
- More detail: `references/quadrant-spec.md` (mask table, color rules, terminals).

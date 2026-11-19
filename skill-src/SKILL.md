---
name: quadrant-pixel-animator
description: Designs, animates, checks and compiles pixel-art characters and scenes for the terminal and beyond with the QuadMotion engine (bundled), from tiny status-line mascots to detailed full-color characters with outlines, props, particles and weather. Renders to Unicode quadrant glyphs for terminals (flicker-free, DEC 2026), to full-color SVG/PNG for web and desktop, to Ink components and Claude Code mods. Use for terminal sprites, CLI mascots, animated characters, status widgets, small games and Claude Code mods. Not for skeletal 2D rigs (Spine) or 3D.
license: MIT
compatibility: Node.js 20+ (no npm dependencies). Ink output needs react and ink in the target project.
allowed-tools: Bash(node:*) Read Write Edit
---

# Quadrant Pixel Animator

This skill bundles the whole QuadMotion engine (`scripts/lib`): a quadrant
compiler, a puppet stage with a world, props, particles and 19 ready actions,
renderers for terminal, SVG and PNG, and checks. You draw characters as code
or pixel grids in full color; the scripts compile them per output surface and
render frames to PNG so you can see what you made.

Paths below are relative to this skill's folder (`scripts/`, `assets/`, `references/`).

## 1. Choose the surface and the resolution first

Ask (or decide from the task) where the art will be shown, and size it for that.

| Surface | Output | Colors | Typical size |
| --- | --- | --- | --- |
| Terminal (CLI, TUI, Claude Code in a terminal) | quadrant glyphs `▘▝▀▖▌▞▛▗▚▐▜▄▙▟█`, ANSI player, Ink, Claude Code mod | 2 per 2x2 cell, folded automatically | 9x3 cells (status line) to 40x16+ (hero) |
| Web, docs, README, desktop panels | `svg --source`, `strip --view source` PNG | unlimited | any |
| Both | draw once in full color, compile per surface | | |

A cell is 2 sub-pixels wide and 2 tall, and a sub-pixel is twice as tall as it
is wide: a round shape is twice as many sub-pixels wide as tall. Detail needs
room: a face with eye highlights, a muzzle and blush wants a head of about
20x9 sub-pixels (10x5 cells). Do not squeeze a detailed reference into 9x3;
pick the size the reference needs and say what it costs in rows.

## 2. Draw in full color

- Use as many colors as the design needs: outlines, shading, highlights,
  accents. `canvas.outline(token)` adds a 1-sub-pixel contour,
  `canvas.rim(from, to, side)` adds a shade or light edge.
- The terminal can show 2 colors per 2x2 cell. The compiler picks, for every
  cell, the pair of colors that loses the least and maps the rest to the
  nearer one. That is a property of terminal output, not a drawing rule.
  Do not simplify art to satisfy it.
- Check what the terminal keeps: `strip --view compare` draws the full-color
  source beside the terminal result, and prints the terminal fidelity
  (share of colored sub-pixels shown in their own color). 95%+ reads as the
  same picture; when a detail matters and gets lost, move or enlarge it.
- Never type quadrant glyphs by hand; the compiler picks them.

## 3. Pick the path

**A. Character module (default for anything with detail or many actions).**
A character is an ES module that draws itself from a pose state; the stage
supplies the world, movement and 19 ready acts (walk, jump, wave, kick a ball,
catch an apple, rain with an umbrella, night and sleep, typing, tripping, a
heavy crate, and more). Start from `assets/characters/ember.mjs` (a fox kit
with an outline, shading, eye highlights and a cream muzzle). Contract and
method: `references/character-modules.md`.

```bash
node scripts/strip.mjs --module my-character.mjs --act walk-jump --view compare --crop pip --width 30
```

**B. JSON rig (small, simple mascots).** Frame lists of pixel grids with hold
timelines; good for a 9x3 status-line mascot with a few poses. Start from
`assets/starter-companion.rig.json`. Format: `references/rig-format.md`.

```bash
node scripts/strip.mjs --input rig.json --timeline idle --view compare
```

You can also draw whole scenes procedurally (a game screen, widgets, fire,
physics) on the same canvas; see `references/character-modules.md`.

## 4. Act it out

Every action follows the grammar that makes Claude Code's own mascot feel
alive: anticipation (a crouch opposite to the action, with dust) → the action
(a big silhouette change on the release tick) → a held contact (2-3 ticks) →
follow-through (overshoot, squash) → settle back to the neutral pose so actions
chain. Eyes lead: look at a thing before acting on it. Feet are the source of
truth: a planted foot never slides. Recipes and timing: `references/timing-guide.md`.

## 5. Look at every motion

`node scripts/strip.mjs ...` writes `records/<name>-<timeline>-<from>.png`
with consecutive frames (a bar above each shows its hold). Open it with your
image reader. Fix the worst thing you see, render again: three rounds or more
per action. Look for floating, sliding, popping, dead holds, unreadable speed,
and details lost in the terminal view. Judge motion only from these frames,
never from reading code or pixel rows.

Options: `--from N --count N --every N --columns N --cw 8`, `--crop pip --width 30`
(follow the character), `--crop c0,c1`, `--view terminal|source|compare`.

## 6. Check and compile

- Rigs: `node scripts/validate.mjs --input rig.json` must report 0 errors.
  `cell-colors` is a warning (folded cells); set `"cells": "strict"` in the rig
  only when exact 2-color cells are required.
- Character modules: the act checks (grounded, no foot slide, no teleport)
  run on every recorded act; see `references/character-modules.md`.
- Compile, from a rig (`--input rig.json`) or an act (`--act ID [--module file]`):
  `node scripts/compile.mjs --act walk-jump --module my-character.mjs --target ansi,svg,json --out dist`
  - `ansi`: a standalone terminal player with diffed redraws and DEC 2026.
  - `svg`: animated SVG; add `--source` for full color (web, docs, desktop),
    leave it off to show exactly what a terminal shows.
  - `ink`: a React/Ink component with a fixed height.
  - `claude-mod`: a mod drawing the mascot above the prompt (terminal glyphs),
    reacting to tool calls and turn ends; check with `claude plugin validate`
    and `claude plugin test`.
  - `text`, `json`: glyph snapshots and the compiled bundle.
- Preview in a real terminal: `node scripts/preview.mjs --input rig.json --timeline idle`.

## Output

Deliver the character module or rig, the compiled artifacts, a `strip
--view compare` PNG of the main action with its fidelity, and the preview
or play command. Say which surface each artifact is for.

## Rules

- Create original characters unless the user supplies artwork. Do not
  reproduce trademarked mascots (for example Anthropic's Clawd) or their colors.
- When the user gives references, match them: proportions, palette, outline,
  details. Do not fall back to the starter mascot's shapes.

## Troubleshooting

- Glyphs look stretched or have gaps on macOS Terminal.app: the renderer
  switches to bg-fill and 16 colors automatically; force with `QUADMOTION_BG_FILL=1`.
- Fragments after partial redraws (some Windows Terminal versions): `QUADMOTION_FULL_REPAINT=1`.
- tmux before 3.7 drops DEC 2026; force with `QUADMOTION_SYNC_OUTPUT=1` only on tmux 3.7+.
- More detail: `references/quadrant-spec.md` (masks, the color solver, terminals).
- Full color in the Claude Code desktop app (Box grid instead of glyphs): `references/desktop-surface.md`.

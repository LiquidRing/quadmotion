# Quadrant spec

## Mask table

Bit 0 (1) = top-left, bit 1 (2) = top-right, bit 2 (4) = bottom-left,
bit 3 (8) = bottom-right. Set bits use the foreground color; clear bits show the
cell background (or nothing, when the background is transparent).

| Mask | Glyph | Typical use |
| --- | --- | --- |
| 0 | (space) | empty |
| 1 | ▘ | thin foot, arm tip |
| 2 | ▝ | thin foot, arm tip |
| 3 | ▀ | top shelf, head edge |
| 4 | ▖ | crouch foot |
| 5 | ▌ | right silhouette wall |
| 6 | ▞ | diagonal |
| 7 | ▛ | eye cut-out at bottom-right, corner |
| 8 | ▗ | crouch foot |
| 9 | ▚ | diagonal |
| 10 | ▐ | left silhouette wall |
| 11 | ▜ | eye cut-out at bottom-left, corner |
| 12 | ▄ | bottom shelf, squash |
| 13 | ▙ | notch top-right |
| 14 | ▟ | notch top-left |
| 15 | █ | solid fill |

## Color resolution per cell

1. Count tokens in the 2x2 cell (transparent counts).
2. With 1 or 2 tokens nothing is lost. With 3 or 4, every pair is tried and
   the pair with the least color error is kept (weighted RGB distance;
   transparency against a color costs about a mid-grey difference). The
   other sub-pixels take the nearer kept color.
3. If transparent is kept, it is the background and nothing is painted behind
   the glyph. Otherwise the more frequent opaque token is the foreground (ties:
   palette order), so body + one eye pixel compiles to ▛ ▜ ▙ ▟ with the body as
   foreground and the eye as background.
4. Folding is reported (`cell-colors` warning, or an error with
   `"cells": "strict"`); `strip --view compare` shows its cost and prints the
   terminal fidelity. Full-color outputs (`svg --source`, `strip --view source`)
   do not fold at all.

## Why 2x2 quadrants

A terminal cell is about 1:2 (width:height). Full blocks give tall pixels;
half blocks (▀ ▄) give square pixels but only one column per cell. Quadrants
double both axes: a 9x3 cell mascot becomes an 18x6 grid where a 1-sub-pixel
gap between legs, or a 1-sub-pixel eye shift, still reads. Sextants (2x3,
Unicode 13) need recent fonts or terminals that draw block glyphs
themselves, so they are not used here.

## Rendering

- The sprite keeps a fixed height. The renderer moves the cursor up, rewrites
  only changed rows (`CR`, `EL`), skips unchanged rows, and parks the cursor
  below the sprite.
- With DEC Mode 2026 the frame goes between `ESC[?2026h` and `ESC[?2026l`, so
  the terminal applies it at once. Support is probed with DECRQM
  (`ESC[?2026$p` -> `ESC[?2026;Ps$y`, Ps 1 or 2 = supported). Terminals that
  don't know the mode ignore it.
- Adjacent cells with equal colors share one SGR sequence.
- Lines never wrap: if the terminal is narrower than the canvas, the player draws nothing.

## Terminals

| Terminal | Colors | DEC 2026 | Notes |
| --- | --- | --- | --- |
| Ghostty, WezTerm, kitty, foot | 24-bit | yes | draw block glyphs themselves |
| iTerm2 | 24-bit | recent versions | |
| Windows Terminal | 24-bit | version-dependent | `QUADMOTION_FULL_REPAINT=1` if fragments remain |
| VS Code (xterm.js) | 24-bit | recent versions | |
| tmux < 3.7 | config-dependent | no | renderer turns sync off under `$TMUX` |
| Apple Terminal | 16 colors used | limited | bg-fill: solid cells drawn as colored spaces to avoid row seams |

Env switches: `QUADMOTION_TRUECOLOR`, `QUADMOTION_SYNC_OUTPUT`,
`QUADMOTION_FULL_REPAINT`, `QUADMOTION_BG_FILL`, `QUADMOTION_REDUCED_MOTION`, `NO_COLOR`.

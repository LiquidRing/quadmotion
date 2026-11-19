// Character modules: play any character on the stage, not just Pip.
//
// A character module is an ES module that exports:
//   name      a kebab-case id
//   palette   { token: "#rrggbb" | [r,g,b] | { rgb, ansi16 } } (any one-char tokens)
//   draw(canvas, state) -> box   draws the character for one tick, see below
//   acts      optional { id: act } with the same contract as src/stage/acts/basics.mjs
//   rows, cols optional stage size in cells (default 12 x 64) for taller characters
//
// draw() receives Pip's state shape, so every existing action (walkTo, jump,
// wave, the act groups) drives the new character too:
//   { x, ground, facing, y, legLen, body: "s2"|"s1"|"n"|"b"|"t1"|"t2", eyes,
//     look, lookY, mouth, blush, armL, armR, antenna, bulb, feet: [{ x, lift }] }
// Unknown names (an act's custom eye or arm) should fall back to a default.
// It must return { x, left, right, top, footY, bodyTop, bodyBottom, feet }:
// the character's bounding box and feet ({ x, y, planted }), used by the checks.
//
// Draw in full color: outlines, shading, highlights. The terminal output folds
// cells with 3+ colors to the closest 2; look at it with `strip --view compare`.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function loadCharacter(file) {
  const mod = await import(pathToFileURL(resolve(file)).href);
  for (const k of ["name", "palette", "draw"]) {
    if (!mod[k]) throw new Error(`${file}: a character module must export "${k}"`);
  }
  return { name: mod.name, palette: mod.palette, draw: mod.draw, acts: mod.acts ?? {}, rows: mod.rows, cols: mod.cols };
}

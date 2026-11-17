import { test } from "node:test";
import assert from "node:assert/strict";
import { QUADRANT_GLYPHS, GLYPH_TO_MASK, charWidth } from "../src/core/glyphs.mjs";
import { compileGridToFrame, applyOverlays, frameToAnsiLines, frameToText } from "../src/core/quad-engine.mjs";

const palette = {
  B: { key: "B", rgb: [40, 180, 160], ansi16: 96, ansi16Bg: 106, priority: 0 },
  E: { key: "E", rgb: [10, 10, 20], ansi16: 30, ansi16Bg: 40, priority: 1 },
  R: { key: "R", rgb: [220, 40, 40], ansi16: 91, ansi16Bg: 101, priority: 2 },
  r: { key: "r", rgb: [200, 60, 50], ansi16: 31, ansi16Bg: 41, priority: 3 },
};

/** 2x2 grid from a mask: bit set -> `on`, clear -> `off`. */
function cellGrid(mask, on = "B", off = null) {
  const at = (bit) => ((mask >> bit) & 1 ? on : off);
  return [
    [at(0), at(1)],
    [at(2), at(3)],
  ];
}

test("glyph table has 16 distinct quadrant glyphs in bit order", () => {
  assert.equal(QUADRANT_GLYPHS.length, 16);
  assert.equal(new Set(QUADRANT_GLYPHS).size, 16);
  assert.deepEqual([...QUADRANT_GLYPHS].map((g) => g.codePointAt(0).toString(16)), [
    "20", "2598", "259d", "2580", "2596", "258c", "259e", "259b",
    "2597", "259a", "2590", "259c", "2584", "2599", "259f", "2588",
  ]);
  for (let m = 0; m < 16; m++) assert.equal(GLYPH_TO_MASK[QUADRANT_GLYPHS[m]], m);
});

test("every one of the 16 masks compiles to its glyph (one color on transparent)", () => {
  for (let mask = 0; mask < 16; mask++) {
    const f = compileGridToFrame(cellGrid(mask), palette);
    const cell = f.cells[0][0];
    assert.equal(cell.mask, mask, `mask ${mask}`);
    assert.equal(cell.glyph, QUADRANT_GLYPHS[mask]);
    assert.equal(cell.fg, mask === 0 ? null : "B");
    assert.equal(cell.bg, null, "transparent is never painted");
    assert.equal(f.warnings.length, 0);
  }
});

test("body + one eye pixel: body is foreground, eye is background (▛ ▜ ▙ ▟)", () => {
  const expect = { 0: "▟", 1: "▙", 2: "▜", 3: "▛" }; // eye at TL,TR,BL,BR
  for (let eye = 0; eye < 4; eye++) {
    const mask = 15 & ~(1 << eye);
    const f = compileGridToFrame(cellGrid(mask, "B", "E"), palette);
    const cell = f.cells[0][0];
    assert.equal(cell.glyph, expect[eye]);
    assert.equal(cell.fg, "B");
    assert.equal(cell.bg, "E");
  }
});

test("2/2 tie between opaque colors is broken by palette order", () => {
  const f = compileGridToFrame([["E", "E"], ["B", "B"]], palette);
  // B is declared first -> foreground; B occupies the bottom row -> ▄
  assert.equal(f.cells[0][0].glyph, "▄");
  assert.equal(f.cells[0][0].fg, "B");
  assert.equal(f.cells[0][0].bg, "E");
});

test("a third color folds into the nearest kept color and is reported", () => {
  // B, B, R, r -> keeps B (2) and R (1 by priority over r); r is closer to R.
  const f = compileGridToFrame([["B", "B"], ["R", "r"]], palette);
  const cell = f.cells[0][0];
  assert.equal(f.warnings.length, 1);
  assert.equal(f.warnings[0].code, "cell-colors");
  assert.deepEqual([f.warnings[0].col, f.warnings[0].row], [0, 0]);
  assert.equal(cell.fg, "B");
  assert.equal(cell.bg, "R");
  assert.equal(cell.glyph, "▀"); // top row foreground
});

test("three colors with transparency keep the transparent background", () => {
  const f = compileGridToFrame([[null, "B"], ["B", "E"]], palette);
  assert.equal(f.warnings.length, 1);
  assert.equal(f.cells[0][0].bg, null);
  assert.equal(f.cells[0][0].fg, "B");
});

test("odd grid sizes are rejected", () => {
  assert.throws(() => compileGridToFrame([["B", "B", "B"], ["B", "B", "B"]], palette), /even/);
});

test("ANSI lines: truecolor, ansi16, RLE runs and no-color", () => {
  const grid = [
    ["B", "B", "B", "B", "B", "E"],
    ["B", "B", "B", "B", "B", "B"],
  ];
  const f = compileGridToFrame(grid, palette);
  assert.deepEqual(frameToText(f), ["██▙"]);
  const [tc] = frameToAnsiLines(f, palette, { trueColor: true });
  assert.equal(tc, "\x1b[38;2;40;180;160m██\x1b[0m\x1b[38;2;40;180;160;48;2;10;10;20m▛\x1b[0m".replace("▛", "▙"));
  const [a16] = frameToAnsiLines(f, palette, { trueColor: false });
  assert.equal(a16, "\x1b[96m██\x1b[0m\x1b[96;40m▙\x1b[0m");
  const [plain] = frameToAnsiLines(f, palette, { noColor: true });
  assert.equal(plain, "██▙");
});

test("Apple Terminal bg-fill paints solid cells as colored spaces, no halo on edges", () => {
  const f = compileGridToFrame([["B", "B", null, "B"], ["B", "B", null, "B"]], palette);
  const [line] = frameToAnsiLines(f, palette, { trueColor: false, isAppleTerminal: true });
  assert.equal(line, "\x1b[106m \x1b[0m\x1b[96m▐\x1b[0m");
});

test("overlays: CJK takes two columns, out-of-bounds text is clipped with a warning", () => {
  const f = compileGridToFrame(Array.from({ length: 2 }, () => new Array(8).fill(null)), palette);
  assert.equal(charWidth("閃".codePointAt(0)), 2);
  const o = applyOverlays(f, [{ text: "閃身", col: 0, row: 0, fg: "R" }], palette);
  assert.deepEqual(frameToText(o), ["閃身"]);
  const clipped = applyOverlays(f, [{ text: "閃身步", col: 0, row: 0 }], palette);
  assert.ok(clipped.warnings.some((w) => w.code === "overlay-clipped"));
  assert.deepEqual(frameToText(clipped), ["閃身"]);
});

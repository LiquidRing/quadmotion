// Quadrant glyph table and character-width helpers.
//
// Each terminal cell holds a 2x2 block of sub-pixels encoded as a 4-bit mask:
//   bit 0 (1) = top-left, bit 1 (2) = top-right,
//   bit 2 (4) = bottom-left, bit 3 (8) = bottom-right.
// A set bit is painted with the cell's foreground color, a clear bit shows the
// cell's background (or the terminal background when the cell has none).

export const QUADRANT_GLYPHS = Object.freeze([
  " ", "▘", "▝", "▀", // 0 ' '  1 ▘  2 ▝  3 ▀
  "▖", "▌", "▞", "▛", // 4 ▖  5 ▌  6 ▞  7 ▛
  "▗", "▚", "▐", "▜", // 8 ▗  9 ▚ 10 ▐ 11 ▜
  "▄", "▙", "▟", "█", // 12 ▄ 13 ▙ 14 ▟ 15 █
]);

/** Reverse lookup glyph -> mask (used by tests and the decompiler). */
export const GLYPH_TO_MASK = Object.freeze(
  Object.fromEntries(QUADRANT_GLYPHS.map((g, i) => [g, i])),
);

// East Asian Wide / Fullwidth ranges plus common emoji blocks. Good enough for
// callouts next to a sprite; not a full wcwidth implementation.
const WIDE_RANGES = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec],
  [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x2fffd], [0x30000, 0x3fffd],
];

/** Terminal column width of one code point: 0, 1 or 2. */
export function charWidth(cp) {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp >= 0x300 && cp <= 0x36f) return 0; // combining diacritics
  if (cp === 0x200b || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp >= lo && cp <= hi) return 2;
  }
  return 1;
}


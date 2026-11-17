// Quadrant compiler, two-color cell solver, run-length SGR writer and
// synchronized (DEC Mode 2026) diff renderer.

import { QUADRANT_GLYPHS, charWidth } from "./glyphs.mjs";

export const SYNC_BEGIN = "\x1b[?2026h";
export const SYNC_END = "\x1b[?2026l";
export const CURSOR_HIDE = "\x1b[?25l";
export const CURSOR_SHOW = "\x1b[?25h";
export const SGR_RESET = "\x1b[0m";

const T = "__transparent__";

function rgbDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  // Weighted ("redmean"-style) approximation of perceived distance.
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

/**
 * Compile a pixel grid (2x resolution, tokens or null) into terminal cells.
 *
 * Rules per 2x2 cell:
 *  - at most two colors survive (transparent counts as a color);
 *  - transparent, when present, is always the background (no fill behind);
 *  - of two opaque colors the more frequent one is the foreground, ties broken
 *    by palette order, so a body cell with one eye pixel compiles to ▛ / ▜
 *    (body foreground, eye background) instead of an inverted ▗;
 *  - a third or fourth color is folded into the nearest kept color and reported.
 *
 * @returns {{ cols:number, rows:number, cells:Array<Array<{glyph:string,mask:number,fg:string|null,bg:string|null,wide?:boolean,skip?:boolean}>>, warnings:Array }}
 */
export function compileGridToFrame(grid, palette, opts = {}) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error(`Grid dimensions (${width}x${height}) must be even multiples of 2.`);
  }
  // On equal counts transparent ranks first: dropping it would paint a halo.
  const priority = (key) => (key === T ? -1 : (palette[key]?.priority ?? 1e6));
  const cols = width / 2;
  const rows = height / 2;
  const warnings = [];
  const cells = [];

  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      const py = r * 2;
      const px = c * 2;
      const sub = [
        grid[py][px] ?? T,
        grid[py][px + 1] ?? T,
        grid[py + 1][px] ?? T,
        grid[py + 1][px + 1] ?? T,
      ];
      const counts = new Map();
      for (const k of sub) counts.set(k, (counts.get(k) ?? 0) + 1);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || priority(a[0]) - priority(b[0]));

      let kept = ranked.slice(0, 2).map(([k]) => k);
      if (ranked.length > 2) {
        warnings.push({
          code: "cell-colors",
          col: c,
          row: r,
          subpixel: { x: px, y: py },
          colorsFound: ranked.map(([k]) => (k === T ? "transparent" : k)),
          message: `Cell (${c},${r}) [sub-pixels x=${px}..${px + 1}, y=${py}..${py + 1}] has ${ranked.length} colors (${ranked.map(([k]) => (k === T ? "transparent" : k)).join(", ")}); folded to 2. Move a boundary sub-pixel by 1 instead.`,
        });
      }

      let fg;
      let bg;
      if (kept.length === 1) {
        fg = kept[0] === T ? null : kept[0];
        bg = null;
      } else if (kept.includes(T)) {
        fg = kept.find((k) => k !== T);
        bg = null;
      } else {
        // Both opaque: ranked order already puts majority (then palette order) first.
        fg = kept[0];
        bg = kept[1];
      }

      const resolveKey = (k) => {
        if (k === fg) return "fg";
        if (bg !== null ? k === bg : k === T) return "bg";
        // Third/fourth color: fold into the nearest kept color.
        if (k === T) return bg === null ? "bg" : "bg";
        if (bg === null) return "fg"; // only one opaque kept: opaque wins
        const tok = palette[k];
        const dFg = rgbDistance(tok.rgb, palette[fg].rgb);
        const dBg = rgbDistance(tok.rgb, palette[bg].rgb);
        return dFg <= dBg ? "fg" : "bg";
      };

      let mask = 0;
      if (fg !== null) {
        for (let i = 0; i < 4; i++) {
          if (resolveKey(sub[i]) === "fg") mask |= 1 << i;
        }
      }
      if (mask === 15) bg = null; // background invisible under a full block
      if (mask === 0) fg = null;
      line.push({ glyph: QUADRANT_GLYPHS[mask], mask, fg, bg });
    }
    cells.push(line);
  }
  return { cols, rows, cells, warnings };
}

/**
 * Draw text overlays (speech bubbles, trails ░▒▓, labels) onto compiled cells.
 * Wide characters (CJK, emoji) take two cells. Returns a new frame.
 * overlay: { text, col, row, fg?: paletteKey, bg?: paletteKey }
 */
export function applyOverlays(frame, overlays = [], palette = {}) {
  if (!overlays.length) return frame;
  const cells = frame.cells.map((line) => line.map((cell) => ({ ...cell })));
  const warnings = [...frame.warnings];
  for (const ov of overlays) {
    let col = ov.col ?? 0;
    const row = ov.row ?? 0;
    if (row < 0 || row >= frame.rows) {
      warnings.push({ code: "overlay-clipped", message: `Overlay "${ov.text}" row ${row} is outside 0..${frame.rows - 1}.` });
      continue;
    }
    for (const ch of String(ov.text ?? "")) {
      const w = charWidth(ch.codePointAt(0));
      if (w === 0) continue;
      if (col < 0 || col + w > frame.cols) {
        warnings.push({ code: "overlay-clipped", message: `Overlay "${ov.text}" clipped at column ${col} (canvas is ${frame.cols} wide; wide characters take 2 columns).` });
        break;
      }
      const fg = ov.fg && palette[ov.fg] ? ov.fg : null;
      const bg = ov.bg && palette[ov.bg] ? ov.bg : null;
      cells[row][col] = { glyph: ch, mask: -1, fg, bg, wide: w === 2 };
      if (w === 2) cells[row][col + 1] = { glyph: "", mask: -1, fg, bg, skip: true };
      col += w;
    }
  }
  return { ...frame, cells, warnings };
}

/** Plain glyph rows (no color) — handy for snapshots and diagnostics. */
export function frameToText(frame) {
  return frame.cells.map((line) => line.filter((c) => !c.skip).map((c) => c.glyph).join(""));
}

function sgrFor(cell, palette, caps) {
  const codes = [];
  const fg = cell.fg ? palette[cell.fg] : null;
  const bg = cell.bg ? palette[cell.bg] : null;
  if (fg) codes.push(caps.trueColor ? `38;2;${fg.rgb[0]};${fg.rgb[1]};${fg.rgb[2]}` : String(fg.ansi16));
  if (bg) codes.push(caps.trueColor ? `48;2;${bg.rgb[0]};${bg.rgb[1]};${bg.rgb[2]}` : String(bg.ansi16Bg));
  return codes.length ? `\x1b[${codes.join(";")}m` : "";
}

/**
 * Apple Terminal ("bg-fill"): full blocks can show seams between rows when the
 * line height is not exactly 1.0, so solid cells are painted as spaces with a
 * background color instead of █ glyphs.
 */
function bgFillCell(cell) {
  if (cell.mask === 15 && cell.fg) return { ...cell, glyph: " ", bg: cell.fg, fg: null };
  return cell;
}

/**
 * Turn a compiled frame into one ANSI string per terminal row. Adjacent cells
 * with the same colors share one SGR sequence (run-length encoding).
 */
export function frameToAnsiLines(frame, palette, caps = {}) {
  return frame.cells.map((line) => {
    let out = "";
    let current = ""; // current SGR string ("" = default colors)
    for (let cell of line) {
      if (cell.skip) continue;
      if (caps.noColor) {
        out += cell.glyph;
        continue;
      }
      if (caps.isAppleTerminal || caps.bgFill) cell = bgFillCell(cell);
      const sgr = sgrFor(cell, palette, caps);
      if (sgr !== current) {
        if (current) out += SGR_RESET;
        out += sgr;
        current = sgr;
      }
      out += cell.glyph;
    }
    if (current) out += SGR_RESET;
    return out;
  });
}

/**
 * Build the byte payload that moves the sprite from `prevLines` to `lines` in
 * place. The cursor is expected to rest on the line just below the sprite
 * (where the first draw leaves it) and is returned there.
 *
 * Only changed rows are rewritten; unchanged rows are skipped with one cursor
 * move. With caps.syncOutput the payload is wrapped in DEC Mode 2026 so the
 * terminal applies the whole frame atomically. caps.fullRepaint rewrites
 * every row (for terminals that leave fragments after partial updates).
 */
export function renderSynchronizedFrame(lines, prevLines, caps = {}) {
  const height = lines.length;
  const chunks = [];
  const initial = !prevLines || prevLines.length !== height;
  if (initial) {
    for (const line of lines) chunks.push(`${line}\n`);
  } else {
    let changed = false;
    const body = [];
    let skip = 0;
    for (let i = 0; i < height; i++) {
      if (caps.fullRepaint || prevLines[i] !== lines[i]) {
        if (skip) body.push(`\x1b[${skip}B`);
        skip = 0;
        body.push(`\r\x1b[2K${lines[i]}\r`);
        changed = true;
        skip = 1; // move to the next row before the next write
      } else {
        skip++;
      }
    }
    if (!changed) return { payload: "", lines };
    if (skip) body.push(`\x1b[${skip}B`);
    chunks.push(`\x1b[${height}A`, ...body);
  }
  let payload = chunks.join("");
  if (caps.syncOutput) payload = SYNC_BEGIN + payload + SYNC_END;
  return { payload, lines };
}

// Dependency-free PNG rendering of compiled frames, at terminal aspect
// (a cell is 1:2, each quadrant 1:2). Used by tools/strip.mjs to *look* at
// animation frame by frame, and by tests.

import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode an RGB image (Uint8Array w*h*3) as PNG. */
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((v, i) => (raw[y * (width * 3 + 1) + 1 + i] = v));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const MASK = { " ": 0, "▘": 1, "▝": 2, "▀": 3, "▖": 4, "▌": 5, "▞": 6, "▛": 7, "▗": 8, "▚": 9, "▐": 10, "▜": 11, "▄": 12, "▙": 13, "▟": 14, "█": 15 };
const SHADE = { "░": 0.25, "▒": 0.5, "▓": 0.75 };

export class Raster {
  constructor(width, height, bg = [14, 16, 22]) {
    this.width = width;
    this.height = height;
    this.rgb = new Uint8Array(width * height * 3);
    this.fill(0, 0, width, height, bg);
  }
  fill(x, y, w, h, c) {
    for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++) {
        const o = (j * this.width + i) * 3;
        this.rgb[o] = c[0];
        this.rgb[o + 1] = c[1];
        this.rgb[o + 2] = c[2];
      }
    }
  }
  png() {
    return encodePng(this.width, this.height, this.rgb);
  }
}

/**
 * Draw one compiled frame at (ox, oy). cw = cell width in px (cell height = 2*cw).
 * Overlay glyphs: shades are dithered, anything else is a small block in its color.
 */
export function drawFrame(raster, frame, palette, ox, oy, cw = 6, opts = {}) {
  cw = Math.max(2, Math.round(cw / 2) * 2); // even, so quadrants are whole pixels
  const ch = cw * 2;
  const hw = cw / 2;
  const hh = cw;
  const col = (k) => (k && palette[k] ? palette[k].rgb : null);
  if (opts.frameBg) raster.fill(ox, oy, frame.cols * cw, frame.rows * ch, opts.frameBg);
  frame.cells.forEach((line, r) => {
    line.forEach((cell, c) => {
      if (cell.skip) return;
      const x = ox + c * cw;
      const y = oy + r * ch;
      const fg = col(cell.fg);
      const bg = col(cell.bg);
      if (bg) raster.fill(x, y, cw, ch, bg);
      const mask = MASK[cell.glyph];
      if (mask === undefined) {
        const s = SHADE[cell.glyph];
        const c2 = fg ?? [210, 214, 230];
        if (s) {
          for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (((i * 7 + j * 3) % 4) / 4 < s) raster.fill(x + i, y + j, 1, 1, c2);
        } else if (cell.glyph.trim()) {
          raster.fill(x + Math.floor(cw / 4), y + Math.floor(ch / 3), Math.ceil(cw / 2), Math.ceil(ch / 3), c2);
        }
        return;
      }
      if (!fg) return;
      if (mask & 1) raster.fill(x, y, hw, hh, fg);
      if (mask & 2) raster.fill(x + hw, y, cw - hw, hh, fg);
      if (mask & 4) raster.fill(x, y + hh, hw, ch - hh, fg);
      if (mask & 8) raster.fill(x + hw, y + hh, cw - hw, ch - hh, fg);
    });
  });
  if (opts.grid) {
    const g = [40, 44, 60];
    for (let r = 0; r <= frame.rows; r++) raster.fill(ox, oy + r * ch, frame.cols * cw, 1, g);
  }
}

/**
 * Contact strip: frames laid out in a grid, left to right, top to bottom,
 * each with a thin colored bar on top whose length encodes its hold (ms).
 */
export function stripPng(frames, palette, { cw = 6, columns = 4, gap = 6, marks = [] } = {}) {
  cw = Math.max(2, Math.round(cw / 2) * 2);
  const f0 = frames[0].frame;
  const fw = f0.cols * cw;
  const fh = f0.rows * cw * 2;
  const rows = Math.ceil(frames.length / columns);
  const W = columns * (fw + gap) + gap;
  const H = rows * (fh + gap + 4) + gap;
  const r = new Raster(W, H, [30, 33, 44]);
  frames.forEach((f, i) => {
    const x = gap + (i % columns) * (fw + gap);
    const y = gap + Math.floor(i / columns) * (fh + gap + 4);
    const holdPx = Math.min(fw, Math.round((f.durationMs / 1000) * fw));
    r.fill(x, y, holdPx, 2, marks.includes(i) ? [250, 204, 72] : [64, 192, 168]);
    drawFrame(r, f.frame, palette, x, y + 4, cw, { frameBg: [8, 9, 13] });
  });
  return r.png();
}

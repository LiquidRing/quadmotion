// SVG exporter with SMIL animation. Draws the *compiled* cells (after
// quantization), so the SVG matches the terminal pixel for pixel.
// Each sub-pixel is a 1x2 rect (a terminal cell is ~1:2), or 1x1 with square.

import { toBundle } from "../core/pipeline.mjs";

const hex = (t) => `#${t.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Rects for one compiled frame; horizontal runs of one color are merged. */
function frameShapes(frame, palette, px, py) {
  const out = [];
  const subRows = frame.rows * 2;
  const subCols = frame.cols * 2;
  const color = Array.from({ length: subRows }, () => new Array(subCols).fill(null));
  const texts = [];
  frame.cells.forEach((line, r) => {
    line.forEach((cell, c) => {
      if (cell.skip) return;
      if (cell.mask < 0) {
        // overlay text glyph
        texts.push({ c, r, cell });
        if (cell.bg) for (let i = 0; i < 4; i++) color[r * 2 + (i >> 1)][c * 2 + (i & 1)] = cell.bg;
        return;
      }
      for (let i = 0; i < 4; i++) {
        const on = (cell.mask >> i) & 1;
        const key = on ? cell.fg : cell.bg;
        if (key) color[r * 2 + (i >> 1)][c * 2 + (i & 1)] = key;
      }
    });
  });
  for (let y = 0; y < subRows; y++) {
    let x = 0;
    while (x < subCols) {
      const key = color[y][x];
      if (!key) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < subCols && color[y][x + w] === key) w++;
      out.push(`<rect x="${x * px}" y="${y * py}" width="${w * px}" height="${py}" fill="${hex(palette[key])}"/>`);
      x += w;
    }
  }
  for (const { c, r, cell } of texts) {
    const fill = cell.fg ? hex(palette[cell.fg]) : "currentColor";
    const w = cell.wide ? 4 * px : 2 * px;
    out.push(
      `<text x="${c * 2 * px + w / 2}" y="${(r * 2 + 1.6) * py}" font-size="${2 * py * 0.9}" text-anchor="middle" font-family="monospace" fill="${fill}">${esc(cell.glyph)}</text>`,
    );
  }
  return out.join("");
}

/**
 * @param compiled  compileRig() result
 * @param opts { timeline?: name, square?: boolean, scale?: number, clockSync?: boolean }
 */
export function generateSvg(compiled, opts = {}) {
  const b = toBundle(compiled);
  const palette = b.rig.palette;
  const scale = opts.scale ?? 8;
  const px = 1;
  const py = opts.square ? 1 : 2;
  const W = b.rig.cols * 2 * px;
  const H = b.rig.rows * 2 * py;
  const name = opts.timeline ?? b.rig.defaultTimeline;
  const tl = b.timelines[name];
  if (!tl) throw new Error(`Unknown timeline "${name}".`);
  const total = tl.frames.reduce((s, f) => s + f.durationMs, 0);
  const dur = `${(total / 1000).toFixed(3)}s`;
  const repeat = tl.loop ? `repeatCount="indefinite"` : `repeatCount="1" fill="freeze"`;

  // One group per distinct frame content, shown during its time slots.
  const groups = new Map(); // shapes -> [ [start,end], ... ]
  let t = 0;
  for (const f of tl.frames) {
    const shapes = frameShapes(f.frame, palette, px, py);
    if (!groups.has(shapes)) groups.set(shapes, []);
    groups.get(shapes).push([t / total, (t + f.durationMs) / total]);
    t += f.durationMs;
  }
  const animGroups = [...groups.entries()].map(([shapes, slots], gi) => {
    // Build discrete keyTimes: visible within slots, hidden elsewhere.
    const points = [];
    for (const [s, e] of slots) {
      points.push([s, "visible"]);
      if (e < 1) points.push([e, "hidden"]);
    }
    points.sort((a, b) => a[0] - b[0]);
    if (points[0][0] > 0) points.unshift([0, "hidden"]);
    // Collapse duplicates at the same time (keep the later state).
    const merged = [];
    for (const p of points) {
      if (merged.length && Math.abs(merged[merged.length - 1][0] - p[0]) < 1e-9) merged[merged.length - 1] = p;
      else merged.push(p);
    }
    const keyTimes = merged.map((p) => +p[0].toFixed(6)).join(";");
    const values = merged.map((p) => p[1]).join(";");
    // fill="freeze" on one-shot timelines keeps the final frame's group shown.
    return `<g class="qm-anim" visibility="${merged[0][1]}"><animate attributeName="visibility" dur="${dur}" calcMode="discrete" keyTimes="${keyTimes}" values="${values}" ${repeat}/>${shapes}</g>`;
  });

  const still = frameShapes(b.poses[b.rig.reducedMotionPose], palette, px, py);
  const sync = opts.clockSync !== false && tl.loop
    ? `<script><![CDATA[(function(){var s=document.documentElement;if(s.setCurrentTime){s.setCurrentTime((Date.now()%${total})/1000);}})();]]></script>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * scale}" height="${H * scale}" shape-rendering="crispEdges" role="img" aria-label="${esc(b.rig.name)} — ${esc(name)}">
<title>${esc(b.rig.name)} — ${esc(name)}</title>
<style>.qm-static{display:none}@media (prefers-reduced-motion: reduce){.qm-anim{display:none}.qm-static{display:inline}}</style>
${opts.background ? `<rect width="${W}" height="${H}" fill="${esc(opts.background)}"/>` : ""}
<g class="qm-static">${still}</g>
${animGroups.join("\n")}
${sync}
</svg>
`;
}

/** Static SVG of one pose. */
export function generatePoseSvg(compiled, pose, opts = {}) {
  const b = toBundle(compiled);
  const scale = opts.scale ?? 8;
  const py = opts.square ? 1 : 2;
  const W = b.rig.cols * 2;
  const H = b.rig.rows * 2 * py;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * scale}" height="${H * scale}" shape-rendering="crispEdges">${frameShapes(b.poses[pose], b.rig.palette, 1, py)}</svg>\n`;
}

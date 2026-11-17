// Rig model: palette + canvas + poses (pixel grids, layered) + hold timelines.
//
// A rig is plain JSON. Poses are authored as rows of single-character tokens at
// 2x terminal resolution (two sub-pixel columns and two sub-pixel rows per
// terminal cell). "." and " " are always transparent.

export const TRANSPARENT_CHARS = Object.freeze([".", " "]);

export class RigError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "RigError";
    this.issues = issues;
  }
}

/** Helper for authoring timelines in code: hold("jump", 6). */
export function hold(pose, ticks = 1, extra = {}) {
  return { pose, hold: ticks, ...extra };
}

function isTransparentChar(ch) {
  return TRANSPARENT_CHARS.includes(ch);
}

/**
 * Normalize a palette. Keys are single characters; declaration order is the
 * tie-break priority used by the compiler.
 */
export function normalizePalette(raw, issues) {
  const palette = {};
  const order = [];
  for (const [key, tok] of Object.entries(raw ?? {})) {
    if ([...key].length !== 1) {
      issues.push({ level: "error", code: "palette-key", message: `Palette key "${key}" must be exactly one character.` });
      continue;
    }
    if (tok?.transparent || isTransparentChar(key)) {
      continue; // transparent tokens are implicit
    }
    const rgb = tok?.rgb;
    const okRgb = Array.isArray(rgb) && rgb.length === 3 && rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    if (!okRgb) {
      issues.push({ level: "error", code: "palette-rgb", message: `Palette "${key}" needs rgb: [r, g, b] with integers 0..255.` });
      continue;
    }
    const ansi16 = tok.ansi16;
    const okAnsi = Number.isInteger(ansi16) && ((ansi16 >= 30 && ansi16 <= 37) || (ansi16 >= 90 && ansi16 <= 97));
    if (!okAnsi) {
      issues.push({ level: "error", code: "palette-ansi16", message: `Palette "${key}" needs ansi16 foreground code 30..37 or 90..97 (got ${ansi16}).` });
      continue;
    }
    palette[key] = {
      key,
      name: tok.name ?? key,
      rgb: [rgb[0], rgb[1], rgb[2]],
      ansi16,
      ansi16Bg: Number.isInteger(tok.ansi16Bg) ? tok.ansi16Bg : ansi16 + 10,
      priority: order.length,
    };
    order.push(key);
  }
  return { palette, order };
}

function emptyGrid(width, height) {
  return Array.from({ length: height }, () => new Array(width).fill(null));
}

/** Parse rows of characters into a sparse token grid. */
function parseRows(rows, palette, where, issues) {
  if (!Array.isArray(rows) || rows.some((r) => typeof r !== "string")) {
    issues.push({ level: "error", code: "pixels-type", message: `${where}: pixels must be an array of strings.`, where });
    return [];
  }
  const width = Math.max(0, ...rows.map((r) => [...r].length));
  return rows.map((row, y) => {
    const chars = [...row];
    if (chars.length !== width) {
      issues.push({ level: "error", code: "pixels-ragged", message: `${where}: row ${y} has ${chars.length} sub-pixels, expected ${width}. Pad with ".".`, where });
    }
    return chars.map((ch, x) => {
      if (isTransparentChar(ch)) return null;
      if (!palette[ch]) {
        issues.push({ level: "error", code: "pixels-unknown-token", message: `${where}: unknown token "${ch}" at sub-pixel (${x},${y}).`, where });
        return null;
      }
      return ch;
    });
  });
}

/** Stamp `src` onto `dst` at (dx, dy); transparent pixels pass through. */
function stamp(dst, src, dx, dy, remap, where, issues) {
  const H = dst.length;
  const W = dst[0]?.length ?? 0;
  let clipped = 0;
  for (let y = 0; y < src.length; y++) {
    for (let x = 0; x < src[y].length; x++) {
      let tok = src[y][x];
      if (tok && remap && Object.hasOwn(remap, tok)) {
        tok = isTransparentChar(remap[tok]) ? null : remap[tok];
      }
      if (tok == null) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) {
        clipped++;
        continue;
      }
      dst[ty][tx] = tok;
    }
  }
  if (clipped > 0) {
    issues.push({ level: "error", code: "pose-clipped", message: `${where}: ${clipped} sub-pixel(s) fall outside the ${W}x${H} canvas.`, where });
  }
}

/**
 * Load and normalize a rig. Collects issues instead of throwing where it can;
 * throws RigError only when the rig cannot be used at all.
 */
export function loadRig(raw) {
  const issues = [];
  if (!raw || typeof raw !== "object") throw new RigError("Rig must be a JSON object.");
  const name = typeof raw.name === "string" && raw.name ? raw.name : "mascot";
  const cols = raw.canvas?.cols;
  const rows = raw.canvas?.rows;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new RigError("canvas.cols and canvas.rows must be positive integers (terminal cells).");
  }
  const width = cols * 2;
  const height = rows * 2;
  const { palette, order } = normalizePalette(raw.palette, issues);

  const poseDefs = raw.poses ?? {};
  const resolved = new Map();
  const resolving = new Set();

  function resolveLayer(layer, where) {
    // layer: "poseName" | { pose?, pixels?, dx?, dy?, remap? }
    const spec = typeof layer === "string" ? { pose: layer } : (layer ?? {});
    const dx = Number.isInteger(spec.dx) ? spec.dx : 0;
    const dy = Number.isInteger(spec.dy) ? spec.dy : 0;
    let src;
    if (spec.pixels) {
      src = parseRows(spec.pixels, palette, where, issues);
    } else if (spec.pose) {
      src = resolvePose(spec.pose, where);
    } else {
      issues.push({ level: "error", code: "layer-empty", message: `${where}: layer needs "pose" or "pixels".`, where });
      src = [];
    }
    const out = emptyGrid(width, height);
    stamp(out, src, dx, dy, spec.remap, where, issues);
    return out;
  }

  function resolvePose(poseName, from = "rig") {
    if (resolved.has(poseName)) return resolved.get(poseName);
    const def = poseDefs[poseName];
    if (!def) {
      issues.push({ level: "error", code: "pose-missing", message: `${from}: unknown pose "${poseName}".`, where: from });
      return emptyGrid(width, height);
    }
    if (resolving.has(poseName)) {
      issues.push({ level: "error", code: "pose-cycle", message: `Pose "${poseName}" references itself through layers.`, where: `poses.${poseName}` });
      return emptyGrid(width, height);
    }
    resolving.add(poseName);
    const where = `poses.${poseName}`;
    const layers = Array.isArray(def.layers) ? def.layers : [def];
    const grid = emptyGrid(width, height);
    layers.forEach((layer, i) => {
      const g = resolveLayer(layer, layers.length > 1 ? `${where}.layers[${i}]` : where);
      stamp(grid, g, 0, 0, null, where, issues);
    });
    resolving.delete(poseName);
    resolved.set(poseName, grid);
    return grid;
  }

  for (const poseName of Object.keys(poseDefs)) resolvePose(poseName);

  const timelines = {};
  for (const [tlName, tl] of Object.entries(raw.timelines ?? {})) {
    const where = `timelines.${tlName}`;
    const tickMs = tl.tickMs ?? raw.tickMs ?? 60;
    if (!Number.isFinite(tickMs) || tickMs < 16) {
      issues.push({ level: "error", code: "tick-too-fast", message: `${where}: tickMs must be >= 16 (one 60 Hz frame); got ${tickMs}.`, where });
    }
    const frames = (tl.frames ?? []).map((f, i) => {
      const fw = `${where}.frames[${i}]`;
      const frame = typeof f === "string" ? { pose: f, hold: 1 } : f;
      const holdTicks = frame.hold ?? 1;
      if (!Number.isInteger(holdTicks) || holdTicks < 1) {
        issues.push({ level: "error", code: "hold-invalid", message: `${fw}: hold must be a positive integer number of ticks.`, where: fw });
      }
      if (!poseDefs[frame.pose]) {
        issues.push({ level: "error", code: "pose-missing", message: `${fw}: unknown pose "${frame.pose}".`, where: fw });
      }
      return {
        pose: frame.pose,
        hold: Number.isInteger(holdTicks) && holdTicks > 0 ? holdTicks : 1,
        dx: Number.isInteger(frame.dx) ? frame.dx : 0,
        dy: Number.isInteger(frame.dy) ? frame.dy : 0,
        overlays: Array.isArray(frame.overlays) ? frame.overlays : [],
      };
    });
    if (frames.length === 0) {
      issues.push({ level: "error", code: "timeline-empty", message: `${where}: needs at least one frame.`, where });
    }
    timelines[tlName] = { name: tlName, tickMs, loop: tl.loop !== false, frames };
  }

  const defaultTimeline = raw.defaultTimeline ?? Object.keys(timelines)[0];
  const reducedMotionPose = raw.reducedMotionPose ?? (poseDefs.default ? "default" : Object.keys(poseDefs)[0]);

  const rig = {
    name,
    cols,
    rows,
    width,
    height,
    palette,
    paletteOrder: order,
    poses: Object.fromEntries(resolved),
    timelines,
    defaultTimeline,
    reducedMotionPose,
    events: raw.events ?? {},
    raw,
  };

  /** Pixel grid for one timeline frame (pose shifted by the frame's dx/dy). */
  rig.frameGrid = (frame, where = "frame", sink = issues) => {
    const base = rig.poses[frame.pose] ?? emptyGrid(width, height);
    if (!frame.dx && !frame.dy) return base;
    const out = emptyGrid(width, height);
    stamp(out, base, frame.dx, frame.dy, null, where, sink);
    return out;
  };

  return { rig, issues };
}

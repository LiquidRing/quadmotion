// Rig invariants: even sizes, fixed height, ≤2 colors per cell, known poses,
// sane holds, reduced-motion fallback, loop seams, event wiring.

import { loadRig, RigError } from "./rig.mjs";
import { compileGridToFrame } from "./quad-engine.mjs";
import { compileTimelineFrame } from "./pipeline.mjs";

function pixelDiff(a, b) {
  let diff = 0;
  let union = 0;
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[y].length; x++) {
      const p = a[y][x];
      const q = b[y][x];
      if (p != null || q != null) union++;
      if (p !== q) diff++;
    }
  }
  return { diff, union };
}

/**
 * @returns {{ ok: boolean, errors: object[], warnings: object[], info: object[], summary: object }}
 */
export function validateRig(raw, opts = {}) {
  const seamThreshold = opts.seamThreshold ?? 0.6;
  let loaded;
  try {
    loaded = loadRig(raw);
  } catch (err) {
    if (err instanceof RigError) {
      return { ok: false, errors: [{ level: "error", code: "rig-unusable", message: err.message }], warnings: [], info: [], summary: {} };
    }
    throw err;
  }
  const { rig } = loaded;
  const issues = [...loaded.issues];
  const add = (level, code, message, where) => issues.push({ level, code, message, where });

  if (!raw.name || !/^[a-z0-9][a-z0-9-]*$/.test(raw.name)) {
    add("warning", "name", `name should be kebab-case (got "${raw.name}").`);
  }
  if (Object.keys(rig.palette).length === 0) add("error", "palette-empty", "Palette has no opaque colors.");
  if (Object.keys(rig.poses).length === 0) add("error", "poses-empty", "Rig has no poses.");
  if (Object.keys(rig.timelines).length === 0) add("error", "timelines-empty", "Rig has no timelines.");

  // Authoring sizes: each pixels block must have an even width and height so
  // it lands on whole terminal cells when placed at even offsets.
  for (const [name, def] of Object.entries(raw.poses ?? {})) {
    const layers = Array.isArray(def.layers) ? def.layers : [def];
    layers.forEach((layer, i) => {
      if (layer && typeof layer === "object" && Array.isArray(layer.pixels)) {
        const h = layer.pixels.length;
        const w = Math.max(0, ...layer.pixels.map((r) => [...r].length));
        const where = layers.length > 1 ? `poses.${name}.layers[${i}]` : `poses.${name}`;
        if (h % 2 || w % 2) add("warning", "odd-size", `${where}: pixel block is ${w}x${h}; prefer even sizes (2 sub-pixels per cell on both axes).`, where);
        if (h !== rig.height && !layers.some((l) => l.dy)) {
          add("info", "partial-height", `${where}: ${h} sub-pixel rows on a ${rig.height}-row canvas (padded with transparency).`, where);
        }
      }
    });
  }

  // ≤ 2 colors per 2x2 cell in every pose and every timeline frame.
  const seen = new Set();
  const reportCells = (warnings, where) => {
    for (const w of warnings) {
      if (w.code !== "cell-colors") continue;
      const key = `${where}:${w.col}:${w.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // The terminal can show only 2 colors per cell; extra colors are folded
      // by the compiler. A warning by default, an error with "cells": "strict".
      add(raw.cells === "strict" ? "error" : "warning", "cell-colors", `${where}: ${w.message}`, where);
    }
  };
  for (const [name, grid] of Object.entries(rig.poses)) {
    reportCells(compileGridToFrame(grid, rig.palette).warnings, `poses.${name}`);
  }

  // Timelines: fixed size per frame, loop seams.
  const sizes = new Set();
  for (const [name, tl] of Object.entries(rig.timelines)) {
    tl.frames.forEach((f, i) => {
      if (!rig.poses[f.pose]) return;
      const where = `timelines.${name}.frames[${i}]`;
      const frame = compileTimelineFrame(rig, f, where, issues);
      sizes.add(`${frame.cols}x${frame.rows}`);
      for (const w of frame.warnings) {
        if (w.code === "overlay-clipped") add("warning", "overlay-clipped", `${where}: ${w.message}`, where);
      }
      if (f.dx || f.dy) reportCells(frame.warnings, where);
    });
    if (tl.loop && tl.frames.length > 1) {
      const first = tl.frames[0];
      const last = tl.frames[tl.frames.length - 1];
      if (rig.poses[first.pose] && rig.poses[last.pose]) {
        const { diff, union } = pixelDiff(rig.frameGrid(last), rig.frameGrid(first));
        const ratio = union ? diff / union : 0;
        if (ratio > seamThreshold) {
          add("warning", "loop-seam", `timelines.${name}: looping from the last frame ("${last.pose}") to the first ("${first.pose}") changes ${(ratio * 100).toFixed(0)}% of the sprite; end the loop on a pose close to the first one.`, `timelines.${name}`);
        }
      }
    }
    const total = tl.frames.reduce((s, f) => s + f.hold, 0) * tl.tickMs;
    if (tl.tickMs < 50) add("warning", "tick-fast", `timelines.${name}: tickMs ${tl.tickMs} is faster than 50 ms; terminal animation rarely benefits below ~60 ms.`);
    add("info", "timeline", `timelines.${name}: ${tl.frames.length} frames, ${total} ms per pass, ${tl.loop ? "loops" : "plays once"}.`);
  }
  if (sizes.size > 1) add("error", "height-mismatch", `Frames compile to different sizes: ${[...sizes].join(", ")}.`);

  if (!rig.poses[rig.reducedMotionPose]) {
    add("error", "reduced-motion", `reducedMotionPose "${rig.reducedMotionPose}" is not a pose.`);
  }
  if (rig.defaultTimeline && !rig.timelines[rig.defaultTimeline]) {
    add("error", "default-timeline", `defaultTimeline "${rig.defaultTimeline}" is not a timeline.`);
  }
  for (const [event, tlName] of Object.entries(rig.events ?? {})) {
    if (!rig.timelines[tlName]) add("error", "event-timeline", `events.${event} names unknown timeline "${tlName}".`);
  }

  // Head-room for squash/crouch: the neutral pose should leave the bottom
  // sub-pixel row empty so a 1-sub-pixel crouch fits without a new row.
  const neutral = rig.poses[rig.reducedMotionPose];
  if (neutral && neutral[rig.height - 1].some((p) => p != null)) {
    add("info", "no-crouch-room", `Pose "${rig.reducedMotionPose}" touches the bottom sub-pixel row; a crouch/bounce would need an extra terminal row.`);
  }

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const info = issues.filter((i) => i.level === "info");
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    info,
    summary: {
      name: rig.name,
      canvas: `${rig.cols}x${rig.rows} cells (${rig.width}x${rig.height} sub-pixels)`,
      poses: Object.keys(rig.poses),
      timelines: Object.keys(rig.timelines),
    },
  };
}

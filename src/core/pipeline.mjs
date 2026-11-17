// High-level pipeline: rig JSON -> compiled frames -> ANSI lines per timeline.

import { loadRig, RigError } from "./rig.mjs";
import { compileGridToFrame, applyOverlays, frameToAnsiLines, frameToText } from "./quad-engine.mjs";

/** Compile one timeline frame (pose + shift + overlays). */
export function compileTimelineFrame(rig, frame, where, sink) {
  const grid = rig.frameGrid(frame, where, sink);
  const compiled = compileGridToFrame(grid, rig.palette);
  return applyOverlays(compiled, frame.overlays, rig.palette);
}

/**
 * Compile a rig into reusable data: every pose, and every timeline expanded
 * into frames with durations. Colors are resolved later per terminal.
 */
export function compileRig(rawOrRig) {
  const { rig, issues } = rawOrRig?.paletteOrder ? { rig: rawOrRig, issues: [] } : loadRig(rawOrRig);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    throw new RigError(`Rig has ${errors.length} error(s):\n- ${errors.map((e) => e.message).join("\n- ")}`, issues);
  }
  const warnings = [];
  const poses = {};
  for (const [name, grid] of Object.entries(rig.poses)) {
    const frame = compileGridToFrame(grid, rig.palette);
    warnings.push(...frame.warnings.map((w) => ({ ...w, where: `poses.${name}` })));
    poses[name] = frame;
  }
  const timelines = {};
  const sink = [];
  for (const [name, tl] of Object.entries(rig.timelines)) {
    timelines[name] = {
      name,
      tickMs: tl.tickMs,
      loop: tl.loop,
      frames: tl.frames.map((f, i) => {
        const where = `timelines.${name}.frames[${i}]`;
        const frame = compileTimelineFrame(rig, f, where, sink);
        warnings.push(...frame.warnings.map((w) => ({ ...w, where })));
        return { pose: f.pose, hold: f.hold, durationMs: f.hold * tl.tickMs, frame };
      }),
    };
  }
  const late = sink.filter((i) => i.level === "error");
  if (late.length) {
    throw new RigError(`Rig has ${late.length} error(s):\n- ${late.map((e) => e.message).join("\n- ")}`, late);
  }
  return { rig, poses, timelines, warnings };
}

/** Resolve compiled frames to ANSI strings for a given terminal. */
export function linesFor(compiled, caps) {
  const out = { poses: {}, timelines: {} };
  for (const [name, frame] of Object.entries(compiled.poses)) {
    out.poses[name] = frameToAnsiLines(frame, compiled.rig.palette, caps);
  }
  for (const [name, tl] of Object.entries(compiled.timelines)) {
    out.timelines[name] = {
      tickMs: tl.tickMs,
      loop: tl.loop,
      frames: tl.frames.map((f) => ({ durationMs: f.durationMs, lines: frameToAnsiLines(f.frame, compiled.rig.palette, caps) })),
    };
  }
  return out;
}

/** Plain-text glyph rows for every pose (for snapshots / docs). */
export function poseTexts(compiled) {
  return Object.fromEntries(Object.entries(compiled.poses).map(([n, f]) => [n, frameToText(f)]));
}

/** Spans (text + hex colors) per row: the form Ink, mods and HTML consume. */
export function frameToSpans(frame, palette, opts = {}) {
  const hex = (key) => {
    const t = key ? palette[key] : null;
    return t ? `#${t.rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}` : undefined;
  };
  return frame.cells.map((line) => {
    const spans = [];
    for (let cell of line) {
      if (cell.skip) continue;
      if (opts.bgFill && cell.mask === 15 && cell.fg) cell = { ...cell, glyph: " ", bg: cell.fg, fg: null };
      const fg = hex(cell.fg);
      const bg = hex(cell.bg);
      const prev = spans[spans.length - 1];
      if (prev && prev.fg === fg && prev.bg === bg) prev.text += cell.glyph;
      else spans.push({ text: cell.glyph, ...(fg ? { fg } : {}), ...(bg ? { bg } : {}) });
    }
    return spans;
  });
}

/**
 * Serializable bundle of a compiled rig: everything a runtime needs to play
 * it (palette, compiled cells, durations) without the authoring pipeline.
 */
export function toBundle(compiled) {
  const { rig } = compiled;
  const stripFrame = (f) => ({ cols: f.cols, rows: f.rows, cells: f.cells });
  return {
    format: "quadmotion-bundle@1",
    rig: {
      name: rig.name,
      cols: rig.cols,
      rows: rig.rows,
      palette: rig.palette,
      reducedMotionPose: rig.reducedMotionPose,
      defaultTimeline: rig.defaultTimeline,
      events: rig.events,
    },
    poses: Object.fromEntries(Object.entries(compiled.poses).map(([n, f]) => [n, stripFrame(f)])),
    timelines: Object.fromEntries(
      Object.entries(compiled.timelines).map(([n, tl]) => [
        n,
        { name: n, tickMs: tl.tickMs, loop: tl.loop, frames: tl.frames.map((f) => ({ pose: f.pose, hold: f.hold, durationMs: f.durationMs, frame: stripFrame(f.frame) })) },
      ]),
    ),
  };
}

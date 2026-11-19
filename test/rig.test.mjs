import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateRig } from "../src/core/validate.mjs";
import { compileRig, poseTexts } from "../src/core/pipeline.mjs";
import { loadRig } from "../src/core/rig.mjs";

const pip = JSON.parse(readFileSync(new URL("../assets/pip.rig.json", import.meta.url), "utf8"));
const clone = (o) => structuredClone(o);

test("starter rig validates without errors or warnings", () => {
  const r = validateRig(pip);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.ok);
});

test("pose snapshots (code points, no colors)", () => {
  const t = poseTexts(compileRig(pip));
  assert.deepEqual(t.default, ["  ▄▄▄▄▄  ", " ▝▙███▟▘ ", "  ▝▘ ▝▘  "]);
  assert.deepEqual(t.blink, ["  ▄▄▄▄▄  ", " ▝█████▘ ", "  ▝▘ ▝▘  "]);
  assert.deepEqual(t.crouch, ["    ▄    ", " ▟▜███▛▙ ", "▝▀█▀▀▀█▀▘"]);
  assert.deepEqual(t.jump, ["▐▗▛█▄█▜▖▌", " ▀█▀▀▀█▀ ", "         "]);
});

test("remap and layers compose poses", () => {
  const raw = clone(pip);
  raw.poses.hat = { pixels: ["......####........", "..................", "..................", "..................", "..................", ".................."] };
  raw.poses.dressed = { layers: ["crouch", { pose: "hat" }] };
  const { rig, issues } = loadRig(raw);
  assert.deepEqual(issues, []);
  assert.equal(rig.poses.dressed[0].slice(6, 10).join(""), "####");
  assert.equal(rig.poses.blink[2][5], "#", "blink remaps eyes to body");
});

test("validator: more than 2 colors in a cell warns with coordinates, errors in strict mode", () => {
  const raw = clone(pip);
  raw.poses.default.pixels[0] = "........AE........"; // A, E, #, # in cell (4,0)
  const r = validateRig(raw);
  assert.ok(r.ok);
  const w = r.warnings.find((x) => x.code === "cell-colors");
  assert.ok(w, JSON.stringify(r.warnings));
  assert.match(w.message, /Cell \(4,0\)/);
  raw.cells = "strict";
  assert.ok(validateRig(raw).errors.some((x) => x.code === "cell-colors"));
});

test("validator: ragged rows, unknown tokens, unknown poses, bad holds, clipping", () => {
  const raw = clone(pip);
  raw.poses.default.pixels[1] = "....##########...";
  raw.poses.look_left.pixels[1] = "....####Z#####....";
  raw.timelines.idle.frames.push({ pose: "nope", hold: 2 }, { pose: "default", hold: 0 });
  raw.timelines.work.frames[0].dx = 6;
  const codes = validateRig(raw).errors.map((e) => e.code);
  for (const c of ["pixels-ragged", "pixels-unknown-token", "pose-missing", "hold-invalid", "pose-clipped"]) {
    assert.ok(codes.includes(c), `${c} in ${codes}`);
  }
});

test("validator: missing reduced-motion pose, event to unknown timeline, loop seam", () => {
  const raw = clone(pip);
  raw.reducedMotionPose = "ghost";
  raw.events["tool.call"] = "dance";
  raw.timelines.seam = { loop: true, frames: [{ pose: "jump", hold: 4 }, { pose: "default", hold: 4 }, { pose: "crouch", hold: 4 }] };
  const r = validateRig(raw);
  assert.ok(r.errors.some((e) => e.code === "reduced-motion"));
  assert.ok(r.errors.some((e) => e.code === "event-timeline"));
  assert.ok(r.warnings.some((w) => w.code === "loop-seam"));
});

test("compileRig refuses a broken rig with the issue list", () => {
  const raw = clone(pip);
  raw.palette["#"].ansi16 = 12;
  assert.throws(() => compileRig(raw), (err) => err.name === "RigError" && err.issues.some((i) => i.code === "palette-ansi16"));
});

test("compileRig refuses a frame shifted off the canvas (dx/dy clipping)", () => {
  const raw = clone(pip);
  raw.timelines.work.frames[0].dx = 6;
  assert.throws(() => compileRig(raw), (err) => err.name === "RigError" && err.issues.some((i) => i.code === "pose-clipped"));
});

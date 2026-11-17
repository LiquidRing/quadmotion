import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenes, buildCast, SCENES } from "../src/scenes/index.mjs";
import { frameToText } from "../src/core/quad-engine.mjs";
import { validateRig } from "../src/core/validate.mjs";
import { generateSvg } from "../src/adapters/svg-smil.mjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";

test("every procedural scene builds with a fixed canvas and real motion", () => {
  for (const s of buildScenes()) {
    const tl = s.timelines.main;
    assert.ok(tl.frames.length > 10, `${s.rig.name}: frames`);
    const texts = new Set();
    for (const f of tl.frames) {
      assert.equal(f.frame.rows, s.rig.rows, `${s.rig.name}: rows`);
      assert.ok(f.frame.cells.every((line) => line.length === s.rig.cols), `${s.rig.name}: cols`);
      texts.add(frameToText(f.frame).join("\n"));
    }
    assert.ok(texts.size > tl.frames.length / 4, `${s.rig.name}: frames should differ`);
  }
});

test("scenes are deterministic (seeded PRNG)", () => {
  for (const name of Object.keys(SCENES)) {
    const a = buildScenes([name])[0].timelines.main.frames.map((f) => frameToText(f.frame).join("\n"));
    const b = buildScenes([name])[0].timelines.main.frames.map((f) => frameToText(f.frame).join("\n"));
    assert.deepEqual(a, b, name);
  }
});

test("scenes without color clashes fold no cells", () => {
  const [logo, widgets] = buildScenes(["logo", "widgets"]);
  assert.ok(logo.stats.foldedCells <= 2, `logo folded ${logo.stats.foldedCells}`);
  assert.equal(widgets.stats.foldedCells, 0);
});

test("the ball never leaves the physics canvas", () => {
  const [s] = buildScenes(["physics"]);
  for (const f of s.timelines.main.frames) assert.ok(f.frame.cells.flat().some((c) => c.fg === "b" || c.bg === "b"));
});

test("scenes export to SVG", () => {
  const [s] = buildScenes(["physics"]);
  const svg = generateSvg(s, { timeline: "main", background: "#0e1016" });
  assert.match(svg, /<rect width="72" height="24" fill="#0e1016"\/>/);
  assert.match(svg, /calcMode="discrete"/);
});

test("every shipped rig validates clean", () => {
  const dir = new URL("../assets/cast/", import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".rig.json")) : [];
  for (const f of ["../assets/pip.rig.json", ...files.map((x) => `../assets/cast/${x}`)]) {
    const r = validateRig(JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8")));
    assert.deepEqual(r.errors, [], f);
    assert.deepEqual(r.warnings, [], f);
  }
  assert.ok(buildCast().length >= 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCharacter } from "../src/stage/character.mjs";
import { buildActs } from "../src/stage/index.mjs";
import { checkAct, fidelity } from "../src/stage/check.mjs";
import { compileGridToFrame } from "../src/core/quad-engine.mjs";
import { generateSvg } from "../src/adapters/svg-smil.mjs";

const ember = await loadCharacter(new URL("../assets/characters/ember.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

test("a character module plays the built-in acts: grounded, no slide, no teleport", () => {
  for (const id of ["walk-jump", "hello", "oops", "rain"]) {
    const [scene] = buildActs([id], { character: ember });
    assert.equal(scene.rig.rows, 16, "character sets its stage height");
    assert.deepEqual(checkAct(scene, { folds: false }).map((i) => i.message), [], id);
  }
});

test("full-color characters keep most of their color in the terminal", () => {
  const [scene] = buildActs(["walk-jump"], { character: ember });
  const fid = scene.timelines.main.frames.map((f) => fidelity(f.frame));
  const avg = fid.reduce((a, b) => a + b, 0) / fid.length;
  assert.ok(avg > 0.93, `terminal fidelity ${avg}`);
  assert.ok(scene.stats.foldedCells > 0, "the example really uses 3+ colors per cell");
});

test("the cell solver keeps the pair with the least error", () => {
  const palette = {
    O: { key: "O", rgb: [40, 20, 20], priority: 0 }, // outline
    F: { key: "F", rgb: [230, 120, 40], priority: 1 }, // fur
    f: { key: "f", rgb: [240, 140, 60], priority: 2 }, // fur, a shade lighter
  };
  // fur, light fur, outline, fur: keeping fur + outline loses one near-identical shade
  const frame = compileGridToFrame([["F", "f"], ["O", "F"]], palette);
  const cell = frame.cells[0][0];
  assert.deepEqual([cell.fg, cell.bg].sort(), ["F", "O"]);
  assert.equal(cell.glyph, "▜"); // TL, TR, BR fur; BL outline
});

test("svg --source draws the full-color grid, the default draws terminal cells", () => {
  const [scene] = buildActs(["spin"], { character: ember });
  const terminal = generateSvg(scene, { timeline: "main" });
  const source = generateSvg(scene, { timeline: "main", source: true });
  const outline = "#2a1712";
  assert.ok(source.includes(outline) && terminal !== source);
});

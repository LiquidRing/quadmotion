import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActs } from "../src/stage/index.mjs";
import { ACTS } from "../src/stage/acts.mjs";
import { checkAct } from "../src/stage/check.mjs";

for (const id of Object.keys(ACTS)) {
  test(`act "${id}": grounded, no foot slide, no teleport, clean cells on Pip`, () => {
    const [scene] = buildActs([id]);
    const issues = checkAct(scene);
    assert.deepEqual(issues.slice(0, 5).map((i) => i.message), []);
  });

  test(`act "${id}": deterministic and has a live run()`, () => {
    const a = buildActs([id])[0].timelines.main.frames.map((f) => JSON.stringify(f.frame.cells));
    const b = buildActs([id])[0].timelines.main.frames.map((f) => JSON.stringify(f.frame.cells));
    assert.deepEqual(a, b);
    assert.equal(typeof ACTS[id].run, "function", "run(w) for the playground");
  });
}

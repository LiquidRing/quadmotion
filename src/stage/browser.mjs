// Browser entry for the live playground: the same world, puppet and acts as
// the recorded scenes, ticking in real time and compiled to quadrant cells
// every tick. Bundled into docs/showcase by tools/build-showcase.mjs.

import { World, TICK_MS, walkTo, jump, spin, lookAround, wave } from "./world.mjs";
import { ACTS, GROUPS } from "./acts.mjs";
import { STAGE_PALETTE } from "./index.mjs";
import { GROUP_PALETTE } from "./acts.mjs";
import { normalizePalette } from "../core/rig.mjs";
import { compileGridToFrame, applyOverlays } from "../core/quad-engine.mjs";
import { palette as paletteSpec } from "../scenes/kit.mjs";
import { happyHops, doubleTake } from "./acts/basics.mjs";

const REACTIONS = [
  (p) => p.do(happyHops, { times: 2 }),
  (p) => p.do(lookAround),
  (p) => p.do(spin),
  (p) => p.do(doubleTake, { side: p.facing }),
  (p) => p.do(wave, { text: "Hi!", times: 2 }),
];

export function createLive({ seed = 11, cols = 64, rows = 12, lang = "en" } = {}) {
  const issues = [];
  const { palette } = normalizePalette(paletteSpec({ ...STAGE_PALETTE, ...GROUP_PALETTE }), issues);
  let world;
  const reset = () => {
    world = new World({ cols, rows, seed, lang });
    world.pip.x = Math.round(world.W / 2 / 2) * 2;
  };
  reset();
  let reactionIndex = 0;
  const api = {
    TICK_MS,
    /** Change the speech language live ("en", "ru"). */
    setLang(l) {
      lang = l;
      world.lang = l;
    },
    palette,
    get world() {
      return world;
    },
    reset,
    step() {
      world.step();
    },
    /** Compiled cells for the current tick. */
    frame() {
      const { canvas, overlays } = world.render();
      return applyOverlays(compileGridToFrame(canvas.px, palette), overlays, palette);
    },
    /** Pip's box in cells, for hit-testing clicks. */
    pipCells() {
      const b = world.pip.box;
      if (!b) return null;
      return { c0: Math.floor(b.left / 2), c1: Math.floor(b.right / 2), r0: Math.floor(b.top / 2), r1: Math.floor(b.footY / 2) };
    },
    /** Click on Pip: a reaction, cycling like Clawd's random pick but never the same twice. */
    poke() {
      if (world.pip.busy) return false;
      REACTIONS[reactionIndex++ % REACTIONS.length](world.pip);
      return true;
    },
    /** Tap on the stage: walk there (run if far). */
    goto(x) {
      const target = Math.max(16, Math.min(world.W - 16, Math.round(x / 2) * 2));
      const far = Math.abs(target - world.pip.x) > 50;
      world.pip.interrupt(walkTo, target, far ? { speed: 1.3, run: true } : { speed: 0.7 });
    },
    /** Keyboard: walk while held. */
    walkHeld(dir, held, run = false) {
      const edge = dir > 0 ? world.W - 16 : 16;
      world.pip.interrupt(walkTo, edge, { speed: run ? 1.3 : 0.7, run, held });
    },
    jump(dir = 0) {
      if (world.pip.busy && !world.pip.current) return;
      const dx = dir * 24;
      const x = world.pip.x + dx;
      world.pip.interrupt(jump, { dx: x < 16 || x > world.W - 16 ? 0 : dx, height: 8 });
    },
    play(id) {
      const act = ACTS[id];
      if (!act?.run) return;
      world.pip.queue = [];
      act.run(world);
    },
    acts: Object.fromEntries(Object.entries(GROUPS).map(([g, mod]) => [g, Object.entries(mod.ACTS).map(([id, a]) => ({ id, title: a.title, description: a.description }))])),
  };
  return api;
}

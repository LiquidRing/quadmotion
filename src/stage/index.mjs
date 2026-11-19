// Recorded mascot acts: run the world with a script, capture every tick, and
// compile the frames like any other scene (player, SVG, showcase, checks).

import { makeScene, palette, Canvas } from "../scenes/kit.mjs";
import { PIP_PALETTE } from "./pip.mjs";
import { World, TICK_MS } from "./world.mjs";
import { ACTS, GROUP_PALETTE } from "./acts.mjs";

export const STAGE_PALETTE = {
  ...PIP_PALETTE,
  G: { name: "grass", rgb: [76, 175, 80], ansi16: 32 },
  D: { name: "soil", rgb: [91, 58, 36], ansi16: 33 },
  o: { name: "pebble", rgb: [125, 90, 60], ansi16: 33 },
  d: { name: "dust", rgb: [150, 156, 178], ansi16: 37 },
  t: { name: "text", rgb: [242, 244, 255], ansi16: 97 },
  c: { name: "crate-edge", rgb: [138, 90, 43], ansi16: 33 },
  C: { name: "crate", rgb: [176, 122, 62], ansi16: 33 },
  B: { name: "ball", rgb: [255, 93, 115], ansi16: 91 },
  b: { name: "ball-stripe", rgb: [255, 230, 236], ansi16: 97 },
  Y: { name: "gold", rgb: [255, 210, 63], ansi16: 93 },
  R: { name: "apple", rgb: [230, 57, 70], ansi16: 91 },
  v: { name: "wing", rgb: [255, 157, 77], ansi16: 33 },
  k: { name: "dark", rgb: [44, 48, 66], ansi16: 90 },
  r: { name: "rain", rgb: [110, 160, 255], ansi16: 94 },
  u: { name: "umbrella-rim", rgb: [180, 60, 200], ansi16: 35 },
  U: { name: "umbrella", rgb: [214, 112, 230], ansi16: 95 },
  L: { name: "laptop", rgb: [170, 176, 196], ansi16: 37 },
  K: { name: "laptop-base", rgb: [110, 116, 136], ansi16: 90 },
  l: { name: "screen", rgb: [40, 60, 110], ansi16: 34 },
  y: { name: "code", rgb: [140, 230, 200], ansi16: 96 },
  S: { name: "star", rgb: [255, 246, 196], ansi16: 97 },
  s: { name: "star-dim", rgb: [140, 140, 170], ansi16: 90 },
  M: { name: "moon", rgb: [236, 232, 210], ansi16: 97 },
  z: { name: "zzz", rgb: [160, 170, 220], ansi16: 94 },
  f: { name: "confetti-1", rgb: [255, 209, 102], ansi16: 93 },
  F: { name: "confetti-2", rgb: [124, 243, 214], ansi16: 96 },
  h: { name: "confetti-3", rgb: [255, 107, 139], ansi16: 91 },
};

/**
 * Run an act script and record every tick.
 * character: a character module ({ name, palette, draw }) to play the act
 * instead of Pip (see src/stage/character.mjs).
 */
export function recordAct(act, { lang = "en", character = null } = {}) {
  const world = new World({ cols: act.cols ?? character?.cols ?? 64, rows: act.rows ?? character?.rows ?? 12, seed: act.seed ?? 7, lang, character });
  act.setup?.(world);
  const frames = [];
  const meta = [];
  const total = act.ticks;
  for (let i = 0; i < total; i++) {
    act.at?.[i]?.(world);
    world.step();
    frames.push(world.render());
    // contact: the character's own pixels (drawn alone) on the row above the ground
    const solo = new Canvas(world.W, world.H);
    world.pip.draw(solo);
    const box = world.pip.box;
    let contact = 0;
    if (box) for (let x = box.left - 4; x <= box.right + 4; x++) if (solo.get(x, world.ground - 1)) contact++;
    meta.push({ pip: { x: world.pip.x, box, state: { ...world.pip.state }, feet: box?.feet, contact, allowJump: Boolean(world.pip.teleport) } });
    world.pip.teleport = false;
  }
  const scene = makeScene({
    name: act.id,
    title: act.title,
    description: act.description,
    cols: world.cols,
    rows: world.rows,
    palette: palette({ ...STAGE_PALETTE, ...GROUP_PALETTE, ...(character?.palette ?? {}) }),
    tickMs: TICK_MS,
    loop: true,
    frames,
    stillFrame: act.still ?? Math.floor(total / 2),
  });
  scene.meta = meta;
  scene.world = { ground: world.ground, W: world.W, H: world.H };
  return scene;
}

export function buildActs(ids, { lang = "en", character = null } = {}) {
  const acts = { ...ACTS, ...(character?.acts ?? {}) };
  return (ids ?? Object.keys(ACTS)).map((id) => {
    const act = acts[id];
    if (!act) throw new Error(`Unknown act "${id}". Known: ${Object.keys(acts).join(", ")}`);
    return recordAct({ id, ...act }, { lang, character });
  });
}

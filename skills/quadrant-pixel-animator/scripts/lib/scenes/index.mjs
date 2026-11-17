// Showcase registry: procedural scenes plus authored character rigs.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { compileRig } from "../core/pipeline.mjs";
import { logoScene } from "./logo.mjs";
import { runnerScene } from "./runner.mjs";
import { resolutionScene } from "./resolution.mjs";
import { physicsScene } from "./physics.mjs";
import { widgetsScene } from "./widgets.mjs";
import { fireScene } from "./fire.mjs";

export const SCENES = {
  logo: logoScene,
  runner: runnerScene,
  resolution: resolutionScene,
  physics: physicsScene,
  widgets: widgetsScene,
  fire: fireScene,
};

/** Build every procedural scene. */
export function buildScenes(names = Object.keys(SCENES)) {
  return names.map((n) => {
    const make = SCENES[n];
    if (!make) throw new Error(`Unknown scene "${n}". Known: ${Object.keys(SCENES).join(", ")}`);
    return make();
  });
}

/** Compile the authored rigs shipped in assets/ (Pip + assets/cast/*), if present. */
export function buildCast(root = fileURLToPath(new URL("../../assets/", import.meta.url))) {
  const files = [];
  if (existsSync(join(root, "pip.rig.json"))) files.push(join(root, "pip.rig.json"));
  const castDir = join(root, "cast");
  if (existsSync(castDir)) for (const f of readdirSync(castDir).sort()) if (f.endsWith(".rig.json")) files.push(join(castDir, f));
  return files.map((f) => compileRig(JSON.parse(readFileSync(f, "utf8"))));
}

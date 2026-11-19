// Look at animation frame by frame: consecutive frames rendered to one PNG at
// terminal aspect. Text alone cannot tell you whether motion reads; this can.
//
//   quadmotion strip --input rig.json [--timeline idle]
//   quadmotion strip --act walk-jump [--crop pip --width 24]
//   quadmotion strip --module my-character.mjs --act walk-jump --view compare
//   quadmotion strip --scene physics
// Options: --from 0 --count 24 --every 1 --columns 4 --cw 6 --crop c0,c1 --out file.png
//          --view terminal|source|compare (compare: full-color source beside the terminal result)
// Default output: ./records/<name>-<timeline>-<from>.png (path printed).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { join, dirname, resolve } from "node:path";
import { compileRig } from "./core/pipeline.mjs";
import { stripPng } from "./core/png.mjs";
import { fidelity } from "./stage/check.mjs";

export async function runStrip(args) {
  const { values } = parseArgs({
    args,
    options: {
      scene: { type: "string" },
      act: { type: "string" },
      input: { type: "string", short: "i" },
      timeline: { type: "string" },
      from: { type: "string", default: "0" },
      count: { type: "string", default: "24" },
      every: { type: "string", default: "1" },
      columns: { type: "string", default: "4" },
      cw: { type: "string", default: "6" },
      out: { type: "string" },
      crop: { type: "string" }, // "c0,c1" cell columns, or "pip" to follow Pip (acts)
      width: { type: "string", default: "24" },
      view: { type: "string", default: "terminal" }, // terminal | source | compare
      module: { type: "string" }, // a character module playing --act (src/stage/character.mjs)
    },
  });

  let compiled;
  if (values.scene) compiled = (await import("./scenes/index.mjs")).buildScenes([values.scene])[0];
  else if (values.act || values.module) {
    const character = values.module ? await (await import("./stage/character.mjs")).loadCharacter(values.module) : null;
    const id = values.act ?? Object.keys(character.acts)[0] ?? "walk-jump";
    compiled = (await import("./stage/index.mjs")).buildActs([id], { character })[0];
  }
  else if (values.input) compiled = compileRig(JSON.parse(readFileSync(values.input, "utf8")));
  else throw new Error("Pass --input rig.json, --act <id> or --scene <name>");

  const tlName = values.timeline ?? compiled.rig.defaultTimeline;
  const tl = compiled.timelines[tlName];
  if (!tl) throw new Error(`Unknown timeline "${tlName}". Known: ${Object.keys(compiled.timelines).join(", ")}`);
  const from = Number(values.from);
  const every = Math.max(1, Number(values.every));
  const frames = [];
  for (let i = from; i < tl.frames.length && frames.length < Number(values.count); i += every) {
    let f = tl.frames[i];
    if (values.crop) {
      let c0, c1;
      if (values.crop === "pip" && compiled.meta) {
        const cx = Math.round(compiled.meta[i].pip.x / 2);
        const half = Math.floor(Number(values.width) / 2);
        c0 = Math.max(0, Math.min(compiled.rig.cols - 2 * half, cx - half));
        c1 = c0 + 2 * half;
      } else [c0, c1] = values.crop.split(",").map(Number);
      const grid = f.frame.grid?.map((row) => row.slice(c0 * 2, c1 * 2));
      f = { ...f, frame: { ...f.frame, cols: c1 - c0, cells: f.frame.cells.map((line) => line.slice(c0, c1)), grid } };
    }
    frames.push(f);
  }
  const png = stripPng(frames, compiled.rig.palette, { cw: Number(values.cw), columns: Number(values.columns), view: values.view });
  const out = resolve(values.out ?? join("records", `${compiled.rig.name}-${tlName}-${from}.png`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  const fid = tl.frames.map((f) => fidelity(f.frame)).filter((v) => v !== null);
  const avg = fid.length ? ` · terminal fidelity ${(100 * fid.reduce((a, b) => a + b, 0) / fid.length).toFixed(1)}% of colored sub-pixels` : "";
  return `${out}  frames ${from}..${from + (frames.length - 1) * every} of ${tl.frames.length}${avg}`;
}

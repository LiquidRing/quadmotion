// Builds the showcase: docs/showcase/index.html (self-contained, interactive)
// and docs/media/*.svg (animated SVGs for the README).
//   node tools/build-showcase.mjs [--artifact <path>]   (also writes a body-only copy)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { buildScenes, buildCast } from "../src/scenes/index.mjs";
import { buildActs } from "../src/stage/index.mjs";
import { execFileSync } from "node:child_process";
import { generateSvg } from "../src/adapters/svg-smil.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const artifactOut = args.includes("--artifact") ? args[args.indexOf("--artifact") + 1] : null;

const ORDER = ["resolution", "physics", "widgets", "fire", "logo"];

function encodeFrame(frame) {
  return frame.cells.map((line) =>
    line
      .map((cell) => {
        const g = cell.skip ? "​" : cell.glyph;
        if ([...g].length !== 1 || g.length !== 1) throw new Error(`Glyph "${g}" is not a single BMP character`);
        return g + (cell.fg ?? "_") + (cell.bg ?? "_");
      })
      .join(""),
  );
}

function encode(compiled, kind) {
  const { rig } = compiled;
  const frames = [];
  const index = new Map();
  const id = (frame) => {
    const rows = encodeFrame(frame);
    const key = rows.join("\n");
    if (!index.has(key)) {
      index.set(key, frames.length);
      frames.push(rows);
    }
    return index.get(key);
  };
  const timelines = {};
  for (const [name, tl] of Object.entries(compiled.timelines)) {
    timelines[name] = { loop: tl.loop, seq: tl.frames.map((f) => id(f.frame)), dur: tl.frames.map((f) => f.durationMs) };
  }
  const still = id(compiled.poses[rig.reducedMotionPose] ?? compiled.timelines[rig.defaultTimeline].frames[0].frame);
  return {
    id: rig.name,
    kind,
    title: rig.title ?? rig.name.replace(/^\w/, (c) => c.toUpperCase()),
    description: rig.description ?? rig.raw?.description ?? "",
    cols: rig.cols,
    rows: rig.rows,
    palette: Object.fromEntries(Object.entries(rig.palette).map(([k, t]) => [k, [...t.rgb, t.ansi16, t.ansi16Bg]])),
    names: Object.fromEntries(Object.entries(rig.palette).map(([k, t]) => [k, t.name])),
    defaultTimeline: rig.defaultTimeline,
    still,
    timelines,
    frames,
  };
}

const scenes = buildScenes(ORDER);
const cast = buildCast();
const acts = buildActs();
const data = {
  built: new Date().toISOString().slice(0, 10),
  scenes: [...acts.map((a) => encode(a, "act")), ...scenes.map((s) => encode(s, "scene")), ...cast.map((c) => encode(c, "rig"))],
};

// The live stage: bundle the world, puppet and acts for the browser (bun).
const bundleFile = join(root, "records", "stage.bundle.js");
mkdirSync(dirname(bundleFile), { recursive: true });
execFileSync("bun", ["build", join(root, "src", "stage", "browser-global.mjs"), "--format", "iife", "--target", "browser", "--minify", "--outfile", bundleFile], { stdio: "inherit" });
const bundle = readFileSync(bundleFile, "utf8").replace(/<\/script/gi, "<\\/script");
const template = readFileSync(join(root, "tools", "showcase-template.html"), "utf8");
const MARK = "<script>\nconst DATA = /*__DATA__*/null;";
const body = template.replace(MARK, () => `<script>${bundle}</script>\n<script>\nconst DATA = ${JSON.stringify(data)};`);
if (body === template) throw new Error("template markers not found");
const page = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
const out = join(root, "docs", "showcase", "index.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
if (artifactOut) {
  writeFileSync(artifactOut, body);
  console.log(`wrote ${artifactOut}`);
}

// README media: one animated SVG per scene and per rig's default timeline.
const media = join(root, "docs", "media");
mkdirSync(media, { recursive: true });
mkdirSync(join(media, "acts"), { recursive: true });
// README uses every act, the resolution comparison and the rigs.
for (const s of [...acts, ...scenes.filter((x) => x.rig.name === "resolution"), ...cast]) {
  const svg = generateSvg(s, { timeline: s.rig.defaultTimeline, scale: s.rig.cols > 30 ? 8 : 12, background: "#0e1016" });
  const file = acts.includes(s) ? join(media, "acts", `${s.rig.name}.svg`) : join(media, `${s.rig.name}.svg`);
  writeFileSync(file, svg);
  console.log(`wrote ${file} (${(svg.length / 1024).toFixed(0)} KB)`);
}

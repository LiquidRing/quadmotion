// Showcase reel: a title card, then Pip's best acts with captions, rendered
// from the engine's compiled cells and encoded with ffmpeg.
//   node tools/reel.mjs [--out docs/media/quadmotion-reel] [--cw 10] [--lang en]
// Writes <out>.gif (palette-optimised) and <out>.mp4.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { Raster, drawFrame } from "../src/core/png.mjs";
import { drawText as text, textWidth } from "../src/core/font5x7.mjs";
import { buildActs } from "../src/stage/index.mjs";
import { buildScenes } from "../src/scenes/index.mjs";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "docs/media/quadmotion-reel" },
    cw: { type: "string", default: "10" },
    lang: { type: "string", default: "en" },
  },
});

const cw = Number(values.cw);
const COLS = 64;
const ROWS = 12;
const STAGE_W = COLS * cw;
const STAGE_H = ROWS * cw * 2;
const PAD = 20;
const HEAD = 44;
const FOOT = 40;
const W = STAGE_W + PAD * 2;
const H = HEAD + STAGE_H + FOOT;
const BG = [14, 16, 22];
const PANEL = [8, 9, 13];
const TEAL = [64, 192, 168];
const BULB = [250, 204, 72];
const MUTED = [140, 147, 173];

function frameImage(compiledFrame, palette, caption, { offsetCols = 0, offsetRows = 0 } = {}) {
  const r = new Raster(W, H, BG);
  r.fill(PAD - 6, HEAD - 6, STAGE_W + 12, STAGE_H + 12, PANEL);
  drawFrame(r, compiledFrame, palette, PAD + offsetCols * cw, HEAD + offsetRows * cw * 2, cw);
  const lw = text(r, "QUAD", PAD, 14, TEAL);
  text(r, "MOTION", PAD + lw + 2, 14, BULB);
  if (caption) text(r, caption, W - PAD - textWidth(caption), 14, [231, 233, 243]);
  const foot = "TERMINAL PIXEL-ART · GITHUB.COM/LIQUIDRING/QUADMOTION";
  text(r, foot, Math.round((W - textWidth(foot)) / 2), H - FOOT + 14, MUTED);
  return r;
}

// Reel script: [act id, caption, frame step (2 = double speed), max frames]
const REEL = [
  ["hello", "MEET PIP", 1],
  ["walk-jump", "WALK & JUMP", 1],
  ["ball-kick", "BALL", 1],
  ["butterfly", "ACHOO!", 1],
  ["rain", "RAIN", 2],
  ["night", "NIGHT", 2],
  ["typing", "WORKING", 1],
  ["oops", "OOPS", 1],
  ["success", "SUCCESS", 1],
];

const tmp = join(tmpdir(), `qm-reel-${process.pid}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
let n = 0;
const emit = (r) => writeFileSync(join(tmp, `f${String(n++).padStart(5, "0")}.png`), r.png());

// Title: the logo's reveal and shimmer, centred on the stage.
const [logo] = buildScenes(["logo"]);
const lt = logo.timelines.main.frames;
const lo = { offsetCols: Math.floor((COLS - logo.rig.cols) / 2), offsetRows: Math.floor((ROWS - logo.rig.rows) / 2) - 1 };
const titleEnd = lt.findIndex((f, i) => i > 30 && f.frame.cells.flat().filter((c) => c.glyph.trim()).length < 20);
for (let i = 0; i < (titleEnd > 0 ? titleEnd : 80); i++) {
  const r = frameImage(lt[i].frame, logo.rig.palette, "LIVING MASCOTS FOR THE TERMINAL", lo);
  emit(r);
}

const acts = buildActs(REEL.map(([id]) => id), { lang: values.lang });
REEL.forEach(([id, caption, step], k) => {
  const frames = acts[k].timelines.main.frames;
  for (let i = 0; i < frames.length; i += step) emit(frameImage(frames[i].frame, acts[k].rig.palette, caption));
});

// End card: Pip idles under the install line.
const [idle] = buildActs(["idle-life"], { lang: values.lang });
for (let i = 0; i < 50; i++) {
  const r = frameImage(idle.timelines.main.frames[i].frame, idle.rig.palette, "NPX SKILLS ADD LIQUIDRING/QUADMOTION");
  emit(r);
}

const out = resolve(values.out);
mkdirSync(dirname(out), { recursive: true });
const seq = join(tmp, "f%05d.png");
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
ff(["-framerate", "20", "-i", seq, "-vf", "split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none", "-loop", "0", `${out}.gif`]);
ff(["-framerate", "20", "-i", seq, "-vf", "scale=iw*2:ih*2:flags=neighbor,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", `${out}.mp4`]);
rmSync(tmp, { recursive: true, force: true });
console.log(`${out}.gif\n${out}.mp4\n${n} frames, ${(n / 20).toFixed(1)} s, ${W}x${H}`);

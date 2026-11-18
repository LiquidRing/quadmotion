#!/usr/bin/env node
// QuadMotion CLI: validate | compile | preview | show | caps

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateRig } from "./core/validate.mjs";
import { compileRig, linesFor, poseTexts, toBundle } from "./core/pipeline.mjs";
import { detectCapabilities, detectCapabilitiesAsync } from "./core/caps.mjs";
import { TerminalPlayer } from "./core/player.mjs";
import { RigError, loadRig } from "./core/rig.mjs";
import { compileGridToFrame, frameToText } from "./core/quad-engine.mjs";
import { generateAnsiPlayer } from "./adapters/ansi-player.mjs";
import { generateInkModule } from "./adapters/ink-widget.mjs";
import { generateClaudeMod } from "./adapters/claude-mod.mjs";
import { generateSvg, generatePoseSvg } from "./adapters/svg-smil.mjs";

const HELP = `quadmotion <command> --input rig.json [options]

Commands
  validate   Check rig invariants (exit 1 on errors). --json for machine output.
  compile    --target ansi|json|ink|claude-mod|svg|text|all --out DIR
             [--timeline NAME] (svg: one timeline; default: every timeline)
             [--square] (svg: square sub-pixels) [--mod-name NAME] [--tick-ms N]
  preview    Play a timeline in this terminal. [--timeline NAME] [--loops N]
  show       Print every pose (or --pose NAME) once, colored.
  inspect    Print sub-pixel grids split into 2x2 cells beside the glyphs.
  demo       Play the showcase here: title, every Pip act, engine demos, rigs.
             [--scene act-or-scene,...] [--seconds N]
  strip      Render consecutive frames to a PNG to judge motion:
             --input rig.json | --act ID | --scene NAME  [--from N --count N --crop pip]
  play       Pip live in this terminal: ←/→ walk, Shift run, Space jump,
             Enter poke, 1-9 acts, q quit.
  caps       Print detected terminal capabilities.
  (compile also takes --scene NAME instead of --input to export a procedural scene)
`;

function readRig(path) {
  if (!path) fail("Missing --input rig.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`Cannot read rig ${path}: ${err.message}`);
  }
}

function fail(msg, code = 2) {
  process.stderr.write(`quadmotion: ${msg}\n`);
  process.exit(code);
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`wrote ${file}`);
}

function compileOrExit(raw) {
  try {
    return compileRig(raw);
  } catch (err) {
    if (err instanceof RigError) fail(`${err.message}\nRun "quadmotion validate" for details.`, 1);
    throw err;
  }
}

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    input: { type: "string", short: "i" },
    target: { type: "string", short: "t", default: "all" },
    out: { type: "string", short: "o", default: "dist" },
    timeline: { type: "string" },
    pose: { type: "string" },
    loops: { type: "string" },
    square: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    "mod-name": { type: "string" },
    "tick-ms": { type: "string" },
    scene: { type: "string" },
    seconds: { type: "string" },
  },
  allowPositionals: true,
  strict: command !== "strip", // strip parses its own options
});

switch (command) {
  case "validate": {
    const raw = readRig(values.input);
    const report = validateRig(raw);
    if (values.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`${report.ok ? "OK" : "FAILED"}  ${report.summary.name ?? ""}  ${report.summary.canvas ?? ""}`);
      for (const e of report.errors) console.log(`  error    [${e.code}] ${e.message}`);
      for (const w of report.warnings) console.log(`  warning  [${w.code}] ${w.message}`);
      for (const i of report.info) console.log(`  info     [${i.code}] ${i.message}`);
    }
    process.exit(report.ok ? 0 : 1);
    break;
  }
  case "compile": {
    const compiled = values.scene ? (await import("./scenes/index.mjs")).buildScenes([values.scene])[0] : compileOrExit(readRig(values.input));
    for (const w of compiled.warnings) process.stderr.write(`warning: ${w.where ?? ""} ${w.message}\n`);
    const out = resolve(values.out);
    const name = compiled.rig.name;
    const targets = values.target === "all" ? ["ansi", "json", "ink", "claude-mod", "svg", "text"] : values.target.split(",");
    for (const target of targets) {
      switch (target) {
        case "ansi":
          write(join(out, `${name}.player.mjs`), generateAnsiPlayer(compiled));
          break;
        case "json":
          write(join(out, `${name}.bundle.json`), `${JSON.stringify(toBundle(compiled))}\n`);
          break;
        case "ink": {
          const pascal = name.replace(/(^|[-_\s]+)(\w)/g, (_, __, c) => c.toUpperCase());
          write(join(out, `${pascal}Mascot.mjs`), generateInkModule(compiled));
          break;
        }
        case "claude-mod": {
          const files = generateClaudeMod(compiled, {
            modName: values["mod-name"],
            tickMs: values["tick-ms"] ? Number(values["tick-ms"]) : undefined,
          });
          const dir = join(out, values["mod-name"] ?? `${name}-mascot`);
          for (const [rel, content] of Object.entries(files)) write(join(dir, rel), content);
          break;
        }
        case "svg": {
          const names = values.timeline ? [values.timeline] : Object.keys(compiled.timelines);
          for (const tl of names) write(join(out, "svg", `${name}.${tl}.svg`), generateSvg(compiled, { timeline: tl, square: values.square }));
          for (const pose of Object.keys(compiled.poses)) write(join(out, "svg", "poses", `${name}.${pose}.svg`), generatePoseSvg(compiled, pose, { square: values.square }));
          break;
        }
        case "text": {
          const texts = poseTexts(compiled);
          const body = Object.entries(texts).map(([p, rows]) => `## ${p}\n${rows.map((r) => `|${r}|`).join("\n")}`).join("\n\n");
          write(join(out, `${name}.poses.txt`), `${body}\n`);
          const caps = { trueColor: true };
          const ansi = linesFor(compiled, caps);
          write(join(out, `${name}.poses.ans`), `${Object.entries(ansi.poses).map(([p, l]) => `${p}\n${l.join("\n")}`).join("\n\n")}\n`);
          break;
        }
        default:
          fail(`Unknown target "${target}". Use ansi|json|ink|claude-mod|svg|text|all.`);
      }
    }
    break;
  }
  case "preview": {
    const raw = readRig(values.input);
    const compiled = compileOrExit(raw);
    const caps = await detectCapabilitiesAsync();
    const player = new TerminalPlayer(compiled, caps);
    const loops = values.loops ? Number(values.loops) : caps.isTTY ? Infinity : 1;
    try {
      await player.play(values.timeline ?? compiled.rig.defaultTimeline, { loops });
    } catch (err) {
      fail(err.message);
    } finally {
      player.restore();
    }
    break;
  }
  case "show": {
    const raw = readRig(values.input);
    const compiled = compileOrExit(raw);
    const caps = detectCapabilities();
    const ansi = linesFor(compiled, caps);
    for (const [pose, lines] of Object.entries(ansi.poses)) {
      if (values.pose && pose !== values.pose) continue;
      console.log(`${pose}\n${lines.join("\n")}\n`);
    }
    break;
  }
  case "inspect": {
    // Sub-pixel grid with cell boundaries next to the compiled glyphs: lets an
    // agent see exactly which 2x2 cell a pixel lands in before editing.
    const raw = readRig(values.input);
    const { rig } = loadRig(raw);
    for (const [pose, grid] of Object.entries(rig.poses)) {
      if (values.pose && pose !== values.pose) continue;
      const frame = compileGridToFrame(grid, rig.palette);
      const glyphs = frameToText(frame);
      const ruler = Array.from({ length: rig.cols }, (_, c) => String(c % 10).padEnd(2)).join("|");
      console.log(`## ${pose}   (cell columns ${0}..${rig.cols - 1}; '.' transparent)`);
      console.log(`     ${ruler}`);
      grid.forEach((row, y) => {
        const cells = [];
        for (let c = 0; c < rig.cols; c++) cells.push((row[c * 2] ?? ".") + (row[c * 2 + 1] ?? "."));
        const r = Math.floor(y / 2);
        console.log(`${String(y).padStart(2)} r${r} ${cells.join("|")}   ${y % 2 === 0 ? `|${glyphs[r]}|` : ""}`);
      });
      for (const w of frame.warnings) console.log(`   ! ${w.message}`);
      console.log("");
    }
    break;
  }
  case "demo": {
    // The whole show in this terminal: procedural scenes, then the cast.
    const { buildScenes, buildCast, SCENES } = await import("./scenes/index.mjs");
    const order = values.scene ? values.scene.split(",") : ["logo", "resolution", "physics", "widgets", "fire"];
    const seconds = values.seconds ? Number(values.seconds) : 6;
    const caps = await detectCapabilitiesAsync();
    const { buildActs } = await import("./stage/index.mjs");
    const { ACTS } = await import("./stage/acts.mjs");
    const actIds = values.scene ? values.scene.split(",").filter((n) => ACTS[n]) : Object.keys(ACTS);
    const shows = [...(values.scene ? [] : buildScenes(["logo"])), ...buildActs(actIds, { lang: (process.env.QUADMOTION_LANG ?? process.env.LANG ?? "").toLowerCase().startsWith("ru") ? "ru" : "en" }), ...buildScenes(order.filter((n) => SCENES[n] && (values.scene || n !== "logo"))), ...(values.scene ? [] : buildCast())];
    const dim = (s) => (caps.noColor || !caps.isTTY ? s : `\x1b[2m${s}\x1b[0m`);
    for (const show of shows) {
      const tlName = show.rig.defaultTimeline;
      const tl = show.timelines[tlName];
      const pass = tl.frames.reduce((s, f) => s + f.durationMs, 0);
      const title = show.rig.title ?? show.rig.name;
      console.log(dim(`── ${title} · ${show.rig.cols}×${show.rig.rows} cells · ${tl.frames.length} frames ──`));
      const player = new TerminalPlayer(show, caps);
      if (!caps.isTTY) {
        player.draw(show.poses[show.rig.reducedMotionPose] ?? tl.frames[0].frame);
      } else {
        try {
          const isAct = Boolean(show.meta);
          await player.play(tlName, { loops: isAct ? 1 : tl.loop ? Math.max(1, Math.round((seconds * 1000) / pass)) : 1 });
          // A scene whose pass ends empty (the title card) settles on its still frame.
          const lastCells = tl.frames.at(-1).frame.cells.flat().filter((c) => c.glyph.trim()).length;
          if (lastCells < 4) player.draw(show.poses[show.rig.reducedMotionPose]);
        } finally {
          player.restore();
        }
      }
      console.log("");
    }
    break;
  }
  case "strip": {
    const { runStrip } = await import("./strip.mjs");
    try {
      console.log(await runStrip(rest));
    } catch (err) {
      fail(err.message);
    }
    break;
  }
  case "play": {
    const { playInTerminal } = await import("./stage/terminal-play.mjs");
    await playInTerminal();
    break;
  }
  case "caps":
    console.log(JSON.stringify(await detectCapabilitiesAsync(), null, 2));
    break;
  default:
    process.stdout.write(HELP);
    process.exit(command ? 2 : 0);
}

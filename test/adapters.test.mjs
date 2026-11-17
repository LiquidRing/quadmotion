import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { compileRig, poseTexts } from "../src/core/pipeline.mjs";
import { generateAnsiPlayer } from "../src/adapters/ansi-player.mjs";
import { generateSvg } from "../src/adapters/svg-smil.mjs";
import { generateClaudeMod } from "../src/adapters/claude-mod.mjs";
import { generateInkModule, createMascotComponent } from "../src/adapters/ink-widget.mjs";

const pip = JSON.parse(readFileSync(new URL("../assets/pip.rig.json", import.meta.url), "utf8"));
const compiled = compileRig(pip);

test("standalone ANSI player runs with plain node and no dependencies", () => {
  const dir = mkdtempSync(join(tmpdir(), "qm-"));
  const file = join(dir, "pip.player.mjs");
  writeFileSync(file, generateAnsiPlayer(compiled));
  const list = execFileSync(process.execPath, [file, "--list"], { encoding: "utf8" });
  assert.deepEqual(list.trim().split(/\r?\n/), Object.keys(compiled.timelines));
  const out = execFileSync(process.execPath, [file, "jump_wave"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  const blocks = out.replace(/\r?\n$/, "").split(/\r?\n/);
  assert.equal(blocks.length % 3, 0, "whole 3-row frames only");
  assert.deepEqual(blocks.slice(-3), poseTexts(compiled).default);
  assert.ok(!out.includes("\x1b"), "no escape codes without a TTY and with NO_COLOR");
});

test("SVG: one group per distinct frame, discrete SMIL, reduced-motion fallback", () => {
  const svg = generateSvg(compiled, { timeline: "idle" });
  assert.match(svg, /^<svg xmlns/);
  const groups = svg.match(/class="qm-anim"/g).length;
  assert.equal(groups, 4, "default, blink, look_left, look_right");
  assert.match(svg, /calcMode="discrete"/);
  assert.match(svg, /repeatCount="indefinite"/);
  assert.match(svg, /prefers-reduced-motion/);
  assert.match(svg, /setCurrentTime/);
  const once = generateSvg(compiled, { timeline: "jump_wave" });
  assert.match(once, /fill="freeze"/);
  assert.ok(!once.includes("setCurrentTime"));
  // 1:2 sub-pixel rects by default, square on request
  assert.match(svg, /height="2"/);
  assert.ok(!generateSvg(compiled, { timeline: "idle", square: true }).includes('height="2"'));
});

test("Claude Code mod: manifest, contract, timer in session.start, band yields", () => {
  const files = generateClaudeMod(compiled);
  const manifest = JSON.parse(files[".claude-plugin/plugin.json"]);
  assert.equal(manifest.name, "pip-mascot");
  assert.equal(manifest.types, "./types/index.d.ts");
  assert.deepEqual(JSON.parse(files["hooks/hooks.json"]), { modules: ["./register.tsx"] });
  const reg = files["hooks/register.tsx"];
  const start = reg.indexOf("on('session.start'");
  assert.ok(start > 0 && reg.indexOf("$.clock.every", start) > start, "timer lives in session.start");
  assert.ok(!/on\('turn\.start'/.test(reg));
  assert.match(reg, /e\.props\.maxRows < ROWS/);
  assert.match(files["types/index.d.ts"], /'pip-mascot': \{ frame: FrameIndex \}/);
  assert.match(reg, /e\.props\.isWorking/, "interrupted turns fall back to idle");
  assert.match(files["tests/mascot.test.tsx"], /from 'claude-code\/testing'/);
  assert.ok(!/<Text key=/.test(reg), "Text takes no key in the mod renderer");
});

test("Ink module embeds the component factory; factory renders fixed-height rows", () => {
  const mod = generateInkModule(compiled);
  assert.match(mod, /function createMascotComponent/);
  assert.match(mod, /from "ink"/);
  // Fake React/Ink: render tree to text.
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children: children.flat() }),
    useState: (v) => [v, () => {}],
    useEffect: () => {},
  };
  const ink = { Box: "Box", Text: "Text" };
  const data = JSON.parse(mod.match(/export const DATA = (.*);\n/)[1]);
  const Pip = createMascotComponent(data, { React, ink });
  const tree = Pip({ reducedMotion: true });
  assert.equal(tree.props.height, 3);
  const text = (n) => (typeof n === "string" ? n : n.children.map(text).join(""));
  assert.deepEqual(tree.children.map(text), poseTexts(compiled).default);
});

test("standalone player plays one pass of a looping timeline without a TTY", () => {
  const dir = mkdtempSync(join(tmpdir(), "qm-"));
  const file = join(dir, "pip.player.mjs");
  writeFileSync(file, generateAnsiPlayer(compiled));
  const out = execFileSync(process.execPath, [file, "idle"], { encoding: "utf8", timeout: 30000, env: { ...process.env, NO_COLOR: "1" } });
  // idle alternates 4 distinct poses; one pass prints each change once
  const frames = out.replace(/\r?\n$/, "").split(/\r?\n/).length / 3;
  assert.equal(frames, compiled.timelines.idle.frames.length);
});

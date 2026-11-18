import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VTerm, stripAnsi } from "./vterm.mjs";
import { renderSynchronizedFrame, SYNC_BEGIN, SYNC_END } from "../src/core/quad-engine.mjs";
import { compileRig, linesFor } from "../src/core/pipeline.mjs";
import { TerminalPlayer } from "../src/core/player.mjs";

const pip = JSON.parse(readFileSync(new URL("../assets/pip.rig.json", import.meta.url), "utf8"));

function allFrames(compiled, caps) {
  const out = [];
  const lines = linesFor(compiled, caps);
  for (const tl of Object.values(lines.timelines)) for (const f of tl.frames) out.push(f.lines);
  return out;
}

test("diffed frames leave the screen identical to a full redraw, cursor parked below", () => {
  const compiled = compileRig(pip);
  for (const caps of [{ trueColor: true, syncOutput: true }, { trueColor: false }, { fullRepaint: true }]) {
    const frames = allFrames(compiled, caps);
    const term = new VTerm(20, 8);
    term.write("header\n");
    let prev = null;
    for (const lines of frames) {
      const { payload } = renderSynchronizedFrame(lines, prev, caps);
      term.write(payload);
      prev = lines;
      // Sprite occupies rows 1..3, cursor rests at column 0 of row 4.
      assert.deepEqual(term.lines(1, 3), lines.map((l) => stripAnsi(l).replace(/\s+$/, "")));
      assert.equal(term.y, 4);
      assert.equal(term.x, 0);
      assert.equal(term.lines(0, 1)[0], "header", "content above is untouched");
    }
  }
});

test("payload is wrapped in DEC 2026 only when supported; unchanged frame is empty", () => {
  const a = ["aaa", "bbb", "ccc"];
  const b = ["aaa", "bXb", "ccc"];
  const first = renderSynchronizedFrame(a, null, { syncOutput: true }).payload;
  assert.ok(first.startsWith(SYNC_BEGIN) && first.endsWith(SYNC_END));
  const diff = renderSynchronizedFrame(b, a, { syncOutput: true }).payload;
  assert.equal(diff, `${SYNC_BEGIN}\x1b[3A\x1b[1B\r\x1b[2KbXb\r\x1b[2B${SYNC_END}`);
  assert.equal(renderSynchronizedFrame(a, a, { syncOutput: true }).payload, "");
  assert.ok(!renderSynchronizedFrame(b, a, {}).payload.includes("2026"));
});

test("every frame of every timeline compiles to the canvas size", () => {
  const compiled = compileRig(pip);
  for (const tl of Object.values(compiled.timelines)) {
    for (const f of tl.frames) {
      assert.equal(f.frame.rows, 3);
      assert.equal(f.frame.cells.every((line) => line.length === 9), true);
    }
  }
});

test("TerminalPlayer plays a one-shot timeline in place and restores the cursor", async () => {
  const compiled = compileRig(pip);
  const term = new VTerm(20, 8);
  const chunks = [];
  const stream = { isTTY: true, columns: 80, write: (s) => (chunks.push(s), term.write(s.replace(/\x1b\[\?25[lh]/g, ""))) };
  let clock = 0;
  const player = new TerminalPlayer(compiled, { isTTY: true, syncOutput: true, trueColor: true, columns: 80 }, {
    stream,
    now: () => clock,
    setTimer: (fn, ms) => {
      clock += ms;
      queueMicrotask(fn);
      return 1;
    },
    clearTimer: () => {},
  });
  await player.play("jump_wave");
  player.restore();
  const expected = linesFor(compiled, { trueColor: true }).timelines.jump_wave.frames.at(-1).lines.map((l) => stripAnsi(l).replace(/\s+$/, ""));
  assert.deepEqual(term.lines(0, 3), expected);
  assert.equal(term.y, 3);
  assert.ok(chunks[0].includes("\x1b[?25l"));
  assert.ok(chunks.at(-1).includes("\x1b[?25h"));
  const total = compiled.timelines.jump_wave.frames.reduce((s, f) => s + f.durationMs, 0);
  assert.equal(clock, total, "drift-free schedule sums exactly to the timeline length");
});

test("reduced motion draws the still pose once", async () => {
  const compiled = compileRig(pip);
  const out = [];
  const player = new TerminalPlayer(compiled, { isTTY: false, reducedMotion: true, noColor: true }, { stream: { write: (s) => out.push(s) } });
  await player.play("celebrate");
  assert.equal(out.length, 1);
  assert.equal(out[0], "  ▄▄▄▄▄  \n ▝▙███▟▘ \n  ▝▘ ▝▘  \n");
});

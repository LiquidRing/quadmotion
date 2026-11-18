// `quadmotion play`: Pip live in the terminal. The world ticks every 50 ms,
// each tick compiles to quadrant cells and only changed rows are rewritten
// inside DEC 2026 synchronized output.
//
// Keys: ← → walk (tap again to stop) · Shift+← → run · Space jump
//       Enter poke · 1-9 acts · Tab next page of acts · q / Ctrl+C quit

import { detectCapabilitiesAsync } from "../core/caps.mjs";
import { frameToAnsiLines, renderSynchronizedFrame, CURSOR_HIDE, CURSOR_SHOW } from "../core/quad-engine.mjs";
import { createLive } from "./browser.mjs";
import { ACTS } from "./acts.mjs";

export async function playInTerminal({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY) {
    output.write("quadmotion play needs an interactive terminal.\n");
    return;
  }
  const caps = await detectCapabilitiesAsync();
  const cols = Math.max(40, Math.min(80, (output.columns ?? 80) - 2));
  // Speech follows the user's locale (QUADMOTION_LANG overrides): ru or en.
  const locale = (process.env.QUADMOTION_LANG ?? process.env.LC_ALL ?? process.env.LANG ?? "").toLowerCase();
  const live = createLive({ cols: cols - (cols % 2), rows: 12, lang: locale.startsWith("ru") ? "ru" : "en" });
  const ids = Object.keys(ACTS);
  let page = 0;
  let walking = 0;
  let prev = null;

  const help = () => {
    const shown = ids.slice(page * 9, page * 9 + 9).map((id, i) => `${i + 1} ${ACTS[id].title}`);
    return [`←/→ walk  Shift run  Space jump  Enter poke  Tab more  q quit`, shown.join(" · ").slice(0, live.world.cols)];
  };

  output.write(CURSOR_HIDE);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  const quit = () => {
    clearInterval(timer);
    input.setRawMode(false);
    input.pause();
    output.write(`${CURSOR_SHOW}\n`);
  };

  const timer = setInterval(() => {
    live.step();
    const frame = live.frame();
    const lines = [...frameToAnsiLines(frame, live.palette, caps), ...help().map((l) => `\x1b[2m${l}\x1b[0m`)];
    const { payload } = renderSynchronizedFrame(lines, prev, caps);
    if (payload) output.write(payload);
    prev = lines;
  }, live.TICK_MS);

  input.on("data", (key) => {
    if (key === "q" || key === "\u0003") return quit();
    const right = key === "\u001b[C" || key === "\u001b[1;2C";
    const left = key === "\u001b[D" || key === "\u001b[1;2D";
    if (right || left) {
      const dir = right ? 1 : -1;
      const run = key.includes("1;2");
      if (walking === dir) walking = 0; // tap again to stop
      else {
        walking = dir;
        live.walkHeld(dir, () => walking === dir, run);
      }
    } else if (key === " ") live.jump(walking);
    else if (key === "\r") live.poke();
    else if (key === "\t") page = (page + 1) % Math.ceil(ids.length / 9);
    else if (/^[1-9]$/.test(key)) {
      const id = ids[page * 9 + Number(key) - 1];
      if (id) live.play(id);
    }
  });
  await new Promise((resolve) => input.once("pause", resolve));
}

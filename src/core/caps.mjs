// Terminal capability detection: true color, DEC Mode 2026 (via DECRQM),
// Apple Terminal, reduced motion, no-color, full repaint.

const TRUECOLOR_PROGRAMS = new Set(["iTerm.app", "WezTerm", "ghostty", "vscode", "Hyper", "Tabby", "rio", "WarpTerminal"]);
const SYNC_PROGRAMS = new Set(["WezTerm", "ghostty", "iTerm.app", "vscode", "rio", "contour"]);

const truthy = (v) => v != null && v !== "" && v !== "0" && v.toLowerCase?.() !== "false";

/**
 * Capabilities from the environment alone (no I/O).
 * Env overrides:
 *   QUADMOTION_TRUECOLOR=0|1, QUADMOTION_SYNC_OUTPUT=0|1 (alias CLAUDE_CODE_FORCE_SYNC_OUTPUT=1),
 *   QUADMOTION_REDUCED_MOTION=1, QUADMOTION_FULL_REPAINT=1 (alias CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1),
 *   QUADMOTION_BG_FILL=1, NO_COLOR, FORCE_COLOR=3.
 */
export function detectCapabilities(env = process.env, stream = process.stdout) {
  const program = env.TERM_PROGRAM ?? "";
  const term = env.TERM ?? "";
  const isAppleTerminal = program === "Apple_Terminal";
  const isTTY = Boolean(stream?.isTTY);

  let trueColor =
    !isAppleTerminal &&
    (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? "") ||
      TRUECOLOR_PROGRAMS.has(program) ||
      Boolean(env.WT_SESSION) ||
      /kitty|ghostty|foot|alacritty|direct|wezterm/i.test(term) ||
      env.FORCE_COLOR === "3");
  if (env.QUADMOTION_TRUECOLOR != null) trueColor = truthy(env.QUADMOTION_TRUECOLOR);

  // Unknown private modes are ignored by conforming terminals, so emitting
  // 2026 is harmless; the heuristic only decides the default. tmux < 3.7
  // swallows it, so we stay off there unless forced or probed.
  let syncOutput = env.TMUX ? false : SYNC_PROGRAMS.has(program) || Boolean(env.WT_SESSION) || /kitty|ghostty|foot|wezterm/i.test(term) || isTTY;
  if (truthy(env.CLAUDE_CODE_FORCE_SYNC_OUTPUT)) syncOutput = true;
  if (env.QUADMOTION_SYNC_OUTPUT != null) syncOutput = truthy(env.QUADMOTION_SYNC_OUTPUT);

  return {
    isTTY,
    trueColor,
    syncOutput,
    syncProbed: false,
    isAppleTerminal,
    bgFill: isAppleTerminal || truthy(env.QUADMOTION_BG_FILL),
    noColor: env.NO_COLOR != null && env.NO_COLOR !== "",
    reducedMotion: truthy(env.QUADMOTION_REDUCED_MOTION) || truthy(env.REDUCED_MOTION),
    fullRepaint: truthy(env.QUADMOTION_FULL_REPAINT) || truthy(env.CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT),
    columns: stream?.columns ?? 80,
  };
}

/**
 * Ask the terminal whether it supports DEC Mode 2026 (DECRQM: CSI ? 2026 $ p).
 * Reply: CSI ? 2026 ; Ps $ y where Ps 1/2 = supported (set/reset),
 * 0 = not recognized, 3/4 = permanently set/reset.
 * Resolves true/false, or null when nothing answered within timeoutMs.
 */
export function probeSyncOutput({ input = process.stdin, output = process.stdout, timeoutMs = 150 } = {}) {
  return new Promise((resolve) => {
    if (!input?.isTTY || !output?.isTTY || typeof input.setRawMode !== "function") {
      resolve(null);
      return;
    }
    const wasRaw = input.isRaw;
    let buf = "";
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      input.off("data", onData);
      try {
        input.setRawMode(wasRaw);
      } catch {}
      input.pause();
      resolve(value);
    };
    const onData = (chunk) => {
      buf += chunk.toString("latin1");
      const m = /\x1b\[\?2026;(\d)\$y/.exec(buf);
      if (m) finish(m[1] === "1" || m[1] === "2" || m[1] === "3");
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      input.setRawMode(true);
    } catch {
      finish(null);
      return;
    }
    input.on("data", onData);
    input.resume();
    output.write("\x1b[?2026$p");
  });
}

/** detectCapabilities + DECRQM probe (only on a real TTY). */
export async function detectCapabilitiesAsync(env = process.env, io = {}) {
  const caps = detectCapabilities(env, io.output ?? process.stdout);
  const forced = env.QUADMOTION_SYNC_OUTPUT != null || truthy(env.CLAUDE_CODE_FORCE_SYNC_OUTPUT);
  if (!forced && caps.isTTY) {
    const probed = await probeSyncOutput(io);
    if (probed !== null) {
      caps.syncOutput = probed;
      caps.syncProbed = true;
    }
  }
  return caps;
}

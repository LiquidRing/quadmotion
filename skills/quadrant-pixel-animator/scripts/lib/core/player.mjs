// Fixed-height terminal player: plays hold timelines in place with diffed,
// synchronized frames. Height never changes, so nothing below the sprite jumps.

import { renderSynchronizedFrame, CURSOR_HIDE, CURSOR_SHOW } from "./quad-engine.mjs";
import { frameToAnsiLines } from "./quad-engine.mjs";

/**
 * @param {object} compiled  result of compileRig()
 * @param {object} caps      result of detectCapabilities()
 * @param {object} [opts]    { stream, now, setTimer, clearTimer }
 */
export class TerminalPlayer {
  constructor(compiled, caps, opts = {}) {
    this.compiled = compiled;
    this.caps = caps;
    this.stream = opts.stream ?? process.stdout;
    this.now = opts.now ?? (() => performance.now());
    this.setTimer = opts.setTimer ?? setTimeout;
    this.clearTimer = opts.clearTimer ?? clearTimeout;
    this.prev = null;
    this.timer = null;
    this.running = false;
    this.cursorHidden = false;
    this._onExit = () => this.restore();
    this._onSigint = () => {
      this.restore();
      process.exit(130);
    };
    // A closed pipe (e.g. `| head`) ends playback instead of crashing.
    this.stream.on?.("error", (err) => {
      if (err?.code === "EPIPE") this.stop();
      else throw err;
    });
  }

  get palette() {
    return this.compiled.rig.palette;
  }

  /** Draw one frame (compiled frame object) in place. */
  draw(frame) {
    const lines = frameToAnsiLines(frame, this.palette, this.caps);
    if (!this.caps.isTTY) {
      // No cursor control without a TTY: print each distinct frame once.
      if (!this.prev || this.prev.join("\n") !== lines.join("\n")) this.stream.write(`${lines.join("\n")}\n`);
      this.prev = lines;
      return;
    }
    const { payload } = renderSynchronizedFrame(lines, this.prev, this.caps);
    if (payload) this.stream.write(payload);
    this.prev = lines;
  }

  _hideCursor() {
    if (!this.caps.isTTY || this.cursorHidden) return;
    this.stream.write(CURSOR_HIDE);
    this.cursorHidden = true;
    process.once("exit", this._onExit);
    process.once("SIGINT", this._onSigint);
  }

  /** Restore the cursor; safe to call many times. */
  restore() {
    if (this.cursorHidden) {
      this.stream.write(CURSOR_SHOW);
      this.cursorHidden = false;
    }
    process.off("exit", this._onExit);
    process.off("SIGINT", this._onSigint);
  }

  /**
   * Play a timeline. Resolves when it finishes (`loops` passes for looping
   * timelines; Infinity = until stop()). With reduced motion, draws the
   * rig's reducedMotionPose once and resolves.
   */
  play(timelineName = this.compiled.rig.defaultTimeline, { loops = Infinity } = {}) {
    this.stop();
    const tl = this.compiled.timelines[timelineName];
    if (!tl) return Promise.reject(new Error(`Unknown timeline "${timelineName}". Known: ${Object.keys(this.compiled.timelines).join(", ")}`));
    if (this.caps.reducedMotion) {
      this.draw(this.compiled.poses[this.compiled.rig.reducedMotionPose]);
      return Promise.resolve();
    }
    const cols = this.compiled.rig.cols;
    if (this.caps.isTTY && this.caps.columns < cols) {
      // Too narrow: drawing would wrap rows and break the cursor math. Hide.
      return Promise.resolve();
    }
    this._hideCursor();
    this.running = true;
    const passes = tl.loop ? loops : 1;
    return new Promise((resolve) => {
      this._resolve = resolve;
      let index = 0;
      let pass = 0;
      // Drift-free schedule: each frame is due at start + sum(previous durations).
      let due = this.now();
      const step = () => {
        if (!this.running) return;
        const f = tl.frames[index];
        this.draw(f.frame);
        due += f.durationMs;
        index++;
        if (index >= tl.frames.length) {
          index = 0;
          pass++;
          if (pass >= passes) {
            this.timer = this.setTimer(() => this._finish(), Math.max(0, due - this.now()));
            return;
          }
        }
        this.timer = this.setTimer(step, Math.max(0, due - this.now()));
      };
      step();
    });
  }

  _finish() {
    this.running = false;
    this.timer = null;
    const r = this._resolve;
    this._resolve = null;
    r?.();
  }

  stop() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    if (this.running) this._finish();
  }
}

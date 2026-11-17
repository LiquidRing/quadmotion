// Minimal virtual terminal for tests: text, \n, \r, CUU (A), CUD (B), EL (2K),
// SGR and private modes (ignored). Enough to check diff-renderer cursor math.

export class VTerm {
  constructor(cols = 40, rows = 12) {
    this.cols = cols;
    this.rows = rows;
    this.x = 0;
    this.y = 0;
    this.grid = Array.from({ length: rows }, () => new Array(cols).fill(" "));
    this.syncDepth = 0;
    this.syncFrames = 0;
  }

  write(data) {
    const s = String(data);
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\x1b") {
        const m = /^\x1b\[(\??)([0-9;]*)(\$?)([A-Za-z])/.exec(s.slice(i));
        if (!m) throw new Error(`Unsupported escape at ${i}: ${JSON.stringify(s.slice(i, i + 10))}`);
        const [all, priv, params, dollar, cmd] = m;
        const n = params === "" ? 1 : Number(params.split(";")[0]);
        if (priv === "?") {
          if (params === "2026" && cmd === "h") this.syncDepth++;
          if (params === "2026" && cmd === "l") {
            this.syncDepth--;
            this.syncFrames++;
          }
        } else if (!dollar) {
          if (cmd === "A") this.y = Math.max(0, this.y - n);
          else if (cmd === "B") this.y = Math.min(this.rows - 1, this.y + n);
          else if (cmd === "K" && params === "2") this.grid[this.y].fill(" ");
          else if (cmd === "m") {
            /* colors ignored */
          } else throw new Error(`Unsupported CSI ${cmd}`);
        }
        i += all.length;
        continue;
      }
      if (ch === "\n") {
        this.y++;
        this.x = 0; // ONLCR
        if (this.y >= this.rows) {
          this.grid.shift();
          this.grid.push(new Array(this.cols).fill(" "));
          this.y = this.rows - 1;
        }
      } else if (ch === "\r") {
        this.x = 0;
      } else {
        const cp = s.codePointAt(i);
        const glyph = String.fromCodePoint(cp);
        if (this.x < this.cols) this.grid[this.y][this.x] = glyph;
        this.x++;
        i += glyph.length;
        continue;
      }
      i++;
    }
  }

  lines(from = 0, count = this.rows) {
    return this.grid.slice(from, from + count).map((r) => r.join("").replace(/\s+$/, ""));
  }
}

/** Strip SGR codes from a rendered line. */
export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

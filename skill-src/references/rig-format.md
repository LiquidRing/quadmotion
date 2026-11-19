# Rig format

Schema: `assets/rig.schema.json`. Full example: `assets/starter-companion.rig.json`.

```json
{
  "name": "pip",
  "canvas": { "cols": 9, "rows": 3 },
  "palette": {
    "#": { "name": "body", "rgb": [64, 192, 168], "ansi16": 96 },
    "E": { "name": "eye",  "rgb": [22, 26, 38],  "ansi16": 30, "ansi16Bg": 40 }
  },
  "poses": {
    "default": { "pixels": ["..18 chars..", "... 6 rows ..."] },
    "blink":   { "pose": "default", "remap": { "E": "#" } },
    "dressed": { "layers": ["default", { "pose": "hat", "dx": 2, "dy": 0 }] }
  },
  "timelines": {
    "idle": { "tickMs": 60, "loop": true, "frames": [
      { "pose": "default", "hold": 50 }, { "pose": "blink", "hold": 2 } ] }
  },
  "defaultTimeline": "idle",
  "reducedMotionPose": "default",
  "events": { "session.start": "idle", "idle": "idle", "tool.call": "idle", "turn.complete": "idle" }
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `canvas.cols`, `canvas.rows` | Container size in terminal cells. Sub-pixel grid = `cols*2` x `rows*2`. Fixed for every frame. |
| `palette` | One-character tokens. `.` and space are transparent. Order matters: on a 2/2 tie the earlier token is the foreground. |
| `poses.<name>.pixels` | Rows of tokens, top to bottom. Shorter blocks are placed at the top-left and padded with transparency. |
| `poses.<name>.pose` + `remap` | Reuse another pose with token substitution (blink, color swap). |
| `poses.<name>.layers` | Stack poses or pixel blocks bottom to top; `dx`/`dy` shift a layer in sub-pixels. |
| `timelines.<name>.frames[]` | `{ pose, hold, dx?, dy?, overlays? }`. `hold` = ticks. `dx`/`dy` move the whole pose. |
| `overlays[]` | `{ text, col, row, fg?, bg? }` in terminal cells, drawn after compiling: speech, labels, trails `░ ▒ ▓`. |
| `tickMs` | Base tick per timeline (>= 16). |
| `loop` | `false` plays once and holds the last frame. |
| `reducedMotionPose` | Still pose drawn when reduced motion is requested. |
| `events` | Timelines a Claude Code mod plays on `session.start`, while `idle`, on `tool.call` (while working), on `turn.complete`. |

## Cell rule

Index sub-pixels from 0. Cell `(c, r)` covers columns `2c, 2c+1` and rows
`2r, 2r+1`. A pixel at column 5 is the right half of cell 2; at column 6 the
left half of cell 3. Cells with more than two tokens are folded for the
terminal (see quadrant-spec.md); check the cost with `strip --view compare`.
`node scripts/inspect.mjs` prints the grid already split into cells.

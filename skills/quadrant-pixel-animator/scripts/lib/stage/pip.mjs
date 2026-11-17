// Pip as a puppet: small authored parts placed on whole sub-pixels.
//
// Rules that keep the quadrant compiler clean while Pip moves:
//  - the root x is always even and every part has an even width and even x
//    offset, so Pip is cell-aligned horizontally and no cell mixes two parts
//    side by side with transparency; vertical position is free (half cells);
//  - eyes, mouth and blush sit at least 2 sub-pixels inside the body, so their
//    cells hold only body + feature;
//  - feet are the source of truth: a planted foot sits on the ground row and
//    keeps its world x; the body is placed from the feet.
//
// Coordinates: x right, y down, sub-pixels. state.x = centre between the feet,
// state.ground = the first ground row (feet end on ground - 1).

const BODY = {
  // name: [width, height]; widths are multiples of 4 so the half-width is even
  s2: [28, 6],
  s1: [28, 7],
  n: [24, 8],
  b: [24, 9], // inhale
  t1: [20, 9],
  t2: [20, 10],
};

function bodyRows(w, h) {
  // Rounded box: 2-px inset on the top row, 1-px on the second and the last.
  const rows = [];
  for (let y = 0; y < h; y++) {
    const inset = y === 0 ? 2 : y === 1 || y === h - 1 ? 1 : 0;
    rows.push([inset, w - inset]);
  }
  return rows;
}

// Exported so act groups can add their own features (EYES.dizzy = [...]).
export const EYES = {
  open: ["##", "##", "##"],
  look_up: ["##", "##", ".."],
  blink: ["..", "..", "##"],
  closed: ["..", "##", ".."],
  wide: ["##", "##", "##", "##"],
  happy: [".##.", "#..#"],
  sleepy: ["..", "##", "##"],
  x: ["#.#", ".#.", "#.#"],
};

export const MOUTHS = {
  smile: ["#..#", ".##."],
  o: ["##", "##"],
  open: [".##.", "####", ".##."],
  flat: ["####"],
  grin: ["######", ".####."],
};

// Arms, drawn for the right side with (0,0) at the shoulder's outer edge,
// 2 sub-pixels wide per step so they stay cell-aligned. Mirrored for the left.
export const ARMS = {
  down: [[0, 0], [0, 1], [0, 2], [0, 3]],
  out: [[0, 0], [2, 0], [4, 0], [0, 1], [2, 1], [4, 1]],
  up: [[0, 0], [0, -1], [0, -2], [0, -3], [0, -4], [0, -5]],
  wave: [[0, 0], [2, -1], [2, -2], [2, -3], [2, -4]],
  back: [[0, 1], [0, 2], [-0, 3], [2, 3]].map(([x, y]) => [-x, y]),
  hold: [[0, 0], [2, 0], [2, 1], [4, 1]],
  reach: [[0, 0], [2, -1], [4, -2], [6, -3]],
  type: [[0, 0], [0, 1], [2, 2], [4, 2]],
};

/** Paint a token at (x, y) if inside the canvas. */
const put = (c, x, y, t) => c.set(x, y, t);

function stamp(c, rows, x, y, tok) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && put(c, x + i, y + j, tok)));
}

/**
 * Draw Pip. Returns the drawn box and the feet so callers and checks can
 * reason about contact.
 * state = {
 *   x, ground, y = 0 (height of the feet above the ground: 0 = standing),
 *   legLen = 3 (hip to foot; 1-2 = crouch),
 *   body = 'n', facing = 1, look = 0 (-2..2), lookY = 0,
 *   eyes = 'open', mouth = null, blush = false,
 *   armL = 'down', armR = 'down', antenna = 0 (-2..2 lean), bulb = 'on',
 *   feet = [{ x, lift }, { x, lift }]  (world x of each leg column, lift above the baseline; optional)
 * }
 */
export function drawPip(c, s) {
  const P = { body: "#", eye: "E", bulb: s.bulb === "off" ? "a" : s.bulb === "glow" ? "W" : "A", blush: "p" };
  const [w, h] = BODY[s.body ?? "n"];
  const x = Math.round(s.x / 2) * 2;
  const facing = s.facing ?? 1;
  const legLen = s.legLen ?? 2;
  // Feet baseline: the row just above the ground, raised by y when airborne.
  const footY = s.ground - 1 - Math.round(s.y ?? 0);
  const bodyBottom = footY - legLen;
  const top = bodyBottom - h + 1;
  const left = x - w / 2;

  // Legs: a 2-wide column from under the body to the foot, foot pad 4 wide.
  const feet = s.feet ?? [
    { x: x - 6, lift: 0 },
    { x: x + 4, lift: 0 },
  ];
  for (const f of feet) {
    const fx = Math.round(f.x / 2) * 2;
    const fy = footY - Math.max(0, Math.round(f.lift ?? 0));
    for (let y = bodyBottom + 1; y <= fy; y++) {
      put(c, fx, y, P.body);
      put(c, fx + 1, y, P.body);
    }
    // Foot pad points the way Pip faces.
    const toe = facing > 0 ? fx + 2 : fx - 2;
    if (fy > bodyBottom) {
      put(c, toe, fy, P.body);
      put(c, toe + 1, fy, P.body);
    }
  }

  // Body
  bodyRows(w, h).forEach(([a, b], j) => {
    for (let i = a; i < b; i++) put(c, left + i, top + j, P.body);
  });

  // Antenna: a 2-wide stalk leaning by whole cells, bulb on top.
  const lean = Math.round((s.antenna ?? 0) / 2) * 2;
  const stalkX = x - 2 + (facing > 0 ? 2 : 0);
  put(c, stalkX, top - 1, P.body);
  put(c, stalkX + 1, top - 1, P.body);
  // upper segment steps over by a whole cell when leaning
  put(c, stalkX + lean, top - 2, P.body);
  put(c, stalkX + 1 + lean, top - 2, P.body);
  const bx = stalkX + lean;
  for (let j = 3; j <= 4; j++) for (let i = 0; i < 2; i++) put(c, bx + i, top - j, P.bulb);

  // Face: eyes shift toward the facing side and with look.
  const look = Math.round(s.look ?? 0) + (facing > 0 ? 1 : -1);
  const eyeRows = EYES[s.eyes ?? "open"];
  const eyeY = top + (h >= 8 ? 2 : 1) + Math.round(s.lookY ?? 0);
  const eyeW = eyeRows[0].length;
  const gap = w >= 28 ? 8 : w >= 24 ? 6 : 4;
  const lx = x - gap / 2 - eyeW + look;
  const rx = x + gap / 2 + look;
  stamp(c, eyeRows, lx, eyeY, P.eye);
  stamp(c, eyeRows, rx, eyeY, P.eye);
  if (s.blush) {
    put(c, lx - 2, eyeY + eyeRows.length, P.blush);
    put(c, lx - 1, eyeY + eyeRows.length, P.blush);
    put(c, rx + eyeW, eyeY + eyeRows.length, P.blush);
    put(c, rx + eyeW + 1, eyeY + eyeRows.length, P.blush);
  }
  if (s.mouth) {
    const m = MOUTHS[s.mouth];
    const mw = m[0].length;
    const my = Math.min(bodyBottom - m.length, eyeY + eyeRows.length + 1);
    stamp(c, m, x - mw / 2 + look, my, P.eye);
  }

  // Arms at the shoulders (row 3 of the body, row 2 when squashed).
  const sy = top + (h >= 8 ? 3 : 2);
  const arm = (name, side) => {
    const pts = ARMS[name ?? "down"];
    const ox = side > 0 ? left + w : left - 2;
    for (const [dx, dy] of pts) {
      const ax = side > 0 ? ox + dx : ox - dx;
      put(c, ax, sy + dy, P.body);
      put(c, ax + 1, sy + dy, P.body);
    }
  };
  // "Near" and "far" follow facing so poses read the same both ways.
  arm(facing > 0 ? s.armL : s.armR, -1);
  arm(facing > 0 ? s.armR : s.armL, 1);

  return { x, left, top: top - 4, right: left + w - 1, footY, bodyTop: top, bodyBottom, feet: feet.map((f) => ({ x: Math.round(f.x / 2) * 2, y: footY - Math.max(0, Math.round(f.lift ?? 0)), planted: f.planted ?? !(f.lift > 0) })) };
}

export const PIP_PALETTE = {
  "#": { name: "body", rgb: [64, 192, 168], ansi16: 96 },
  E: { name: "eye", rgb: [22, 26, 38], ansi16: 30, ansi16Bg: 40 },
  A: { name: "bulb", rgb: [250, 204, 72], ansi16: 93 },
  a: { name: "bulb-off", rgb: [120, 98, 52], ansi16: 33 },
  W: { name: "bulb-glow", rgb: [255, 246, 196], ansi16: 97 },
  p: { name: "blush", rgb: [255, 143, 163], ansi16: 95 },
};

export const BODY_SIZES = BODY;

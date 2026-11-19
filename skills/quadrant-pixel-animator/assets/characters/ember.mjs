// Ember, a fox kit: an example character module in full color.
// Orange fur with a lighter top and a darker underside, a cream muzzle and
// belly, eyes with highlights, dark socks and ear tips, a 1-sub-pixel outline.
// Several colors meet in many 2x2 cells; the terminal output folds them to
// the closest pair, and SVG/PNG with --source keep every color.
//
//   node src/cli.mjs strip --module assets/characters/ember.mjs --act walk-jump --view compare
//
// Contract: src/stage/character.mjs. Every Pip action drives Ember too.

export const name = "ember";
export const rows = 16; // taller than Pip: 32 sub-pixels of stage

export const palette = {
  "α": { name: "outline", rgb: [42, 23, 18], ansi16: 30 },
  "β": { name: "fur", rgb: [232, 121, 43], ansi16: 33 },
  "γ": { name: "fur-shade", rgb: [176, 78, 26], ansi16: 31 },
  "λ": { name: "fur-light", rgb: [248, 166, 90], ansi16: 93 },
  "δ": { name: "cream", rgb: [255, 238, 214], ansi16: 97 },
  "ε": { name: "eye", rgb: [27, 20, 32], ansi16: 30 },
  "ζ": { name: "eye-light", rgb: [255, 255, 255], ansi16: 97 },
  "η": { name: "nose", rgb: [58, 33, 32], ansi16: 90 },
  "θ": { name: "ear-inner", rgb: [242, 167, 160], ansi16: 95 },
  "ι": { name: "sock", rgb: [92, 46, 29], ansi16: 90 },
  "κ": { name: "blush", rgb: [255, 128, 128], ansi16: 91 },
};

// Head and torso sizes per squash/stretch state: [headW, headH, torsoW, torsoH]
const SIZE = {
  s2: [26, 7, 16, 3],
  s1: [24, 8, 14, 3],
  n: [22, 9, 12, 4],
  b: [22, 10, 12, 4],
  t1: [20, 10, 10, 5],
  t2: [18, 11, 10, 5],
};

const EYES = {
  open: ["ζ#", "##", "##"],
  look_up: ["ζ#", "##", ".."],
  blink: ["..", "..", "##"],
  closed: ["..", "##", ".."],
  sleepy: ["..", "##", "##"],
  wide: ["ζ#", "##", "##", "##"],
  happy: [".##.", "#..#"],
  x: ["#.#", ".#.", "#.#"],
};

// Hand offsets from the shoulder (side +1 = the facing side), in sub-pixels.
const ARMS = {
  down: [2, 3],
  out: [6, 0],
  up: [3, -7],
  wave: [5, -6],
  back: [-1, 3],
  hold: [5, 1],
  reach: [6, -4],
  type: [5, 2],
};

function stamp(c, rows, x, y, map) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== "." && c.set(x + i, y + j, map[ch] ?? ch)));
}

export function draw(canvas, s) {
  const L = new canvas.constructor(canvas.width, canvas.height); // own layer, outlined alone
  const x = Math.round(s.x / 2) * 2;
  const f = s.facing ?? 1;
  const [hw, hh, tw, th] = SIZE[s.body] ?? SIZE.n;
  const legLen = s.legLen ?? 2;
  const footY = s.ground - 2 - Math.round(s.y ?? 0); // one row above the ground for the outline
  const torsoBottom = footY - legLen;
  const torsoTop = torsoBottom - th + 1;
  const headBottom = torsoTop + 1;
  const headTop = headBottom - hh + 1;
  const cy = (headTop + headBottom) / 2;

  // Tail first (behind): a fluffy oval on the far side with a cream tip, wagging with antenna.
  const wag = Math.round(s.antenna ?? 0);
  const tx = x - f * (tw / 2 + 5) + f * wag * -1;
  L.ellipse(tx, torsoBottom - 3, 5, 3.2, "β");
  L.ellipse(tx - f * 4, torsoBottom - 5 + Math.abs(wag) / 2, 2.6, 1.8, "δ");

  // Legs: socks from the torso to the feet, paw pads toward the facing side.
  const feet = s.feet ?? [
    { x: x - 6, lift: 0 },
    { x: x + 4, lift: 0 },
  ];
  for (const ft of feet) {
    const fx = Math.round(ft.x / 2) * 2;
    const fy = footY - Math.max(0, Math.round(ft.lift ?? 0));
    for (let y = torsoBottom; y <= fy; y++) L.rect(fx, y, 2, 1, "ι");
    L.rect(f > 0 ? fx : fx - 2, fy, 4, 1, "ι");
  }

  // Torso with a cream belly.
  L.ellipse(x, (torsoTop + torsoBottom) / 2 + 0.5, tw / 2, th / 2 + 0.5, "β");
  L.ellipse(x + f, (torsoTop + torsoBottom) / 2 + 0.8, tw / 4, th / 2 - 0.2, "δ");

  // Arms: a short limb from the shoulder to a paw.
  const arm = (nm, side) => {
    const [dx, dy] = ARMS[nm] ?? ARMS.down;
    const sx = x + side * (tw / 2 - 1);
    const sy = torsoTop + 1;
    const hx = sx + side * dx;
    const hy = sy + dy;
    L.line(sx, sy, hx, hy, "β");
    L.rect(hx - 1, hy - 1, 2, 2, "β");
  };
  arm(s.armL, -f);
  arm(s.armR, f);

  // Ears (drawn before the head so the head covers their base).
  for (const side of [-1, 1]) {
    const ex = x + side * Math.round(hw / 3.2);
    const lean = side * Math.round((s.antenna ?? 0) / 2);
    for (let j = 0; j < 5; j++) {
      const w = [1, 2, 3, 4, 5][j];
      for (let i = -w; i < w; i++) L.set(ex + i + lean * (5 - j) / 5, headTop - 4 + j, j < 2 ? "ι" : Math.abs(i + 0.5) < w - 1.5 ? "θ" : "β");
    }
  }

  // Head: fur with a lighter crown, cream muzzle, nose.
  L.ellipse(x, cy, hw / 2, hh / 2 + 0.3, "β");
  L.rim("β", "λ", "top");
  const my = headTop + Math.round(hh * 0.62);
  L.ellipse(x + f * 3, my + 0.5, hw / 4.4, hh / 4.2, "δ");
  L.rect(x + f * 3 + (f > 0 ? 2 : -3), my - 1, 2, 1, "η");

  // Eyes with a highlight, shifted toward the facing side and with look.
  const rows = EYES[s.eyes] ?? EYES.open;
  const ew = rows[0].length;
  const look = Math.round(s.look ?? 0) + f;
  const ey = headTop + Math.max(2, Math.round(hh * 0.3)) + Math.round(s.lookY ?? 0);
  const gap = hw >= 24 ? 8 : 6;
  const lx = x - gap / 2 - ew + look;
  const rx = x + gap / 2 + look;
  stamp(L, rows, lx, ey, { "#": "ε" });
  stamp(L, rows, rx, ey, { "#": "ε" });
  if (s.blush) {
    L.rect(lx - 2, ey + rows.length, 2, 1, "κ");
    L.rect(rx + ew, ey + rows.length, 2, 1, "κ");
  }
  if (s.mouth) {
    const m = { smile: ["#..#", ".##."], o: ["##", "##"], open: [".##.", "####"], grin: ["#....#", ".####."] }[s.mouth] ?? ["##"];
    stamp(L, m, x + f * 3 - m[0].length / 2 + (f > 0 ? 1 : -1), my + 1, { "#": "η" });
  }

  // Shading and the contour, then onto the stage.
  L.rim("β", "γ", "bottom");
  L.outline("α");
  canvas.blit(L.px, 0, 0);

  const left = x - Math.max(hw, tw + 12) / 2 - 2;
  return {
    x,
    left,
    right: x + Math.max(hw, tw + 12) / 2 + 2,
    top: headTop - 5,
    footY,
    bodyTop: headTop,
    bodyBottom: torsoBottom,
    feet: feet.map((ft) => ({ x: Math.round(ft.x / 2) * 2, y: footY - Math.max(0, Math.round(ft.lift ?? 0)), planted: ft.planted ?? !(ft.lift > 0) })),
  };
}

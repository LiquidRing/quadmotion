// Animation checks for recorded acts (run in npm test and by tools/strip).
//  - grounded: when Pip stands (y = 0) a foot touches the row above the ground
//  - no foot slide: a foot that stays down between two ticks keeps its x
//  - no teleport: Pip moves at most 8 sub-pixels per tick unless flagged
//  - clean cells: no folded (3+ color) cell inside Pip's box (opts.folds;
//    off for full-color characters, where folding is expected)

export function checkAct(scene, { folds: checkFolds = true } = {}) {
  const issues = [];
  const meta = scene.meta;
  const frames = scene.timelines.main.frames;
  const ground = scene.world.ground;
  for (let i = 0; i < meta.length; i++) {
    const m = meta[i].pip;
    if (!m.box) continue;
    const onScreen = m.box.right >= 0 && m.box.left < scene.world.W;
    if (onScreen && (m.state.y ?? 0) === 0 && m.contact === 0) issues.push({ code: "floating", tick: i, message: `tick ${i}: Pip stands (y=0) but no foot touches the ground` });
    if (i > 0 && meta[i - 1].pip.box) {
      const p = meta[i - 1].pip;
      if (Math.abs(m.x - p.x) > 8 && !m.allowJump) issues.push({ code: "teleport", tick: i, message: `tick ${i}: Pip moved ${Math.abs(m.x - p.x)} sub-pixels in one tick` });
      if (m.feet && p.feet && m.state.y === 0 && p.state.y === 0) {
        m.feet.forEach((f, k) => {
          const q = p.feet[k];
          const down = q && f.planted && q.planted && f.y === ground - 1 && q.y === ground - 1;
          if (down && f.x !== q.x && Math.abs(m.x - p.x) > 0) issues.push({ code: "foot-slide", tick: i, message: `tick ${i}: foot ${k} slid from ${q.x} to ${f.x} while planted` });
        });
      }
    }
    const folds = (frames[i].folds ?? []).filter((w) => w.col * 2 + 1 >= m.box.left && w.col * 2 <= m.box.right && w.row * 2 + 1 >= m.box.top && w.row * 2 <= m.box.footY);
    if (checkFolds && onScreen && folds.length) issues.push({ code: "pip-fold", tick: i, message: `tick ${i}: ${folds.length} cell(s) with 3+ colors on Pip` });
  }
  return issues;
}

/**
 * Share of sub-pixels the terminal shows in their source color (0..1): how
 * much the 2-colors-per-cell limit costs a frame.
 */
export function fidelity(frame) {
  if (!frame.grid) return null;
  let same = 0;
  let total = 0;
  frame.cells.forEach((line, r) =>
    line.forEach((cell, c) => {
      if (cell.mask < 0) return; // overlay text
      for (let i = 0; i < 4; i++) {
        const src = frame.grid[r * 2 + (i >> 1)][c * 2 + (i & 1)] ?? null;
        const shown = (cell.mask >> i) & 1 ? cell.fg : cell.bg;
        if (src === null && shown === null) continue; // empty stays empty
        total++;
        if (src === shown) same++;
      }
    }),
  );
  return total ? same / total : 1;
}

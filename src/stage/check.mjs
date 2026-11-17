// Animation checks for recorded acts (run in npm test and by tools/strip).
//  - grounded: when Pip stands (y = 0) a foot touches the row above the ground
//  - no foot slide: a foot that stays down between two ticks keeps its x
//  - no teleport: Pip moves at most 8 sub-pixels per tick unless flagged
//  - clean cells: no folded (3+ color) cell inside Pip's box

export function checkAct(scene) {
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
    if (onScreen && folds.length) issues.push({ code: "pip-fold", tick: i, message: `tick ${i}: ${folds.length} cell(s) with 3+ colors on Pip` });
  }
  return issues;
}

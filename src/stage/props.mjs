// Props Pip can touch. Each has x (left edge, even), step(world) and
// draw(canvas, world). Sprites are authored at 2x like everything else.

import { Canvas } from "../scenes/kit.mjs";

const spr = (rows) => Canvas.sprite(rows);

export class Crate {
  constructor(x, { w = 8, h = 6 } = {}) {
    this.kind = "crate";
    this.x = x;
    this.w = w;
    this.h = h;
    this.shake = 0;
  }
  get top() {
    return this.ground - this.h;
  }
  step(world) {
    this.ground = world.ground;
    if (this.shake > 0) this.shake--;
  }
  draw(c, world) {
    const y0 = world.ground - this.h;
    const x0 = this.x + (this.shake % 2 ? 2 : 0) * (this.shake > 0 ? 1 : 0);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const edge = j === 0 || j === this.h - 1 || i < 1 || i >= this.w - 1;
        const plank = j === Math.floor(this.h / 2);
        c.set(x0 + i, y0 + j, edge || plank ? "c" : "C");
      }
    }
  }
}

export class Ball {
  constructor(x, { vx = 0, vy = 0, y } = {}) {
    this.kind = "ball";
    this.x = x;
    this.y = y ?? null;
    this.vx = vx;
    this.vy = vy;
    this.r = 2;
    this.spin = 0;
    this.layer = "front";
  }
  step(world) {
    if (this.y === null) this.y = world.ground - 4;
    this.vy += 0.22;
    this.x += this.vx;
    this.y += this.vy;
    const floor = world.ground - 4;
    if (this.y >= floor) {
      this.y = floor;
      if (Math.abs(this.vy) > 0.6) {
        this.vy = -this.vy * 0.62;
        world.spray(this.x + 2, world.ground - 1, 2, { speed: 0.4, up: 0.2, life: 4 });
      } else this.vy = 0;
      this.vx *= 0.92;
    }
    if (this.x < -8 || this.x > world.W + 8) this.dead = true;
    this.spin += this.vx;
  }
  draw(c) {
    const x = Math.round(this.x / 2) * 2;
    const y = Math.round(this.y);
    const s = Math.floor(Math.abs(this.spin) / 3) % 2;
    // 4 wide x 4 tall ball (round on screen), a stripe that rolls
    const rows = s ? [".bb.", "bBBb", "bBBb", ".bb."] : [".BB.", "BbbB", "BbbB", ".BB."];
    c.blit(spr(rows), x, y);
  }
}

/** A falling thing to catch (apple, star...). */
export class Faller {
  constructor(x, { tok = "Y", vy = 0 } = {}) {
    this.kind = "faller";
    this.x = x;
    this.y = -2;
    this.vy = vy;
    this.tok = tok;
    this.caught = false;
  }
  step(world) {
    if (this.caught) return;
    this.vy = Math.min(1.2, this.vy + 0.08);
    this.y += this.vy;
    if (this.y >= world.ground - 2) {
      this.y = world.ground - 2;
      this.vy = 0;
    }
  }
  draw(c) {
    if (this.hidden) return;
    const x = Math.round(this.x / 2) * 2;
    c.rect(x, Math.round(this.y), 2, 2, this.tok);
  }
}

/** Butterfly: flutters along a path, can land on a point. */
export class Butterfly {
  constructor(x, y) {
    this.kind = "butterfly";
    this.x = x;
    this.y = y;
    this.t = 0;
    this.target = null;
    this.layer = "front";
  }
  step(world) {
    this.t++;
    if (this.target) {
      const tx = this.target.x();
      const ty = this.target.y();
      this.x += Math.sign(tx - this.x) * Math.min(1, Math.abs(tx - this.x));
      this.y += Math.sign(ty - this.y) * Math.min(0.5, Math.abs(ty - this.y));
    } else {
      this.x += this.vx ?? 0.6;
      this.y += Math.sin(this.t / 3) * 0.5 + (this.vy ?? 0);
    }
    if (this.x > world.W + 6 || this.y < -6) this.dead = true;
  }
  draw(c) {
    const x = Math.round(this.x / 2) * 2;
    const y = Math.round(this.y);
    const open = this.landed ? this.t % 16 < 12 : this.t % 4 < 2;
    if (open) c.blit(spr(["vv..vv", ".vkkv.", "vv..vv"]), x - 2, y);
    else c.blit(spr(["..vv..", "..kk..", "..vv.."]), x - 2, y);
  }
}

/** Umbrella held over Pip's head; x follows Pip. */
export class Umbrella {
  constructor(pip) {
    this.kind = "umbrella";
    this.pip = pip;
    this.open = 0; // 0 closed .. 3 open
  }
  draw(c) {
    const box = this.pip.box;
    if (!box) return;
    const cx = Math.round(this.pip.x / 2) * 2 + 4 * this.pip.facing;
    const top = box.top - 6;
    const canopy = [
      ["..uu..", "..UU..", "..UU.."],
      ["..uuuu..", ".uUUUUu.", "..UUUU.."],
      ["....uuuu....", "..uUUUUUUu..", ".uUUUUUUUUu."],
      [".....uuuu.....".slice(0, 14), "..uuUUUUUUuu..", "uUUUUUUUUUUUUu"],
    ][this.open];
    const g = spr(canopy);
    c.blit(g, cx - g[0].length / 2, top);
    for (let y = top + 3; y < box.bodyTop + 3; y++) c.set(cx, y, "k");
  }
}

/** Laptop on the ground in front of Pip. */
export class Laptop {
  constructor(x) {
    this.kind = "laptop";
    this.x = x;
    this.t = 0;
    this.lines = 0;
    this.layer = "front";
  }
  step() {
    this.t++;
  }
  draw(c, world) {
    const g = world.ground;
    // screen (lit) and base
    for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) c.set(this.x + i, g - 7 + j, j === 0 || i === 0 || i === 7 ? "L" : "l");
    for (let k = 0; k < Math.min(3, this.lines); k++) {
      const len = 2 + ((k * 3 + this.lines) % 4);
      for (let i = 0; i < len; i++) c.set(this.x + 1 + i, g - 6 + k, "y");
    }
    for (let i = -2; i < 10; i++) c.set(this.x + i, g - 2, "L");
    for (let i = -2; i < 10; i++) c.set(this.x + i, g - 1, "K");
  }
}

// Shared props. Act groups define their own props next to their acts; a prop
// has x (left edge, even), step(world) and draw(canvas, world).


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

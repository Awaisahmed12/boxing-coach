import type { Point } from "./types";

// One Euro filter — adaptive low-pass for jitter-free landmark display.
// When the body is still it smooths heavily (kills tremble); when it moves
// fast the cutoff rises so the figure tracks crisply without lag.
// Ref: Casiez, Roussel & Vogel (2012).

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class Scalar {
  private s = 0;
  private has = false;
  apply(x: number, a: number): number {
    this.s = this.has ? a * x + (1 - a) * this.s : x;
    this.has = true;
    return this.s;
  }
  reset() {
    this.has = false;
  }
}

class OneEuro {
  private xf = new Scalar();
  private dxf = new Scalar();
  private prev = 0;
  private has = false;
  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1
  ) {}
  apply(value: number, dt: number): number {
    const d = this.has ? (value - this.prev) / dt : 0;
    this.prev = value;
    this.has = true;
    const ed = this.dxf.apply(d, smoothingAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.xf.apply(value, smoothingAlpha(cutoff, dt));
  }
  reset() {
    this.xf.reset();
    this.dxf.reset();
    this.has = false;
  }
}

/** One Euro filter bank over the 33 pose landmarks, for a stable overlay. */
export class LandmarkSmoother {
  private fx: OneEuro[] = [];
  private fy: OneEuro[] = [];
  // higher minCutoff + beta = follows the body faster (less "stuck" feel),
  // still smooths the small tremble when nearly still
  constructor(minCutoff = 1.7, beta = 0.05) {
    for (let i = 0; i < 33; i++) {
      this.fx.push(new OneEuro(minCutoff, beta));
      this.fy.push(new OneEuro(minCutoff, beta));
    }
  }
  smooth(raw: Point[], dt: number): Point[] {
    const d = dt > 0 && dt < 0.5 ? dt : 1 / 60;
    const out: Point[] = [];
    for (let i = 0; i < raw.length; i++) {
      out.push({
        x: this.fx[i].apply(raw[i].x, d),
        y: this.fy[i].apply(raw[i].y, d),
        visibility: raw[i].visibility,
      });
    }
    return out;
  }
  reset() {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
  }
}

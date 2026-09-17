/**
 * Port de `GForceRenderer.kt` (Haloglyph) — la bille et les graduations, ou les
 * quatre pics en croix.
 *
 * La matrice de la préview est toujours regardée **au dos** — même convention
 * que les autres toys du portail — donc l'abscisse est niée en permanence
 * (`mirror = -1`), ce qui échange les deux pics latéraux comme sur l'appareil.
 */

import { Grid, R4, charWidth, type Device } from "$lib";
import { FULL_SCALE, TICKS, formatG, type GForceReading } from "./engine";

const BALL = ["01110", "11111", "11111", "11111", "01110"];
const BALL_HALF = 2;

const TICK_HALF = 2;
const AIM = 0.24;
const VALUE = 0.9;

const LEFT_X = 1;
const RIGHT_X = 15;
const AXIS_X = 8;
const TOP_Y = 2;
const MID_Y = 10;
const BOTTOM_Y = 17;

export class GForceRenderer {
  private readonly grid: Grid;
  private readonly cx: number;
  private readonly cy: number;
  private readonly usableRadius: number;

  constructor(device: Device) {
    this.grid = new Grid(device);
    this.cx = device.cx;
    this.cy = device.cy;
    this.usableRadius = device.maxDist;
  }

  renderLive(reading: GForceReading): Float32Array {
    this.grid.clear();
    this.graduations();
    if (reading.hasFix) {
      let dx = (-1 * reading.towardRight) / FULL_SCALE;
      let dy = reading.towardFront / FULL_SCALE;
      const reach = Math.hypot(dx, dy);
      if (reach > 1) {
        dx /= reach;
        dy /= reach;
      }
      this.ball(
        Math.round(this.cx + dx * this.usableRadius),
        Math.round(this.cy - dy * this.usableRadius),
      );
    }
    return this.grid.g;
  }

  renderPeaks(reading: GForceReading): Float32Array {
    this.grid.clear();
    // Le miroir échange les deux latéraux, comme la bille en mode vif.
    const onLeft = reading.right;
    const onRight = reading.left;
    this.value(reading.front, AXIS_X, TOP_Y);
    this.value(reading.rear, AXIS_X, BOTTOM_Y);
    this.value(onLeft, LEFT_X, MID_Y);
    this.value(onRight, RIGHT_X, MID_Y);
    return this.grid.g;
  }

  private graduations(): void {
    for (let k = 1; k <= TICKS; k++) {
      const d = Math.round((this.usableRadius * k) / (TICKS + 1));
      for (let t = -TICK_HALF; t <= TICK_HALF; t++) {
        this.grid.set(this.cx + t, this.cy - d, AIM);
        this.grid.set(this.cx + t, this.cy + d, AIM);
        this.grid.set(this.cx - d, this.cy + t, AIM);
        this.grid.set(this.cx + d, this.cy + t, AIM);
      }
    }
  }

  private value(g: number, x0: number, y0: number): void {
    this.grid.drawText(R4, formatG(g), x0, y0, VALUE);
    this.grid.set(x0 + charWidth(R4, "0"), y0 + R4.height, VALUE);
  }

  private ball(bx: number, by: number): void {
    for (let row = 0; row < BALL.length; row++) {
      const line = BALL[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "1") this.grid.set(bx + col - BALL_HALF, by + row - BALL_HALF, 1);
      }
    }
  }
}

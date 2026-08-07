/**
 * Le rendu du toy — port de `render/SlotRenderer.kt`.
 *
 * Deux couches : les trois rouleaux, puis les effets de résultat. La payline —
 * les sept lignes du milieu — est à pleine intensité, le reste de la bande à
 * 20 % : c'est ce qui fait lire une fenêtre plutôt qu'un damier.
 *
 * Une différence assumée avec la préview d'origine, qui secouait le **canvas**
 * au jackpot : ici la secousse décale la trame d'une **cellule entière**. Une
 * Glyph Matrix a ses LEDs soudées, elle ne peut pas bouger d'un demi-pixel — et
 * accessoirement, un canvas transformé sort de la grille de pixels physiques sur
 * laquelle tout le calage de la préview repose.
 */

import { discMap, type Device } from "@glyph/kit";
import {
  BANNER,
  BANNER_W,
  COLS,
  LVL,
  ORDER,
  PAY_BOT,
  PAY_TOP,
  SPR,
  STRIP,
  STRIP_LEN,
  SYM_H,
  mod,
  type ResultType,
} from "./slot";

/** Une gerbe du feu d'artifice du jackpot. */
type Burst = {
  t0: number;
  cx: number;
  cy: number;
  parts: { ang: number; v: number; life: number }[];
};

export type JackpotFx = {
  bursts: Burst[];
  twinkles: { x: number; y: number; ph: number; sp: number }[];
};

export class SlotRenderer {
  private readonly SIZE: number;
  private readonly CTR: number;
  private readonly RADIUS: number;
  private readonly dist: Float64Array;
  private readonly grid: Float32Array;
  /** Les cellules du disque, en coordonnées (x, y) — l'ancien `MASK`. */
  private readonly cells: [number, number][];

  constructor(private readonly device: Device) {
    this.SIZE = device.size;
    this.CTR = device.cx;
    this.RADIUS = device.radius;
    this.dist = discMap(device).dist;
    this.grid = new Float32Array(device.cells);
    this.cells = device.inside.map((i) => [i % device.size, Math.floor(i / device.size)]);
  }

  /** Tire les paramètres aléatoires du jackpot, une fois par victoire. */
  makeFx(): JackpotFx {
    return {
      bursts: Array.from({ length: 7 }, (_, i) => ({
        t0: 3.9 + i * 0.22 + Math.random() * 0.12,
        cx: this.CTR + (Math.random() * 2 - 1) * 6,
        cy: this.CTR + (Math.random() * 2 - 1) * 6,
        parts: Array.from({ length: 12 }, () => ({
          ang: Math.random() * Math.PI * 2,
          v: 4 + Math.random() * 5,
          life: 0.7 + Math.random() * 0.4,
        })),
      })),
      twinkles: Array.from({ length: 36 }, () => {
        const [tx, ty] = this.cells[Math.floor(Math.random() * this.cells.length)];
        return { x: tx, y: ty, ph: Math.random() * 6.28, sp: 5 + Math.random() * 4 };
      }),
    };
  }

  render(
    offsets: number[],
    result: { type: ResultType; elapsed: number; fx: JackpotFx | null } | null,
  ): Float32Array {
    const g = this.grid;
    g.fill(0);

    /* La payline pulse pendant une victoire — c'est elle qui porte le résultat,
       le reste de la bande n'a rien à dire de plus. */
    let payMult = 1;
    if (result && result.type !== "lose")
      payMult = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(result.elapsed * Math.PI * 6));

    this.reels(offsets, payMult);

    if (result) {
      if (result.type === "win") this.win(result.elapsed);
      if (result.type === "jackpot" && result.fx) this.jackpot(result.elapsed, result.fx);
    }

    // La secousse : une cellule entière, pas un décalage de canvas. Les LEDs
    // d'une matrice ne bougent pas ; ce qui bouge, c'est ce qu'on y écrit.
    const shake = this.shakeOffset(result);
    return shake ? this.shifted(shake[0], shake[1]) : g;
  }

  private reels(offsets: number[], payMult: number): void {
    const g = this.grid;
    for (let i = 0; i < 3; i++) {
      const off = Math.round(offsets[i]);
      for (let wy = 1; wy < this.SIZE - 1; wy++) {
        const stripRow = mod(wy - PAY_TOP - off, STRIP_LEN);
        const sym = STRIP[ORDER[i][Math.floor(stripRow / SYM_H)]];
        const r = stripRow % SYM_H;
        if (r >= 7) continue; // les deux lignes de blanc entre deux symboles
        const inPay = wy >= PAY_TOP && wy <= PAY_BOT;
        const dimRow = inPay ? 1 : 0.2;
        const row = SPR[sym][r];
        for (let x = 0; x < 7; x++) {
          const b = LVL[row[x]];
          if (!b) continue;
          g[wy * this.SIZE + COLS[i] + x] = b * dimRow * (inPay ? payMult : 1);
        }
      }
    }
  }

  /** Gain simple : l'anneau du bord pulse, sans toucher aux rouleaux. */
  private win(te: number): void {
    const g = this.grid;
    const ring = 0.5 * (0.5 + 0.5 * Math.sin(te * Math.PI * 6));
    for (const [x, y] of this.cells) {
      if (this.dist[y * this.SIZE + x] > 11.3)
        g[y * this.SIZE + x] = Math.max(g[y * this.SIZE + x], ring);
    }
  }

  /**
   * Le jackpot, en cinq phases enchaînées sur 7,3 secondes : triple strobe,
   * ondes de choc, bandeau JACKPOT qui défile, feux d'artifice avec gravité, et
   * un 7 géant qui zoome. Les phases 3 et 5 effacent la grille — elles prennent
   * l'écran, elles ne se superposent pas.
   */
  private jackpot(te: number, fx: JackpotFx): void {
    const g = this.grid;
    const S = this.SIZE;
    const C = this.CTR;

    // Phase 1 (0–0,6 s) : triple strobe
    for (const t0 of [0, 0.2, 0.4]) {
      const age = te - t0;
      if (age >= 0 && age < 0.14) {
        const f = 0.95 * (1 - age / 0.14);
        for (const [x, y] of this.cells) g[y * S + x] = Math.max(g[y * S + x], f);
      }
    }

    // Phase 2 (0,25–1,3 s) : ondes de choc concentriques
    for (const tw of [0.25, 0.55, 0.85]) {
      const age = te - tw;
      if (age <= 0 || age > 0.9) continue;
      const r = age * 14;
      const fade = 1 - age / 0.9;
      for (const [x, y] of this.cells) {
        const band = Math.abs(this.dist[y * S + x] - r);
        if (band < 1) g[y * S + x] = Math.max(g[y * S + x], (1 - band) * fade);
      }
    }

    // Phase 3 (1,3–4,1 s) : bandeau JACKPOT, défilement droite → gauche
    if (te > 1.3 && te < 4.1) {
      g.fill(0);
      const speed = (BANNER_W + S) / 2.8;
      const scroll = (te - 1.3) * speed;
      for (let v = 0; v < 7; v++) {
        const y = PAY_TOP + v;
        for (let x = 0; x < S; x++) {
          if (this.dist[y * S + x] > this.RADIUS) continue;
          const bc = Math.floor(x - S + scroll);
          if (bc < 0 || bc >= BANNER_W) continue;
          if (BANNER[v][bc] === "2") g[y * S + x] = 1;
        }
      }
    }

    // Phase 4 (3,4–5,6 s) : gerbes multiples, avec gravité
    for (const bu of fx.bursts) {
      const age = te - bu.t0;
      if (age <= 0) continue;
      if (age < 0.12) {
        const px = Math.round(bu.cx);
        const py = Math.round(bu.cy);
        if (px >= 0 && py >= 0 && px < S && py < S) g[py * S + px] = 1;
      }
      for (const p of bu.parts) {
        if (age > p.life) continue;
        const px = Math.round(bu.cx + Math.cos(p.ang) * p.v * age);
        const py = Math.round(bu.cy + Math.sin(p.ang) * p.v * age + 2.5 * age * age);
        if (px < 0 || py < 0 || px >= S || py >= S) continue;
        if (this.dist[py * S + px] > this.RADIUS) continue;
        g[py * S + px] = Math.max(g[py * S + px], 1 - age / p.life);
      }
    }

    // Phase 5 (5,4–7,3 s) : le 7 géant, zoom puis fondu
    if (te > 5.4) {
      g.fill(0);
      const e = Math.min((te - 5.4) / 0.45, 1);
      const s = 1 + 1.7 * (1 - Math.pow(1 - e, 3)); // zoom 1 → 2,7
      const fade = te > 7 ? Math.max(0, 1 - (te - 7) / 0.3) : 1;
      const pulse = 0.6 + 0.4 * Math.sin((te - 5.4) * 12);
      for (const [x, y] of this.cells) {
        const u = Math.round((x - C) / s + 3);
        const v = Math.round((y - C) / s + 3);
        if (u < 0 || u > 6 || v < 0 || v > 6) continue;
        const b = LVL[SPR.seven[v][u]];
        if (b) g[y * S + x] = b * pulse * fade;
      }
    }

    // Scintillement continu (1,0–7,2 s), par-dessus tout le reste
    if (te > 1 && te < 7.2) {
      for (const tw of fx.twinkles) {
        const b = Math.pow(Math.max(0, Math.sin(te * tw.sp + tw.ph)), 3) * 0.35;
        g[tw.y * S + tw.x] = Math.max(g[tw.y * S + tw.x], b);
      }
    }
  }

  /** Une cellule de décalage, aux instants où la machine « cogne ». */
  private shakeOffset(
    result: { type: ResultType; elapsed: number; fx: JackpotFx | null } | null,
  ): [number, number] | null {
    if (!result || result.type !== "jackpot") return null;
    const te = result.elapsed;
    const hit =
      te < 0.6 ||
      (result.fx?.bursts.some((b) => te - b.t0 > 0 && te - b.t0 < 0.22) ?? false);
    if (!hit) return null;
    const r = () => (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.5 ? 0 : 1);
    const dx = r();
    const dy = r();
    return dx || dy ? [dx, dy] : null;
  }

  private shifted(dx: number, dy: number): Float32Array {
    const S = this.SIZE;
    const out = new Float32Array(this.device.cells);
    for (const [x, y] of this.cells) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= S || sy >= S) continue;
      out[y * S + x] = this.grid[sy * S + sx];
    }
    return out;
  }
}

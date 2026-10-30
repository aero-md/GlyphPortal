/**
 * Fabrique les fonds de glyph.suns.red : 5 compositions x 2 thèmes, en 16:9
 * (2560x1440), dans `static/bg/{n}-{theme}.webp`.
 *
 *     bun run scripts/gen-bg/gen.ts                 # tout
 *     bun run scripts/gen-bg/gen.ts --only 3        # une composition
 *     bun run scripts/gen-bg/gen.ts --scale 0.25 --out <dossier>   # brouillon
 *
 * Tout est procédural et déterministe (graine fixe par image) : sphères
 * ombrées analytiquement, halos gaussiens, bandes polaires, moiré en sinus,
 * grain gaussien fin. L'encodage WebP passe par ffmpeg (libwebp).
 *
 * Unités de géométrie : la HAUTEUR de l'image vaut 1 ; la largeur 16/9.
 * Le sujet reste autour de x = 0.889 (centre) pour survivre à un `cover`
 * sur écran portrait.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SCALE = Number(arg("scale") ?? 1);
const ONLY = arg("only");
const OUT = arg("out") ?? path.join(ROOT, "static", "bg");
const PREVIEW = arg("preview"); // dossier de PNG 1280x720 pour contrôle visuel
const QUALITY = Number(arg("quality") ?? 85);
const W = Math.round(2560 * SCALE);
const H = Math.round(1440 * SCALE);
const CX = 16 / 18; // centre horizontal en unités de hauteur

/* ------------------------------------------------------------------ maths */

type RGB = [number, number, number];
const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dégradé multi-arrêts : stops = [[pos, couleur], ...] triés. */
function ramp(stops: [number, RGB][], t: number): RGB {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const k = smooth(0, 1, (t - p0) / (p1 - p0));
      return mix3(c0, c1, k);
    }
  }
  return stops[stops.length - 1][1];
}

/* ----------------------------------------------------------------- canvas */

class Canvas {
  d = new Float32Array(W * H * 3);
  /** pixels par unité (la hauteur vaut 1) */
  P = H;

  fill(c: RGB) {
    for (let i = 0; i < W * H; i++) {
      this.d[i * 3] = c[0];
      this.d[i * 3 + 1] = c[1];
      this.d[i * 3 + 2] = c[2];
    }
  }

  /** Dégradé linéaire sur tout le cadre, angle en degrés (0 = gauche->droite). */
  gradient(c0: RGB, c1: RGB, deg: number) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const wU = W / H;
    const ext = Math.abs(dx) * wU + Math.abs(dy);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / H - wU / 2, v = (y + 0.5) / H - 0.5;
        const t = clamp((u * dx + v * dy) / ext + 0.5);
        const i = (y * W + x) * 3;
        this.d[i] = mix(c0[0], c1[0], t);
        this.d[i + 1] = mix(c0[1], c1[1], t);
        this.d[i + 2] = mix(c0[2], c1[2], t);
      }
  }

  /** Mélange `c` au pixel i avec l'opacité a. */
  put(i: number, c: RGB, a: number) {
    const d = this.d;
    d[i] = mix(d[i], c[0], a);
    d[i + 1] = mix(d[i + 1], c[1], a);
    d[i + 2] = mix(d[i + 2], c[2], a);
  }

  /** Boucle sur une boîte englobante (unités de hauteur). */
  each(x0: number, y0: number, x1: number, y1: number, fn: (u: number, v: number, i: number) => void) {
    const ix0 = Math.max(0, Math.floor(x0 * this.P)), ix1 = Math.min(W - 1, Math.ceil(x1 * this.P));
    const iy0 = Math.max(0, Math.floor(y0 * this.P)), iy1 = Math.min(H - 1, Math.ceil(y1 * this.P));
    for (let y = iy0; y <= iy1; y++)
      for (let x = ix0; x <= ix1; x++) fn((x + 0.5) / this.P, (y + 0.5) / this.P, (y * W + x) * 3);
  }

  /** Tache gaussienne douce (ellipse, rotation en radians). */
  blob(cx: number, cy: number, rx: number, ry: number, c: RGB, a: number, rot = 0) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const R = Math.max(rx, ry) * 3.2;
    this.each(cx - R, cy - R, cx + R, cy + R, (u, v, i) => {
      const dx = u - cx, dy = v - cy;
      const px = dx * cs + dy * sn, py = -dx * sn + dy * cs;
      const q = (px * px) / (rx * rx) + (py * py) / (ry * ry);
      if (q > 10) return;
      this.put(i, c, a * Math.exp(-q));
    });
  }

  /** Ombre portée / occlusion autour d'une sphère (sous le corps, donc cachée dedans). */
  halo(cx: number, cy: number, r: number, soft: number, c: RGB, a: number) {
    const R = r + soft * 4;
    this.each(cx - R, cy - R, cx + R, cy + R, (u, v, i) => {
      const d = Math.hypot(u - cx, v - cy) - r;
      this.put(i, c, a * (d <= 0 ? 1 : Math.exp(-d / soft)));
    });
  }

  /** Liseré lumineux d'arête : croissant centré sur `ang`, hors et dans la sphère. */
  rim(
    cx: number, cy: number, r: number, ang: number, spread: number,
    c: RGB, a: number, outW: number, inW: number,
  ) {
    const R = r + outW * 5;
    this.each(cx - R, cy - R, cx + R, cy + R, (u, v, i) => {
      const dx = u - cx, dy = v - cy;
      const dist = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const w = Math.exp(-((da / spread) ** 2));
      if (w < 0.01) return;
      const e = dist - r;
      const g = e >= 0 ? Math.exp(-e / outW) : Math.exp(e / inW);
      this.put(i, c, clamp(a * w * g));
    });
  }

  /** Sphère mate ombrée analytiquement (normale, lumière douce, limbe). */
  sphere(o: {
    cx: number; cy: number; r: number;
    lit: RGB; shade: RGB;
    light?: [number, number, number];
    wrap?: number; gamma?: number;
    limb?: RGB; limbK?: number; limbPow?: number;
    soft?: number; alpha?: number;
    moire?: { amp: number; p: number; dx?: number; dy?: number };
    rimIn?: { ang: number; spread: number; c: RGB; k: number; pow?: number };
  }) {
    const { cx, cy, r } = o;
    const L0 = o.light ?? [-0.5, -0.6, 0.62];
    const ll = Math.hypot(...L0);
    const L = L0.map((x) => x / ll) as [number, number, number];
    const Lxy = Math.hypot(L[0], L[1]) || 1;
    const wrap = o.wrap ?? 0.35, gamma = o.gamma ?? 1.2;
    const soft = Math.max(o.soft ?? 0, 0.6 / this.P);
    const alpha = o.alpha ?? 1;
    const R = r + soft;
    this.each(cx - R, cy - R, cx + R, cy + R, (u, v, i) => {
      const dx = u - cx, dy = v - cy;
      const dist = Math.hypot(dx, dy);
      const cov = smooth(r + soft, r - soft, dist) * alpha;
      if (cov <= 0) return;
      const q = Math.min(dist / r, 0.998);
      const nx = dx / r, ny = dy / r;
      const nz = Math.sqrt(Math.max(0.02, 1 - q * q));
      const d = nx * L[0] + ny * L[1] + nz * L[2];
      const w = clamp((d + wrap) / (1 + wrap));
      let col = mix3(o.shade, o.lit, Math.pow(w, gamma));
      if (o.limb) {
        const lf = smooth(-0.2, 0.8, (nx * L[0] + ny * L[1]) / Lxy / Math.max(q, 0.05));
        const k = (o.limbK ?? 0.5) * Math.pow(1 - nz, o.limbPow ?? 3) * lf;
        col = [col[0] + (o.limb[0] - col[0]) * k, col[1] + (o.limb[1] - col[1]) * k, col[2] + (o.limb[2] - col[2]) * k];
      }
      if (o.rimIn) {
        let da = Math.atan2(dy, dx) - o.rimIn.ang;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const ww = Math.exp(-((da / o.rimIn.spread) ** 2));
        const k = clamp(o.rimIn.k * ww * Math.pow(1 - nz, o.rimIn.pow ?? 4));
        col = mix3(col, o.rimIn.c, k);
      }
      if (o.moire) {
        const m = o.moire;
        const d1 = dist;
        const d2 = Math.hypot(dx - (m.dx ?? 0.006), dy - (m.dy ?? 0.003));
        const s = 0.5 * (Math.sin((2 * Math.PI * d1) / m.p) + Math.sin((2 * Math.PI * d2) / (m.p * 1.035)));
        const f = 1 + m.amp * s * (0.4 + 0.6 * (1 - nz));
        col = [col[0] * f, col[1] * f, col[2] * f];
      }
      this.put(i, col, cov);
    });
  }

  /** Boîte arrondie floue (bokeh). */
  bokeh(cx: number, cy: number, hw: number, hh: number, rad: number, soft: number, c: RGB, a: number) {
    const R = Math.max(hw, hh) + soft * 3;
    this.each(cx - R, cy - R, cx + R, cy + R, (u, v, i) => {
      const qx = Math.abs(u - cx) - (hw - rad), qy = Math.abs(v - cy) - (hh - rad);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
      this.put(i, c, a * smooth(soft, -soft, sd));
    });
  }

  /** Trait fin (anti-aliasé) : cercle ou droite. */
  hairCircle(cx: number, cy: number, r: number, wpx: number, c: RGB, a: number) {
    const R = r + 4 / this.P;
    this.each(cx - R, cy - R, cx + R, cy + R, (u, v, i) => {
      const d = Math.abs(Math.hypot(u - cx, v - cy) - r) * this.P;
      const k = clamp(0.5 * wpx + 0.5 - d);
      if (k > 0) this.put(i, c, a * k);
    });
  }
  hairLine(horizontal: boolean, pos: number, wpx: number, c: RGB, a: number) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.abs((horizontal ? (y + 0.5) : (x + 0.5)) - pos * this.P);
        const k = clamp(0.5 * wpx + 0.5 - d);
        if (k > 0) this.put((y * W + x) * 3, c, a * k);
      }
  }

  /** Vignettage doux. */
  vignette(strength: number, c: RGB) {
    const wU = W / H;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = ((x + 0.5) / H - wU / 2) / (wU / 2), v = (((y + 0.5) / H) - 0.5) / 0.5;
        const q = clamp((u * u * 0.8 + v * v * 0.6) / 1.4 - 0.25) ;
        this.put((y * W + x) * 3, c, strength * q * q);
      }
  }
}

/* --------------------------------------------------------------- palettes */

type Theme = {
  name: "dark" | "light";
  dark: boolean;
  bg0: RGB; bg1: RGB;
  lit: RGB; shade: RGB; limb: RGB;
  deep: RGB;     // sphères en retrait
  teal: RGB; navy: RGB; slate: RGB;
  accent: RGB;   // le point chaud
  shadow: RGB; shadowA: number;
  line: RGB; lineA: number;
  grain: number; vign: number; curve: number;
};

const DARK: Theme = {
  name: "dark", dark: true,
  bg0: hex("#0e1013"), bg1: hex("#12171b"),
  lit: hex("#394a52"), shade: hex("#0d1114"), limb: hex("#778b95"),
  deep: hex("#1c2429"),
  teal: hex("#1d3a44"), navy: hex("#16233a"), slate: hex("#222d35"),
  accent: hex("#ff3b2e"),
  shadow: hex("#07090a"), shadowA: 0.55,
  line: hex("#cfd8de"), lineA: 0.1,
  grain: 0.017, vign: 0.5, curve: 1.16,
};
const LIGHT: Theme = {
  name: "light", dark: false,
  bg0: hex("#e4e7ea"), bg1: hex("#dde1e5"),
  lit: hex("#eceff1"), shade: hex("#b2bcc4"), limb: hex("#f7f8f9"),
  deep: hex("#c3ccd2"),
  teal: hex("#b3cbd0"), navy: hex("#bcc6d6"), slate: hex("#c6ced4"),
  accent: hex("#d11a11"),
  shadow: hex("#98a4ad"), shadowA: 0.35,
  line: hex("#14161a"), lineA: 0.1,
  grain: 0.013, vign: 0.18, curve: 1,
};

/* ----------------------------------------------------------- compositions */

type Comp = (c: Canvas, t: Theme) => void;

/** Autour de l'accent : plus doux en sombre (ref. coral), franc en clair. */
const hot = (t: Theme): RGB => (t.dark ? hex("#ff4a3c") : hex("#d11a11"));

/** 1 — trois sphères + sphère de fond au liseré rouge (réf. 4). */
const comp1: Comp = (c, t) => {
  c.gradient(t.bg0, t.bg1, 70);
  c.blob(0.3, 1.1, 0.7, 0.45, t.teal, t.dark ? 0.3 : 0.45);

  const back = { cx: 0.8, cy: 0.74, r: 0.62 };
  c.halo(back.cx, back.cy, back.r, 0.06, t.shadow, t.shadowA * 0.6);
  // arête rouge : halo extérieur + liseré fin
  c.sphere({
    ...back, lit: t.dark ? hex("#222c32") : t.deep, shade: t.dark ? hex("#0d1013") : hex("#aeb8c0"),
    wrap: 0.2, gamma: 1.4,
    rimIn: { ang: -0.1, spread: 0.55, c: hot(t), k: t.dark ? 1.6 : 1.2, pow: 5 },
  });
  c.rim(back.cx, back.cy, back.r, -0.1, 0.5, hot(t), t.dark ? 0.5 : 0.4, 0.014, 0.004);

  // mid-gauche
  c.halo(0.3, 0.62, 0.5, 0.07, t.shadow, t.shadowA);
  c.sphere({ cx: 0.3, cy: 0.62, r: 0.5, lit: t.lit, shade: t.shade, limb: t.limb, limbK: 0.6, wrap: 0.3, gamma: 1.7 });
  // haut-droite
  c.halo(1.45, 0.0, 0.48, 0.07, t.shadow, t.shadowA);
  c.sphere({ cx: 1.45, cy: 0.0, r: 0.48, lit: t.lit, shade: t.shade, limb: t.limb, limbK: 0.65, wrap: 0.3, gamma: 1.7, light: [-0.6, 0.35, 0.6] });
  // bas
  c.halo(1.0, 1.55, 0.58, 0.07, t.shadow, t.shadowA);
  c.sphere({ cx: 1.0, cy: 1.55, r: 0.58, lit: t.lit, shade: t.shade, limb: t.limb, limbK: 0.6, wrap: 0.3, gamma: 1.7, light: [-0.3, -0.8, 0.5] });
};

/** 2 — lentille en flou radial (réf. 2). */
const comp2: Comp = (c, t) => {
  const O = { x: 0.5, y: 0.9 }; // centre des bandes polaires
  const stops: [number, RGB][] = t.dark
    ? [[0, hex("#0a0c0f")], [0.25, hex("#11181c")], [0.5, hex("#162a32")], [0.72, hex("#1d272d")], [1, hex("#2b373f")]]
    : [[0, hex("#c3ced4")], [0.3, hex("#d6dde1")], [0.55, hex("#b6cbd0")], [0.78, hex("#cbd3d9")], [1, hex("#e3e7ea")]];
  const H1 = (th: number, p: number) => 0.6 * Math.sin(th + p) + 0.3 * Math.sin(2 * th + 2.1 * p) + 0.2 * Math.sin(3 * th + 0.7 * p);
  const wU = W / H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / H, v = (y + 0.5) / H;
      const dx = u - O.x, dy = v - O.y;
      const r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const s =
        0.55 * Math.sin(r * 8.5 + 0.6 + 0.9 * H1(th, 1)) +
        0.3 * Math.sin(r * 15 + 2 + 1.3 * H1(th, 2.3)) +
        0.15 * Math.sin(r * 29 + 1 * H1(th, 4)) +
        0.07 * Math.sin(r * 71 + 2.5 * H1(th, 5.1)) +
        0.04 * Math.sin(r * 153 + 3 * H1(th, 1.7));
      const tt = clamp(0.5 + 0.5 * s * 1.15);
      let col = ramp(stops, tt);
      // sombre vers l'extérieur / ciel de coin
      const far = smooth(0.7, 1.9, r);
      col = mix3(col, t.dark ? hex("#0e1013") : hex("#e4e7ea"), far * (t.dark ? 0.7 : 0.55));
      const i = (y * W + x) * 3;
      c.d[i] = col[0]; c.d[i + 1] = col[1]; c.d[i + 2] = col[2];
    }
  void wU;
  // lentille
  const S = { cx: 0.7, cy: 0.82, r: 0.58 };
  c.halo(S.cx, S.cy, S.r, 0.05, t.shadow, t.shadowA * 0.8);
  c.sphere({
    ...S,
    lit: t.dark ? hex("#43545b") : hex("#e6ecee"), shade: t.dark ? hex("#10181d") : hex("#a2b0b9"),
    light: [-0.55, -0.35, 0.55], wrap: 0.4, gamma: 1.6,
    limb: t.dark ? hex("#9a8685") : hex("#f1e8e7"), limbK: 0.4, limbPow: 4,
    moire: { amp: t.dark ? 0.08 : 0.03, p: 0.0066, dx: 0.004, dy: 0.0025 },
  });
  // bokeh corail, sur le bord haut de la lentille, flou
  c.bokeh(0.98, 0.52, 0.048, 0.05, 0.044, 0.026, hot(t), t.dark ? 0.6 : 0.75);
  c.blob(0.98, 0.52, 0.09, 0.09, hot(t), t.dark ? 0.1 : 0.08);
};

/** 3 — deux sphères qui se touchent, bokeh au contact (réf. 3). */
const comp3: Comp = (c, t) => {
  c.gradient(t.bg0, t.bg1, 90);
  c.blob(0.9, 0.86, 0.9, 0.09, t.teal, t.dark ? 0.75 : 0.8);
  c.blob(0.15, 0.9, 0.45, 0.2, t.navy, t.dark ? 0.5 : 0.5);

  const A = { cx: 0.98, cy: 0.16, r: 0.7 };
  const B = { cx: 0.82, cy: 1.6, r: 0.78 };
  c.halo(A.cx, A.cy, A.r, 0.05, t.shadow, t.shadowA * 0.8);
  c.sphere({
    ...A, lit: t.dark ? hex("#44545d") : t.lit, shade: t.dark ? hex("#0d1215") : hex("#aeb9c1"),
    light: [-0.25, -0.5, 0.7], wrap: 0.55, gamma: 1.5, soft: 0.003,
    limb: t.dark ? hex("#9a9aa8") : hex("#faf9fb"), limbK: 0.35,
    moire: { amp: t.dark ? 0.06 : 0.024, p: 0.0072, dx: 0.005, dy: 0.002 },
  });
  c.halo(B.cx, B.cy, B.r, 0.05, t.shadow, t.shadowA * 0.8);
  c.sphere({
    ...B, lit: t.dark ? hex("#566773") : t.lit, shade: t.dark ? hex("#0d1215") : hex("#aeb9c1"),
    light: [-0.55, -0.4, 0.55], wrap: 0.5, gamma: 1.4, soft: 0.003,
    limb: t.dark ? hex("#a6aab6") : hex("#faf9fb"), limbK: 0.35,
    moire: { amp: t.dark ? 0.06 : 0.024, p: 0.0069, dx: -0.004, dy: 0.004 },
  });
  // bokeh au point de contact + trainée
  const hc = hot(t);
  c.bokeh(1.0, 0.845, 0.05, 0.03, 0.028, 0.02, hc, t.dark ? 0.62 : 0.8);
  c.bokeh(1.0, 0.935, 0.045, 0.026, 0.024, 0.02, hc, t.dark ? 0.3 : 0.4);
  c.blob(1.0, 0.88, 0.16, 0.06, hc, t.dark ? 0.1 : 0.08);
};

/** 4 — dégradés flous + filets de cercles / grille (réf. 1). */
const comp4: Comp = (c, t) => {
  c.gradient(t.bg0, t.bg1, 30);
  c.blob(0.05, 0.0, 0.55, 0.5, t.navy, t.dark ? 0.9 : 0.75);
  c.blob(1.6, 0.35, 0.8, 0.8, t.slate, t.dark ? 0.8 : 0.8);
  // masse chaude désaturée, bas-gauche
  const clay = t.dark ? hex("#5b2c26") : hex("#d8b9b1");
  c.blob(0.4, 1.0, 0.7, 0.5, clay, t.dark ? 0.55 : 0.55);
  c.blob(0.55, 0.95, 0.3, 0.3, t.dark ? hex("#7a3a2c") : hex("#d9a99d"), t.dark ? 0.3 : 0.3);
  c.blob(1.3, 1.1, 0.6, 0.4, t.teal, t.dark ? 0.35 : 0.35);

  const x1 = CX - 0.44, x2 = CX + 0.44;
  c.hairLine(false, x1, 1.3, t.line, t.lineA * 0.8);
  c.hairLine(false, x2, 1.3, t.line, t.lineA * 0.8);
  c.hairLine(true, 0.3, 1.3, t.line, t.lineA * 0.8);
  c.hairLine(true, 0.72, 1.3, t.line, t.lineA * 0.8);
  c.hairCircle(CX, 0.5, 0.62, 1.5, t.line, t.lineA * 1.3);
  c.hairCircle(CX, 1.0, 0.62, 1.5, t.line, t.lineA * 1.3);
  // le seul point chaud : sur le cercle, à l'intersection avec un filet
  const hx = x2, hy = 0.5 + Math.sqrt(0.62 * 0.62 - 0.44 * 0.44);
  c.blob(hx, hy, 0.03, 0.03, hot(t), t.dark ? 0.35 : 0.25);
  c.sphere({ cx: hx, cy: hy, r: 0.0085, lit: hot(t), shade: hot(t), soft: 0.001 });
};

/** 5 — dômes emboîtés, excentrés, un éclat de flare au pli. */
const comp5: Comp = (c, t) => {
  c.gradient(t.bg0, t.bg1, 100);
  const lits = t.dark
    ? ["#1b252b", "#222e35", "#2b3a42", "#364851", "#42555f"]
    : ["#dde2e6", "#e3e8eb", "#e8ecee", "#edf0f1", "#f1f3f4"];
  const shades = t.dark
    ? ["#0c1013", "#0d1215", "#0f1519", "#11181c", "#131b20"]
    : ["#aab5be", "#afbac2", "#b5bfc7", "#bbc5cc", "#c1cad1"];
  const R = [1.15, 0.9, 0.67, 0.46, 0.27];
  for (let k = 0; k < 5; k++) {
    const cx = 0.74 + 0.085 * k, cy = 0.5 + 0.1 * k;
    c.halo(cx, cy, R[k], 0.045, t.shadow, t.shadowA * 0.9);
    c.sphere({
      cx, cy, r: R[k], lit: hex(lits[k]), shade: hex(shades[k]), light: [-0.5, -0.7, 0.5],
      wrap: 0.3, gamma: 1.5, limb: t.limb, limbK: t.dark ? 0.35 : 0.2, limbPow: 3.5,
      rimIn: k === 2 ? { ang: -1.95, spread: 0.3, c: hot(t), k: t.dark ? 1.4 : 1.6, pow: 6 } : undefined,
    });
    if (k === 2) c.rim(cx, cy, R[k], -1.95, 0.28, hot(t), t.dark ? 0.35 : 0.5, 0.012, 0.003);
  }
};

const COMPS: Comp[] = [comp1, comp2, comp3, comp4, comp5];

/* ------------------------------------------------------------- post + I/O */

function finish(c: Canvas, t: Theme, seed: number): { px: Uint8Array; lum: number } {
  c.vignette(t.vign, t.dark ? hex("#07090a") : hex("#c9d0d6"));
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const px = new Uint8Array(W * H * 3);
  let sum = 0;
  for (let i = 0; i < W * H; i++) {
    const n = gauss() * t.grain; // luma
    const j = i * 3;
    const lum0 = Math.pow(0.2126 * c.d[j] + 0.7152 * c.d[j + 1] + 0.0722 * c.d[j + 2], t.curve);
    // grain un peu plus marqué dans les tons moyens
    const g = 0.55 + 0.9 * (1 - Math.abs(lum0 * 2 - 1));
    for (let k = 0; k < 3; k++) {
      const v = Math.pow(Math.max(c.d[j + k], 0), t.curve) + n * g + gauss() * t.grain * 0.18;
      px[j + k] = clamp(Math.round(v * 255), 0, 255);
    }
    sum += (0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2]) / 255;
  }
  return { px, lum: sum / (W * H) };
}

async function encode(px: Uint8Array, file: string, preview?: string) {
  const proc = Bun.spawn(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-",
      "-c:v", "libwebp", "-quality", String(QUALITY), "-compression_level", "6", "-preset", "picture", file],
    { stdin: "pipe", stderr: "inherit" },
  );
  proc.stdin.write(px);
  await proc.stdin.end();
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg a échoué sur ${file}`);
  if (preview) {
    const p = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", "-i", file, "-vf", "scale=1280:-1", preview]);
    await p.exited;
  }
}

await mkdir(OUT, { recursive: true });
if (PREVIEW) await mkdir(PREVIEW, { recursive: true });
for (let n = 1; n <= COMPS.length; n++) {
  if (ONLY && Number(ONLY) !== n) continue;
  for (const t of [DARK, LIGHT]) {
    const c = new Canvas();
    COMPS[n - 1](c, t);
    const { px, lum } = finish(c, t, 1000 * n + (t.dark ? 1 : 2));
    const name = `${n}-${t.name}`;
    const file = path.join(OUT, `${name}.webp`);
    await encode(px, file, PREVIEW ? path.join(PREVIEW, `${name}.png`) : undefined);
    const kb = (Bun.file(file).size / 1024).toFixed(0);
    console.log(`${name}.webp  ${W}x${H}  ${kb} Ko  luminance ${lum.toFixed(3)}`);
  }
}

/**
 * Conversion image -> Glyph Matrix.
 *
 * La matrice est monochrome : une LED n'a qu'une luminosité. Les réglages R/G/B
 * ne colorent donc rien, ils pondèrent la contribution de chaque canal à la
 * luminance — exactement un filtre coloré en photo noir et blanc (un poids
 * rouge élevé éclaircit les peaux et noircit un ciel bleu).
 *
 * Chaîne :
 *   cadrage -> supersample -> linéarisation -> luma pondérée -> moyenne de zone
 *   -> ré-encodage perceptuel -> netteté -> tonalité -> quantification (+dither)
 *   -> masque disque
 *
 * Le downsample se fait en lumière **linéaire** : moyenner des valeurs sRGB
 * assombrit les zones contrastées (le classique gris à 50 % d'un damier
 * noir/blanc, qui devrait être ~73 % en sRGB).
 */

import { SIZE, CELLS, isInside } from "./matrix";

/** Facteur de supersampling : chaque LED intègre SS x SS pixels sources. */
const SS = 8;
const SAMPLE = SIZE * SS; // 200 x 200

export type DitherMode = "none" | "floyd" | "bayer";

export type Params = {
  /* --- cadrage --- */
  zoom: number; // 1 = cover
  offsetX: number; // -1..1, fraction d'un demi-cadre
  offsetY: number;
  rotation: number; // degrés

  /* --- mixeur de canaux --- */
  wR: number;
  wG: number;
  wB: number;

  /* --- tonalité --- */
  exposure: number; // stops, -3..3
  black: number; // gate bas, 0..1
  white: number; // gate haut, 0..1
  contrast: number; // -1..3
  gamma: number; // 0.2..3
  sharpen: number; // 0..2
  invert: boolean;

  /* --- sortie --- */
  levels: number; // 2..256 paliers de luminosité
  dither: DitherMode;
  ditherAmount: number; // 0..1
  ceiling: number; // luminosité max envoyée à la LED, 0..1
};

export const DEFAULTS: Params = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  wR: 0.2126,
  wG: 0.7152,
  wB: 0.0722,
  exposure: 0,
  black: 0,
  white: 1,
  contrast: 0,
  gamma: 1,
  sharpen: 0.35,
  invert: false,
  levels: 16,
  dither: "none",
  ditherAmount: 1,
  ceiling: 1,
};

/** Presets du mixeur — les poids sont normalisés à la volée, pas besoin de somme 1. */
export const CHANNEL_PRESETS: Record<string, [number, number, number]> = {
  LUMA: [0.2126, 0.7152, 0.0722], // Rec. 709, la référence perceptuelle
  ÉGAL: [1, 1, 1],
  ROUGE: [1, 0.15, 0],
  VERT: [0.1, 1, 0.1],
  BLEU: [0, 0.2, 1],
  "CIEL NOIR": [1.4, 0.4, -0.4], // filtre rouge photo : ciel dense, nuages détachés
};

/* -------------------------------------------------------------------------- */
/* sRGB <-> linéaire                                                          */
/* -------------------------------------------------------------------------- */

const TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function encodeSrgb(l: number): number {
  if (l <= 0) return 0;
  if (l >= 1) return 1;
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

/* -------------------------------------------------------------------------- */
/* 1. Cadrage + échantillonnage                                                */
/* -------------------------------------------------------------------------- */

/**
 * Dessine la source dans un canvas SAMPLE x SAMPLE, cadrée en cover, sur fond
 * noir : une image à canal alpha voit ses zones transparentes s'éteindre, ce
 * qui est le comportement attendu d'un rendu LED.
 */
export function sampleSource(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  p: Params,
  target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const cvs = target ?? document.createElement("canvas");
  cvs.width = cvs.height = SAMPLE;
  const ctx = cvs.getContext("2d", { willReadFrequently: true })!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SAMPLE, SAMPLE);

  // cover : la plus grande des deux échelles, pour que l'image couvre le cadre
  const cover = Math.max(SAMPLE / srcW, SAMPLE / srcH);
  const s = cover * Math.max(0.05, p.zoom);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(
    SAMPLE / 2 + (p.offsetX * SAMPLE) / 2,
    SAMPLE / 2 + (p.offsetY * SAMPLE) / 2,
  );
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.drawImage(src, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();

  return cvs;
}

/* -------------------------------------------------------------------------- */
/* 2. Moyenne de zone -> 25 x 25 perceptuel                                    */
/* -------------------------------------------------------------------------- */

function downsample(data: Uint8ClampedArray, p: Params): Float32Array {
  // les poids sont normalisés : monter R sans toucher G/B ne doit pas
  // surexposer l'image entière, ça doit rééquilibrer les teintes
  const sum = p.wR + p.wG + p.wB;
  const n = Math.abs(sum) < 1e-4 ? 1 : sum;
  const wR = p.wR / n;
  const wG = p.wG / n;
  const wB = p.wB / n;

  const out = new Float32Array(CELLS);
  const inv = 1 / (SS * SS);

  for (let cy = 0; cy < SIZE; cy++) {
    for (let cx = 0; cx < SIZE; cx++) {
      let acc = 0;
      const y0 = cy * SS;
      const x0 = cx * SS;
      for (let y = 0; y < SS; y++) {
        let o = ((y0 + y) * SAMPLE + x0) * 4;
        for (let x = 0; x < SS; x++, o += 4) {
          acc +=
            wR * TO_LINEAR[data[o]] +
            wG * TO_LINEAR[data[o + 1]] +
            wB * TO_LINEAR[data[o + 2]];
        }
      }
      // ré-encodage perceptuel : la valeur d'une LED est une consigne PWM, mais
      // l'œil la lit en gamma. Sans ce retour en sRGB tout le rendu est trop sombre.
      out[cy * SIZE + cx] = encodeSrgb(Math.max(0, acc * inv));
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 3. Netteté (unsharp mask sur la grille 25 x 25)                             */
/* -------------------------------------------------------------------------- */

function unsharp(v: Float32Array, amount: number): Float32Array {
  if (amount <= 0.001) return v;
  const blur = new Float32Array(CELLS);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let acc = 0;
      let w = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= SIZE || xx < 0 || xx >= SIZE) continue;
          const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          acc += v[yy * SIZE + xx] * k;
          w += k;
        }
      }
      blur[y * SIZE + x] = acc / w;
    }
  }
  const out = new Float32Array(CELLS);
  for (let i = 0; i < CELLS; i++) out[i] = v[i] + amount * (v[i] - blur[i]);
  return out;
}

/* -------------------------------------------------------------------------- */
/* 4. Tonalité                                                                 */
/* -------------------------------------------------------------------------- */

function tone(v: Float32Array, p: Params): Float32Array {
  const gain = Math.pow(2, p.exposure);
  // garde-fou : black >= white produirait une division par ~0 et un rendu binaire
  const lo = Math.min(p.black, p.white - 0.01);
  const span = Math.max(0.01, p.white - lo);
  const k = 1 + Math.max(-0.99, p.contrast);
  const g = Math.max(0.05, p.gamma);

  const out = new Float32Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    let x = v[i] * gain;
    x = (x - lo) / span; // gates : point noir / point blanc
    x = (x - 0.5) * k + 0.5; // contraste autour du gris moyen
    x = x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(x, g);
    out[i] = p.invert ? 1 - x : x;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 5. Quantification + dithering                                               */
/* -------------------------------------------------------------------------- */

// prettier-ignore
const BAYER4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

function quantize(v: Float32Array, p: Params): Float32Array {
  const levels = Math.max(2, Math.round(p.levels));
  const step = 1 / (levels - 1);
  const out = new Float32Array(CELLS);

  if (p.dither === "floyd") {
    // Diffusion d'erreur en serpentin. L'erreur n'est propagée qu'aux cellules
    // du disque : la pousser hors du masque la ferait disparaître et
    // assombrirait tout le bord de la matrice.
    const buf = Float32Array.from(v);
    const push = (x: number, y: number, e: number) => {
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
      const i = y * SIZE + x;
      if (isInside[i]) buf[i] += e;
    };
    for (let y = 0; y < SIZE; y++) {
      const ltr = y % 2 === 0;
      for (let n = 0; n < SIZE; n++) {
        const x = ltr ? n : SIZE - 1 - n;
        const i = y * SIZE + x;
        if (!isInside[i]) continue;
        const old = buf[i];
        const q = Math.min(1, Math.max(0, Math.round(old / step) * step));
        out[i] = q;
        const e = (old - q) * p.ditherAmount;
        const d = ltr ? 1 : -1;
        push(x + d, y, (e * 7) / 16);
        push(x - d, y + 1, (e * 3) / 16);
        push(x, y + 1, (e * 5) / 16);
        push(x + d, y + 1, (e * 1) / 16);
      }
    }
    return out;
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (!isInside[i]) continue;
      let val = v[i];
      if (p.dither === "bayer") {
        const t = BAYER4[(y % 4) * 4 + (x % 4)] / 16 - 0.5;
        val += t * step * p.ditherAmount;
      }
      out[i] = Math.min(1, Math.max(0, Math.round(val / step) * step));
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Pipeline complet                                                            */
/* -------------------------------------------------------------------------- */

export type Frame = {
  /** 625 valeurs 0..1, row-major, 0 hors disque. */
  values: Float32Array;
  /** Nombre de LEDs allumées (> 0) parmi les 489 du disque. */
  lit: number;
  /** Luminosité moyenne sur le disque, 0..1. */
  mean: number;
};

const EMPTY: Frame = { values: new Float32Array(CELLS), lit: 0, mean: 0 };

export function convert(
  src: CanvasImageSource | null,
  srcW: number,
  srcH: number,
  p: Params,
  scratch?: HTMLCanvasElement,
): Frame {
  if (!src || !srcW || !srcH) return EMPTY;

  const cvs = sampleSource(src, srcW, srcH, p, scratch);
  const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  let v = downsample(data, p);
  v = unsharp(v, p.sharpen);
  v = tone(v, p);
  v = quantize(v, p);

  const ceiling = Math.min(1, Math.max(0, p.ceiling));
  let lit = 0;
  let sum = 0;
  for (let i = 0; i < CELLS; i++) {
    if (!isInside[i]) {
      v[i] = 0;
      continue;
    }
    v[i] *= ceiling;
    if (v[i] > 0) lit++;
    sum += v[i];
  }

  return { values: v, lit, mean: sum / (lit || 1) };
}

/** Conversion en consignes 0-255, le format attendu par le Glyph Matrix SDK. */
export function toBytes(f: Frame): Uint8Array {
  const out = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) out[i] = Math.round(f.values[i] * 255);
  return out;
}

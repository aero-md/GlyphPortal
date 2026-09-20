/**
 * Fabrique les boucles de mini-prévisu de G-Meter (Haloglyph), au format du
 * Glyph Museum — une par appareil.
 *
 *     bun run scripts/gforce-preview.ts
 *
 * Port de `GForceDemo.kt` : un tour de circuit, freinages dégressifs et
 * virages qui se recouvrent plutôt qu'une arche isolée par axe — rejoué à
 * travers le vrai renderer. Seize secondes en mode vif, puis les pics.
 *
 * Le (3) les affiche d'un coup, dans les quatre coins, tenus quatre secondes —
 * comme le fait l'appui long sur l'appareil. Le (4a) Pro les fait défiler un
 * par un (voir `compact` dans `render.ts`) ; la boucle y tient donc un cycle
 * complet — `PEAK_PER * 4` — pour montrer les quatre avant de reboucler.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

Bun.plugin({
  name: "hors-vite",
  setup(build) {
    build.onResolve({ filter: /^\$lib(\/|$)/ }, (args) => ({
      path: path.join(ROOT, "src/lib", args.path.slice("$lib".length)),
    }));
    build.onLoad({ filter: /\.(webp|png|jpe?g|svg)$/ }, () => ({
      contents: 'export default "";',
      loader: "js",
    }));
  },
});

const { DEVICES } = await import("../src/lib/index");
const { GForceRenderer, PEAK_PER } = await import("../src/routes/gforce/lib/render");

const FPS = 25;
const MS = Math.round(1000 / FPS);

const PERIOD = 16;

/** `[début, fin, amplitude signée en g]` — voir `GForceDemo.kt`. */
type Arc = [number, number, number];

/**
 * Freinage (positif) et accélération (négatif) : lancer, freinage dégressif
 * du premier virage, remise de gaz, léger coup de frein pour la chicane,
 * longue accélération, gros freinage de l'épingle, remise de gaz en sortie.
 */
const FRONT: Arc[] = [
  [0.0, 0.09, -0.35],
  [0.09, 0.2, 1.1],
  [0.23, 0.33, -0.55],
  [0.39, 0.44, 0.4],
  [0.48, 0.52, 0.25],
  [0.56, 0.71, -0.75],
  [0.73, 0.87, 1.3],
  [0.89, 0.98, -0.5],
];

/**
 * Latéral : entrée du premier virage, léger contre-braquage en sortie,
 * chicane gauche-droite franche, un appui avant l'épingle, l'épingle
 * elle-même — qui recouvre la fin du gros freinage — puis la sortie.
 */
const RIGHT: Arc[] = [
  [0.13, 0.29, 0.85],
  [0.29, 0.35, -0.15],
  [0.43, 0.49, -0.9],
  [0.49, 0.55, 0.9],
  [0.65, 0.75, 0.55],
  [0.75, 0.91, -1.05],
  [0.91, 0.98, 0.2],
];

function bump(phase: number, from: number, to: number): number {
  if (phase < from || phase > to) return 0;
  return Math.sin((Math.PI * (phase - from)) / (to - from));
}

function sumOf(arcs: Arc[], phase: number): number {
  let v = 0;
  for (const [from, to, amp] of arcs) v += amp * bump(phase, from, to);
  return v;
}

function peakOf(arcs: Arc[], positive: boolean): number {
  let best = 0;
  for (const [, , amp] of arcs) if (positive ? amp > 0 : amp < 0) best = Math.max(best, Math.abs(amp));
  return best;
}

function readingAt(seconds: number) {
  const phase = (seconds / PERIOD) % 1;
  return {
    towardFront: sumOf(FRONT, phase),
    towardRight: sumOf(RIGHT, phase),
    hasFix: true,
    front: peakOf(FRONT, true),
    rear: peakOf(FRONT, false),
    left: peakOf(RIGHT, false),
    right: peakOf(RIGHT, true),
  };
}

function toP(device: (typeof DEVICES)[number], values: Float32Array): number[] {
  return device.inside.map((i) => {
    const v = values[i];
    return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  });
}

function makeFrames() {
  const frames: { p: number[]; d: number }[] = [];
  function push(p: number[]): void {
    const last = frames[frames.length - 1];
    if (last && last.p.length === p.length && last.p.every((v, i) => v === p[i])) {
      last.d += MS;
      return;
    }
    frames.push({ p, d: MS });
  }
  return { frames, push };
}

for (const device of DEVICES) {
  const renderer = new GForceRenderer(device);
  const compact = device.id === "phone4apro";
  const { frames, push } = makeFrames();

  for (let f = 0; f * (1 / FPS) < PERIOD; f++) {
    push(toP(device, renderer.renderLive(readingAt(f / FPS))));
  }

  const peaks = readingAt(PERIOD - 0.01);
  if (compact) {
    /* Un cycle complet du défilement compact — voir l'en-tête du fichier. */
    const CYCLE = PEAK_PER * 4;
    for (let f = 0; f * (1 / FPS) < CYCLE; f++) {
      const t = f / FPS;
      push(toP(device, renderer.renderPeaks(peaks, t)));
    }
  } else {
    /* Les pics, tenus quatre secondes — le temps de les lire, comme un appui
       long sur l'appareil laisserait le temps de le faire. */
    for (let f = 0; f * (1 / FPS) < 4; f++) {
      push(toP(device, renderer.renderPeaks(peaks)));
    }
  }

  const json = JSON.stringify({ v: 1, frames });
  const OUT = path.join(ROOT, "static/preview", compact ? "gforce4apro.json" : "gforce.json");

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, json);

  const total = frames.reduce((s, f) => s + f.d, 0);
  console.log(
    `${path.relative(ROOT, OUT)} — ${frames.length} trames, ${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko`,
  );
}

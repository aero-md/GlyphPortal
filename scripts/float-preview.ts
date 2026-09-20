/**
 * Fabrique les boucles de mini-prévisu de Float (Haloglyph), au format du
 * Glyph Museum — une par appareil.
 *
 *     bun run scripts/float-preview.ts
 *
 * Port de `PlumbDemo.kt` pour le niveau — un téléphone qu'on redresse, une
 * bulle qui se pose dans la couronne, et qui repart — suivi d'un tour de
 * boussole complet à un rythme choisi pour la vignette et non pour le hub de
 * l'app : à 9°/s comme sur l'appareil, le tour prendrait quarante secondes.
 *
 * Les deux appareils rejouent la même scène : `render.ts` bascule seul sur
 * son rendu compact (couronne en losanges, boussole à répères et lettre
 * centrale) selon `device.id`, il n'y a rien de plus à écrire ici pour le
 * (4a) Pro.
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
const { PlumbRenderer } = await import("../src/routes/float/lib/render");
const { PlumbScale, RANGES, Heading } = await import("../src/routes/float/lib/engine");

const FPS = 25;
const MS = Math.round(1000 / FPS);

const LEVEL_PERIOD = 7;
const MAX_TILT = 6;
const WOBBLE = 0.12;
const WOBBLE_TURNS = 3;
const SWIVEL = 0.7;
const START_ANGLE = 0.8;
const range = RANGES.normale;

function levelReadingAt(seconds: number) {
  const phase = (seconds / LEVEL_PERIOD) % 1;
  const approach = 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
  const wobble = 1 + WOBBLE * Math.sin(2 * Math.PI * WOBBLE_TURNS * phase);
  const tilt = Math.max(0, MAX_TILT * approach * approach * wobble);
  const direction = 2 * Math.PI * SWIVEL * phase + START_ANGLE;
  return {
    tiltDegrees: tilt,
    dirX: Math.cos(direction),
    dirY: Math.sin(direction),
    hasTilt: true,
    vertical: false,
    alongX: true,
    level: tilt <= PlumbScale.tolerance(range),
    heading: 0,
    hasHeading: false,
    headingTrusted: true,
  };
}

/** Un tour complet en quatre secondes — lisible en vignette, pas réaliste. */
const COMPASS_PERIOD = 4;
const COMPASS_RATE = 360 / COMPASS_PERIOD;

function compassReadingAt(seconds: number) {
  return {
    tiltDegrees: 0,
    dirX: 0,
    dirY: 0,
    hasTilt: true,
    vertical: false,
    alongX: true,
    level: false,
    heading: Heading.normalize(seconds * COMPASS_RATE),
    hasHeading: true,
    headingTrusted: true,
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
  const renderer = new PlumbRenderer(device);
  const { frames, push } = makeFrames();

  for (let f = 0; f * (1 / FPS) < LEVEL_PERIOD; f++) {
    const t = f / FPS;
    push(toP(device, renderer.renderLevel(levelReadingAt(t), range)));
  }

  for (let f = 0; f * (1 / FPS) < COMPASS_PERIOD; f++) {
    const t = f / FPS;
    push(toP(device, renderer.renderCompass(compassReadingAt(t), t)));
  }

  const json = JSON.stringify({ v: 1, frames });
  const OUT = path.join(
    ROOT,
    "static/preview",
    device.id === "phone4apro" ? "float4apro.json" : "float.json",
  );

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, json);

  const total = frames.reduce((s, f) => s + f.d, 0);
  console.log(
    `${path.relative(ROOT, OUT)} — ${frames.length} trames, ${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko`,
  );
}

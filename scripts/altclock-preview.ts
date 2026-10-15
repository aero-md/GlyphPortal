/**
 * Fabrique les boucles de mini-prévisu d'Alt Clock (Haloglyph), au format du
 * Glyph Museum — une par appareil.
 *
 *     bun run scripts/altclock-preview.ts
 *
 * Le toy n'a rien d'animé : la boucle est un diaporama des trois styles, dans
 * l'ordre du sélecteur, chacun tenu trois secondes sur la même heure. Une
 * vignette qui n'en montrerait qu'un mentirait par omission, comme celle de
 * Sonoglyph avec ses deux affichages.
 *
 * Le (4a) Pro écrit les trois styles avec la même police compacte (voir
 * `render.ts`) : trois trames identiques de suite, donc fusionnées en une seule
 * qui dure neuf secondes, comme dans les autres scripts.
 *
 * L'heure est figée, pas celle du jour de génération : une vignette de sommaire
 * montre à quoi ressemble le toy, elle ne donne pas l'heure. `10 28` met quatre
 * chiffres distincts, dont le `1` et le `8`, ceux qui diffèrent le plus d'un
 * style à l'autre.
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
const { AltClockRenderer, STYLES } = await import("../src/routes/altclock/lib/render");

const HOUR = 10;
const MINUTE = 28;
const HOLD_MS = 3000;

function toP(device: (typeof DEVICES)[number], values: Float32Array): number[] {
  return device.inside.map((i) => {
    const v = values[i];
    return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  });
}

for (const device of DEVICES) {
  const renderer = new AltClockRenderer(device);
  const compact = device.id === "phone4apro";
  const frames: { p: number[]; d: number }[] = [];

  for (const style of STYLES) {
    const p = toP(device, renderer.render(HOUR, MINUTE, "h24", style));
    const last = frames[frames.length - 1];
    if (last && last.p.every((v, i) => v === p[i])) last.d += HOLD_MS;
    else frames.push({ p, d: HOLD_MS });
  }

  const json = JSON.stringify({ v: 1, frames });
  const OUT = path.join(ROOT, "static/preview", compact ? "altclock4apro.json" : "altclock.json");

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, json);

  const total = frames.reduce((s, f) => s + f.d, 0);
  console.log(
    `${path.relative(ROOT, OUT)} — ${frames.length} trames, ${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko`,
  );
}

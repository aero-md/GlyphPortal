/**
 * Fabrique la boucle de mini-prévisu de GlyphSlot, au format du Glyph Museum.
 *
 *     bun run scripts/glyphslot-preview.ts
 *
 * **Elle est jouée, pas dessinée.** Le script monte le vrai moteur du toy —
 * `slot.ts` pour la cinématique, `SlotRenderer` pour le rendu — et déroule sa
 * boucle image par image, exactement comme le fait `App.svelte` à l'écran. Ce
 * qui sort est donc ce que fait la machine, pas une imitation : le jour où le
 * freinage d'un rouleau change, il suffit de relancer ce script.
 *
 * Ce qui remplace le fichier d'avant, un Lottie de 548 Ko exporté d'ailleurs, et
 * dont on ne pouvait plus rien faire : ce n'étaient plus des consignes de LED
 * mais des rectangles vectoriels qu'il fallait relire au pixel pour retrouver la
 * matrice — une conversion lossy, qui rendait des LEDs à demi allumées là où le
 * toy n'en met aucune.
 *
 * Le scénario est écrit ici et non tiré au sort : une mini-prévisu doit montrer
 * ce que fait le toy en un tour de boucle, pas ce que le hasard a bien voulu
 * donner le jour de l'export.
 *
 * - **un tour perdant**, puis **un tour gagnant** — l'anneau du bord pulse et la
 *   payline bat. C'est la boucle complète de la machine, dans les deux issues
 *   qu'un visiteur verra en jouant.
 * - **trois symboles, jamais le 777.** Le jackpot dure 7,5 s à lui seul, avec
 *   strobe, bandeau défilant et feu d'artifice : sur un disque de 141 px il
 *   n'est plus lisible, et il triplerait la boucle. Il se mérite sur la préview
 *   interactive.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "apps/portal/public/preview/glyphslot.json");

/* Le moteur du toy importe `@glyph/kit`, dont le catalogue d'appareils importe
   les photos de dos. C'est une importation d'asset Vite, que Bun ne sait pas
   résoudre — et dont on n'a que faire ici, puisqu'on ne rend aucune photo. Le
   greffon la remplace par une chaîne vide. Il doit être posé **avant** le
   premier `import` du moteur, d'où les imports dynamiques plus bas. */
Bun.plugin({
  name: "stub-assets",
  setup(build) {
    build.onLoad({ filter: /\.(webp|png|jpe?g|svg)$/ }, () => ({
      contents: 'export default "";',
      loader: "js",
    }));
  },
});

/* Chemin relatif et non `@glyph/kit` : la racine du dépôt ne déclare pas le
   paquet dans ses dépendances, ce sont les apps qui le font. Le moteur du toy,
   lui, l'importe par son nom depuis `apps/glyphslot/`, où il est bien déclaré. */
const { DEFAULT_DEVICE } = await import("../packages/kit/src/index");
const { SlotRenderer } = await import("../apps/glyphslot/src/lib/render");
const { RESULT_DUR, makePlan, offsetAt, targetOffset } = await import(
  "../apps/glyphslot/src/lib/slot"
);
type Plan = ReturnType<typeof makePlan>;

const device = DEFAULT_DEVICE;
const renderer = new SlotRenderer(device);

/**
 * Cadence de la boucle exportée.
 *
 * Le toy tourne au rafraîchissement de l'écran ; ici chaque image est un tableau
 * de 489 entiers dans un fichier que le sommaire télécharge. 25 par seconde
 * suffisent : à plein régime un rouleau file à 34 lignes par seconde, soit 1,4
 * ligne par image — le défilement est de toute façon lu comme un flou, et c'est
 * le freinage qu'on regarde.
 *
 * **25 et non 24, parce que le format compte en millisecondes entières.** La
 * durée d'une trame vaut `1000 / FPS` arrondi : à 24 elle tombe à 42 ms, soit
 * 23,81 images par seconde à la lecture — la cadence écrite ici n'était pas
 * celle qui sortait du fichier. À 25 le compte est rond, 40 ms exactement, et
 * les deux se rejoignent.
 */
const FPS = 25;

/**
 * Instants d'arrêt des trois rouleaux, resserrés pour la mini-prévisu.
 *
 * Le toy pose [2,6 ; 3,8 ; 4,9] : cinq secondes de rouleaux par tour, deux tours,
 * c'est une boucle de quinze secondes dans une tuile de sommaire. Resserré ici, à
 * une contrainte près — **aucun arrêt ne peut descendre sous 2,05 s**. La
 * décélération dure 1,3 s et le lancement à ressort se termine à 0,75 : freiner
 * avant que le rouleau ait rejoint sa trajectoire linéaire fait sauter la
 * position d'un coup (voir `offsetAt`). L'écart entre les trois est conservé —
 * c'est lui qui fait le suspense, les rouleaux ne se posent pas ensemble.
 */
const STOPS = [2.15, 2.75, 3.35];

/** Ce que le toy attend après le dernier rouleau avant de statuer. */
const SETTLE = 0.15;

/** Battement entre deux tours, disque au repos sur le tirage précédent. */
const ENTRE_TOURS = 0.9;

/**
 * Les deux tirages de la boucle, dans l'ordre.
 *
 * Indices dans `STRIP` = [seven, cherry, bar, diamond, bell]. Écrits en clair
 * plutôt que tirés par `draw()`, qui est aléatoire : ce fichier doit être le
 * même à chaque régénération, sinon on ne sait plus ce qu'on regarde.
 *
 * - perdant : trois symboles différents, et volontairement **lisibles** —
 *   cloche, bar, diamant ont chacun une silhouette franche à sept lignes.
 * - gagnant : trois cerises. Un gain simple, pas le jackpot.
 */
const TIRAGES: { syms: [number, number, number]; type: "lose" | "win" }[] = [
  { syms: [4, 2, 3], type: "lose" },
  { syms: [1, 1, 1], type: "win" },
];

/* -------------------------------------------------------------------------- */

/** Les LEDs du disque en consignes 0-255, dans l'ordre de lecture. */
function toP(values: Float32Array): number[] {
  return device.inside.map((i) => {
    const v = values[i];
    return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  });
}

const frames: { p: number[]; d: number }[] = [];
const MS = Math.round(1000 / FPS);

/** Ajoute une trame, ou allonge la précédente si rien n'a changé. */
function push(p: number[]): void {
  const last = frames[frames.length - 1];
  if (last && last.p.length === p.length && last.p.every((v, i) => v === p[i])) {
    last.d += MS;
    return;
  }
  frames.push({ p, d: MS });
}

/* Position de départ : le tirage perdant, pour que la boucle se referme sans
   raccord — la dernière image du tour gagnant enchaîne sur la première du tour
   perdant, et les rouleaux y sont là où le tour précédent les a laissés. */
let offsets = TIRAGES[TIRAGES.length - 1].syms.map((k, i) => targetOffset(i, k));

for (const { syms, type } of TIRAGES) {
  const plans: Plan[] = offsets.map((o, i) => makePlan(i, o, syms[i], STOPS[i]));

  /* Phase rouleaux. `SETTLE` compris : le toy laisse passer 0,15 s après le
     dernier arrêt avant d'annoncer, et ces six images de rouleaux immobiles
     sont ce qui fait lire l'arrêt comme un arrêt. */
  const spin = STOPS[2] + SETTLE;
  for (let f = 0; f * (1 / FPS) < spin; f++) {
    const t = f / FPS;
    push(toP(renderer.render(plans.map((p) => offsetAt(p, t)), null)));
  }

  /* Phase résultat. Les rouleaux sont recalés sur leur cible exacte — le toy
     fait pareil, l'arrondi du freinage pouvant laisser une fraction de ligne. */
  offsets = syms.map((k, i) => targetOffset(i, k));
  const dur = RESULT_DUR[type];
  for (let f = 0; f * (1 / FPS) < dur; f++) {
    const elapsed = f / FPS;
    push(toP(renderer.render(offsets, { type, elapsed, fx: null })));
  }

  /* Battement au repos : la machine ne repart pas dans la seconde, et sans lui
     on ne voit pas le résultat se poser. */
  for (let f = 0; f * (1 / FPS) < ENTRE_TOURS; f++) {
    push(toP(renderer.render(offsets, null)));
  }
}

/* La version de format identifie la matrice visée, pas une révision : 1 pour le
   Phone (3). Voir `design.ts` dans le kit. */
const design = { v: 1, frames };
const json = JSON.stringify(design);

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, json);

const total = frames.reduce((s, f) => s + f.d, 0);
console.log(
  `${path.relative(ROOT, OUT)} — ${frames.length} trames, ` +
    `${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko`,
);

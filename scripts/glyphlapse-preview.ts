/**
 * Fabrique la boucle de mini-prévisu de GlyphLapse, au format du Glyph Museum.
 *
 *     bun run scripts/glyphlapse-preview.ts
 *
 * **Elle est jouée, pas dessinée**, comme celles de GlyphSlot et de Sonoglyph :
 * `breakdown` fait la décomposition calendaire, `LapseRenderer` dessine, et le
 * script ne fait qu'avancer une horloge et changer de lapse au bon moment —
 * exactement ce que fait `+page.svelte` à l'écran.
 *
 * **Les trois lapses sont ceux de `defaultLapses`**, importés et non recopiés.
 * Ce sont donc les mêmes que ceux sur lesquels la préview interactive ouvre, et
 * il n'y a pas deux listes à tenir d'accord — changer un défaut et régénérer
 * suffit à changer la vignette.
 *
 *     I    fin d'année, Jours + sablier
 *     II   18 avril 2026 23 h, Cycle
 *     III  1ᵉʳ janvier 2000, Dense
 *
 * Le passage de l'un à l'autre emprunte le **glissement horizontal** du toy —
 * l'ancien sort par la gauche, le nouveau entre par la droite — parce que c'est
 * ce que fait l'appui long sur l'appareil. Une coupe franche aurait été plus
 * courte à écrire et aurait montré autre chose que le toy.
 *
 * ## Ce que cette boucle a de particulier : elle vieillit
 *
 * Les deux autres mini-prévisus sont hors du temps — une machine à sous et un
 * sonomètre montrent la même chose quel que soit le jour. Ici les nombres
 * affichés sont ceux de **l'instant où le fichier a été généré** : « J-144 »
 * restera J-144 pendant que la vraie échéance approche.
 *
 * Il n'y a pas de contournement possible dans un fichier de trames — un dessin
 * du Glyph Museum ne calcule rien, il rejoue des consignes de LED. La régénérer
 * fait partie de la mise en ligne, au même titre que la construction du site.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "static/preview/glyphlapse.json");

/* Même greffon que les deux autres générateurs : `$lib` est un alias résolu par
   SvelteKit, et le catalogue d'appareils importe des photos dont on n'a que
   faire ici. Posé avant le premier import du moteur. */
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

const { DEFAULT_DEVICE } = await import("../src/lib/index");
const { breakdown, defaultLapses } = await import("../src/routes/glyphlapse/lib/lapse");
const { LAPSE_SLIDE, LapseRenderer } = await import("../src/routes/glyphlapse/lib/render");

const device = DEFAULT_DEVICE;
const renderer = new LapseRenderer(device);

/** Même cadence que les deux autres — 40 ms rond, le format compte en entiers. */
const FPS = 25;

/** Secondes par lapse. La rotation, et le seul réglage de durée. */
const PAR_LAPSE = 10;

/**
 * Seconde de la minute à laquelle la boucle commence.
 *
 * Elle compte, et c'est le seul endroit de ces trois générateurs où l'heure de
 * départ est un réglage plutôt qu'un détail. Les secondes sont portées par
 * l'anneau et par le sablier, tous deux remplis à `secondes / 60` : partir à 0
 * ouvrirait sur un sablier vide et un anneau éteint, c'est-à-dire sur les deux
 * seuls instants de la minute où ces affichages ne montrent rien.
 *
 * À 20, le sablier ouvre au tiers plein et l'anneau des deux lapses suivants
 * passe de la moitié aux cinq sixièmes — les trois se voient sur toute la
 * boucle. Le saut de 30 s au raccord tombe sur un changement de lapse, où
 * l'écran est de toute façon balayé par le glissement.
 */
const SECONDE_DEPART = 20;

/* -------------------------------------------------------------------------- */

const lapses = defaultLapses().filter((l) => l.enabled);
if (lapses.length === 0) throw new Error("aucun lapse actif dans les défauts");

/* Instant de départ : maintenant, ramené sur `SECONDE_DEPART`. Les millisecondes
   sont mises à zéro — une horloge qui avance de 40 ms en 40 ms depuis un reste
   quelconque ferait tomber les changements de seconde entre deux trames, et le
   remplissage de l'anneau sauterait d'un cran de travers. */
const depart = new Date();
depart.setSeconds(SECONDE_DEPART, 0);
const DEPART_MS = depart.getTime();

const frames: { p: number[]; d: number }[] = [];
const MS = Math.round(1000 / FPS);
const IMAGES_PAR_LAPSE = PAR_LAPSE * FPS;

/** Les LEDs du disque en consignes 0-255, dans l'ordre de lecture. */
function toP(values: Float32Array): number[] {
  return device.inside.map((i) => {
    const v = values[i];
    return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  });
}

/** Ajoute une trame, ou allonge la précédente si rien n'a changé. */
function push(p: number[]): void {
  const last = frames[frames.length - 1];
  if (last && last.p.length === p.length && last.p.every((v, i) => v === p[i])) {
    last.d += MS;
    return;
  }
  frames.push({ p, d: MS });
}

/** Le rendu d'un lapse à l'instant `t` de l'animation, sans transition. */
function rendu(k: number, t: number): Float32Array {
  const l = lapses[k];
  return renderer.render(breakdown(l.ref, DEPART_MS + t * 1000), l.format, l.sec, t, null, null);
}

/* Le glissement du premier lapse vient du **dernier**, pas d'un écran noir :
   c'est ce qui referme la boucle. La dernière image de III sort par la gauche
   pendant que la première de I entre par la droite, comme entre II et III. */
let sortant = rendu(lapses.length - 1, 0).slice();

for (let k = 0; k < lapses.length; k++) {
  const l = lapses[k];
  const t0 = k * PAR_LAPSE;

  for (let f = 0; f < IMAGES_PAR_LAPSE; f++) {
    const t = t0 + f / FPS;
    const age = f / FPS;

    /* Glissement d'entrée, sur les 0,35 s du toy. `render` compose lui-même
       l'ancien et le nouveau : on lui passe la trame sortante et l'avancement,
       il fait le reste. */
    const slide = age < LAPSE_SLIDE ? { from: sortant, progress: age / LAPSE_SLIDE } : null;

    const values = renderer.render(
      breakdown(l.ref, DEPART_MS + t * 1000),
      l.format,
      l.sec,
      t,
      slide,
      null,
    );
    push(toP(values));

    /* La dernière image **sans** glissement du lapse courant : c'est elle qui
       sortira par la gauche au changement suivant. Prise à la fin de la boucle
       plutôt qu'après, pour ne pas rendre deux fois la même trame. */
    if (f === IMAGES_PAR_LAPSE - 1) sortant = rendu(k, t).slice();
  }
}

/* La version de format identifie la matrice visée, pas une révision : 1 pour le
   Phone (3). */
const design = { v: 1, frames };
const json = JSON.stringify(design);

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, json);

const total = frames.reduce((s, f) => s + f.d, 0);
console.log(
  `${path.relative(ROOT, OUT)} — ${frames.length} trames, ` +
    `${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko`,
);

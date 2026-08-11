/**
 * Fabrique la boucle de mini-prévisu de Just a dice, au format du Glyph Museum.
 *
 *     bun run scripts/justadice-preview.ts
 *
 * **Elle est jouée, pas dessinée.** Le script monte le vrai moteur du toy —
 * `dice.ts` pour la cinématique, `DiceRenderer` pour le tracé — et déroule trois
 * jets image par image, exactement comme le fait la page. Ce qui sort est donc ce
 * que fait le dé : le jour où le freinage change, il suffit de relancer ce script.
 *
 * Trois solides et trois jets, parce que le toy en a quatre et que l'appui long
 * est la moitié de ce qu'il sait faire. Le d10 est le sacrifié : il partage tout
 * avec le d12 — un nombre à deux chiffres sur une face non triangulaire — et une
 * vignette de sommaire n'a pas à être exhaustive, elle a à être lisible.
 *
 * Les trois **couvrent les trois façons dont le toy écrit un résultat**, ce qui
 * n'est pas un hasard mais le critère du choix :
 *
 * - le **d6** tombe sur 5, donc des pips — cinq carrés de 3 × 3 ;
 * - le **d12** tombe sur 9, un chiffre seul, donc la police dilatée ;
 * - le **d20** tombe sur 13, deux chiffres, donc la police fine.
 *
 * Chaque solide **entre sur sa plus haute face**, comme le fait l'appui long dans
 * le toy : c'est ce qui identifie la forme avant qu'elle culbute, et c'est aussi
 * pourquoi aucun jet ne retombe sur ce nombre-là. Un dé qui montre 20, culbute
 * trois secondes et remontre 20 se lit comme une animation qui n'a rien fait.
 *
 * Le raccord de boucle est franc — le d20 posé enchaîne sur le d6 posé — et c'est
 * exactement ce que fait un appui long : le solide change d'une image à l'autre.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "static/preview/justadice.json");

/* Même greffon que pour les autres boucles, et pour les mêmes deux raisons :
   `$lib` est un alias résolu par SvelteKit, et le catalogue d'appareils importe
   des photos de dos dont on n'a que faire ici. Posé avant le premier import du
   moteur, d'où les imports dynamiques plus bas. */
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
const { DiceRenderer } = await import("../src/routes/justadice/lib/render");
const { T_END, makeThrow, restQuat, restingView, viewAt } = await import(
  "../src/routes/justadice/lib/dice"
);
const { DICE } = await import("../src/routes/justadice/lib/solids");
type DieId = (typeof DICE)[number]["id"];

const device = DEFAULT_DEVICE;
const renderer = new DiceRenderer(device);

/**
 * Cadence de la boucle exportée.
 *
 * 25 par seconde, comme les autres boucles du portail, et pour la même raison de
 * format : la durée d'une trame est un entier de millisecondes, donc 40 ms tout
 * rond là où 24 images tomberaient à 42 et donneraient 23,8 à la lecture.
 *
 * C'est grossier pour une culbute — à 15 rad/s le dé tourne de 34° d'une image à
 * l'autre — et ça ne s'arrange pas en montant : à 60 images le fichier triple pour
 * une tuile de 141 pixels. La culbute se lit de toute façon comme un brouillage,
 * et ce qu'on regarde est la pose et le nombre.
 */
const FPS = 25;
const MS = Math.round(1000 / FPS);

/** Le temps que le nouveau solide reste posé avant d'être jeté. */
const ENTREE = 0.32;

/** Le temps que le résultat reste à l'écran après le gros plan. */
const LECTURE = 0.52;

/**
 * Les trois jets, dans l'ordre. Les valeurs sont **écrites** et non tirées : ce
 * fichier doit être le même à chaque régénération, sinon on ne sait plus si un
 * changement vient du code ou du hasard du jour.
 */
const JETS: { id: DieId; value: number }[] = [
  { id: "d6", value: 5 },
  { id: "d12", value: 9 },
  { id: "d20", value: 13 },
];

/**
 * Le hasard du jet, remplacé par une suite fixe — mêmes nombres que les trames de
 * référence du port. `makeThrow` en consomme 23 : trois par axe de culbute, sept
 * axes, plus le cran de la pose finale et l'angle d'excursion.
 *
 * Rejouée telle quelle pour les trois dés, ce qui donne trois culbutes de même
 * dessin sur trois solides différents. C'est voulu : ce que la vignette doit
 * montrer, c'est ce qui change d'un dé à l'autre, pas ce qui change d'un jet à
 * l'autre.
 */
const SCRIPT = [
  0.137, 0.921, 0.406, 0.688, 0.219, 0.577, 0.834, 0.312, 0.755, 0.041, 0.663, 0.498, 0.271,
  0.906, 0.152, 0.729, 0.385, 0.594, 0.847, 0.108, 0.462, 0.236, 0.981,
];

function scripted(): () => number {
  let i = 0;
  return () => {
    if (i >= SCRIPT.length) throw new Error(`suite épuisée à ${i}`);
    return SCRIPT[i++];
  };
}

/* -------------------------------------------------------------------------- */

/** Les LEDs du disque en consignes 0-255, dans l'ordre de lecture. */
function toP(values: Float32Array): number[] {
  return device.inside.map((i) => {
    const v = values[i];
    return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  });
}

const frames: { p: number[]; d: number }[] = [];

/** Ajoute une trame, ou allonge la précédente si rien n'a changé. */
function push(p: number[]): void {
  const last = frames[frames.length - 1];
  if (last && last.p.length === p.length && last.p.every((v, i) => v === p[i])) {
    last.d += MS;
    return;
  }
  frames.push({ p, d: MS });
}

/** Tient une image fixe pendant `secondes`. */
function hold(p: number[], secondes: number): void {
  for (let f = 0; f * (1 / FPS) < secondes; f++) push(p);
}

for (const { id, value } of JETS) {
  const die = DICE.find((d) => d.id === id);
  if (!die) throw new Error(`dé inconnu : ${id}`);
  if (value === die.faces) {
    throw new Error(`${id} entre sur ${die.faces} et y retombe : le jet ne se verrait pas`);
  }

  /* L'entrée du solide : sa plus haute face, à l'aplomb. C'est la pose de
     démarrage du toy et celle que laisse un appui long. */
  const pose = restQuat(die, die.faces, 0);
  hold(toP(renderer.render(die, restingView(die, pose))), ENTREE);

  const th = makeThrow(die, pose, value, scripted());
  for (let f = 0; f * (1 / FPS) < T_END; f++) {
    push(toP(renderer.render(die, viewAt(die, th, f / FPS))));
  }

  /* Le résultat, posé. La dernière image du jet est déjà la pose de repos — le
     gros plan s'y termine — donc ce palier ne fait que la prolonger. */
  hold(toP(renderer.render(die, restingView(die, th.qEnd))), LECTURE);
}

/* La version de format identifie la matrice visée, pas une révision : 1 pour le
   Phone (3). Voir `design.ts` dans le kit. */
const json = JSON.stringify({ v: 1, frames });

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, json);

const total = frames.reduce((s, f) => s + f.d, 0);
console.log(
  `${path.relative(ROOT, OUT)} — ${frames.length} trames, ` +
    `${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko\n` +
    JETS.map((j) => `  ${j.id} : ${DICE.find((d) => d.id === j.id)!.faces} → ${j.value}`).join(
      "\n",
    ),
);

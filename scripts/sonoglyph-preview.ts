/**
 * Fabrique la boucle de mini-prévisu de Sonoglyph, au format du Glyph Museum.
 *
 *     bun run scripts/sonoglyph-preview.ts
 *
 * **Elle est mesurée, pas dessinée.** Comme celle de GlyphSlot, elle monte le
 * vrai moteur du toy et le fait tourner hors navigateur : `SimSource` produit des
 * échantillons, `MeterEngine` en tire un niveau à travers la pondération A, le
 * détecteur Fast et le banc de bandes, et les deux renderers dessinent ce que le
 * moteur leur donne. Rien n'est injecté à mi-chemin.
 *
 * Ça compte particulièrement ici. Poser « l'aiguille est à 72 » et l'animer à la
 * main aurait donné une aiguille qui bouge joliment mais qui ne bouge pas comme
 * un sonomètre : la constante de temps du détecteur Fast — 125 ms — est ce qui
 * fait qu'une crête monte vite et retombe lentement, et c'est exactement ce
 * qu'on veut montrer. Ici elle est dans la boucle parce qu'elle est dans le
 * moteur.
 *
 * Le scénario : **quatre secondes de spectre, quatre secondes d'aiguille, quatre
 * secondes d'onde**, sur une seule et même prise de son. Le toy a trois modes
 * depuis qu'il a rejoint Haloglyph — Sonoglyph en faisait deux Glyph Toys — et
 * l'appui long les fait tourner l'un dans l'autre ; une mini-prévisu qui n'en
 * montrerait qu'un mentirait par omission. Les faire suivre la même source
 * plutôt que trois prises distinctes évite en plus l'effet catalogue : c'est le
 * même instant sonore vu de trois façons.
 *
 * Rejouée pour chaque appareil — voir `compact` dans `render.ts`, qui sait
 * déjà dessiner les trois modes sur treize colonnes. La graine du bruit rose
 * est remise à zéro avant chaque tour : les deux boucles montrent alors la
 * même prise, pas deux instants qui ont dérivé l'un de l'autre.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Même greffon que pour GlyphSlot, et pour les mêmes deux raisons : `$lib` est
   un alias résolu par SvelteKit, et le catalogue d'appareils importe des photos
   dont on n'a que faire ici. Posé avant le premier import du moteur. */
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

/**
 * Hasard rendu déterministe, **avant tout import du moteur**.
 *
 * Le bruit rose de `SimSource` tire sur `Math.random`, et son générateur est
 * construit à l'import. Sans cette substitution, deux régénérations donneraient
 * deux fichiers différents : impossible de dire si un changement de rendu vient
 * du code ou du tirage. Le remplaçant est un xorshift32 — n'importe quelle suite
 * fait l'affaire, elle n'a qu'à être la même à chaque fois.
 *
 * Ce n'est **pas** une simplification du signal : le bruit rose reste du bruit
 * rose, avec son spectre en 1/f et son caractère aléatoire. Seule la graine est
 * fixée.
 */
let graine = 0x9e3779b9;
/* Remise à zéro avant chaque appareil — voir l'en-tête du fichier — plutôt
   qu'une seule fois au chargement : les deux boucles doivent tirer la même
   suite, pas deux moitiés d'une suite deux fois plus longue. */
function semer(): void {
  graine = 0x9e3779b9;
}
Math.random = () => {
  graine ^= graine << 13;
  graine ^= graine >>> 17;
  graine ^= graine << 5;
  return ((graine >>> 0) % 0xffffff) / 0xffffff;
};

const { DEVICES } = await import("../src/lib/index");
const { MeterEngine, DEFAULT_K } = await import("../src/routes/sonoglyph/lib/engine");
const { FS, SimSource } = await import("../src/routes/sonoglyph/lib/source");
const { SonoRenderer } = await import("../src/routes/sonoglyph/lib/render");

/** Même cadence que GlyphSlot — 40 ms rond, le format compte en entiers. */
const FPS = 25;

/** Secondes par mode. Le sujet de la boucle, et le seul réglage de durée. */
const PAR_TOY = 4;

/** L'ordre de la rotation, celui du toy — voir `SonoMode.kt`. */
const MODES = ["spectre", "aiguille", "onde"] as const;

/**
 * Timbre de la prise. C'est celui que la préview ouvre par défaut.
 *
 * `music` a été essayé d'abord, pour sa pulsation à 2 Hz. Mauvaise idée côté
 * spectre : c'est du bruit rose large bande, et du bruit rose vu par un banc de
 * bandes réparties en octaves donne des bandes **toutes au même niveau** — un
 * mur de LEDs qui monte et descend d'un bloc, sans silhouette. Le relevé sur la
 * boucle générée le disait sans ambiguïté : 25 colonnes à ±1 LED les unes des
 * autres.
 *
 * La voix tient dans 200 Hz – 4 kHz. Elle laisse donc les deux bords du disque
 * éteints et dessine une bosse au milieu — c'est-à-dire une forme qu'on lit
 * comme un spectre. Sa modulation syllabique à 4,2 Hz donne en prime à
 * l'aiguille le tremblement d'un sonomètre braqué sur quelqu'un qui parle,
 * plutôt qu'une main qui balaie proprement.
 */
const TIMBRE = "voice" as const;

/**
 * Le niveau de la prise, en dB(A), au fil de la boucle.
 *
 * Écrit à la main plutôt que laissé plat : à niveau constant l'aiguille se pose
 * et ne bouge plus, et une mini-prévisu de sonomètre où l'aiguille ne bouge pas
 * ne dit rien. La courbe couvre 53 à 89 dB, soit du quart aux trois quarts du
 * cadran — 30 à 110 dB sur l'appareil — sans jamais taper les butées, où
 * l'aiguille se coince contre l'arc et où le chiffre cesse de changer.
 *
 * **Le centre est réglé par le spectre, pas par l'aiguille.** Les trois modes
 * partagent la prise, et le visualiseur sature bien avant que l'aiguille n'aille
 * en butée. 71 est le compromis retenu à l'œil : le spectre garde sa silhouette,
 * et l'aiguille ne perd qu'un vingtième de sa course par rapport à 74.
 *
 * **Un cycle entier par mode**, et non un sur la boucle entière : étalée sur les
 * douze secondes, la courbe ferait passer toute son excursion basse pendant un
 * seul tiers de la rotation, et les deux autres n'en verraient jamais le creux.
 * Chaque mode a donc la course complète, 53 à 89 dB.
 *
 * Périodique sur la boucle, valeur et pente : le raccord de fin est un
 * changement de mode, mais la mesure, elle, doit enchaîner sans marche.
 */
function niveau(t: number): number {
  const u = (2 * Math.PI * t) / PAR_TOY;
  return 71 + 13 * Math.sin(u) + 5 * Math.sin(3 * u + 1.1);
}

/* -------------------------------------------------------------------------- */

const MS = Math.round(1000 / FPS);
const BOUCLE = MODES.length * PAR_TOY;
const PAR_IMAGE = Math.round(FS / FPS);

/** Les LEDs du disque en consignes 0-255, dans l'ordre de lecture. */
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

/**
 * Deux tours, un seul gardé.
 *
 * Le premier chauffe le moteur : au départ les détecteurs sont à zéro, l'aiguille
 * est plaquée en butée basse et le spectre est éteint. Capturer là donnerait une
 * boucle qui commence morte et qui, arrivée à la fin, repartirait d'un état
 * qu'elle n'a plus. Le second tour part donc d'un moteur dans le même état que
 * celui où la boucle le laissera — la courbe de niveau étant périodique, le
 * raccord ne se voit pas.
 */
const TOURS = 2;
const IMAGES = Math.round(BOUCLE * FPS);

for (const device of DEVICES) {
  semer();
  const engine = new MeterEngine(FS, DEFAULT_K);
  const sim = new SimSource({ targetDb: niveau(0), timbre: TIMBRE, dynamics: 1, overdrive: false });
  const sono = new SonoRenderer(device);
  const block = new Float32Array(PAR_IMAGE);
  const { frames, push } = makeFrames();

  for (let tour = 0; tour < TOURS; tour++) {
    for (let f = 0; f < IMAGES; f++) {
      const local = f / FPS;
      const t = tour * BOUCLE + local;

      /* Source simulée : le toy pose lui-même l'état « ok », il n'y a pas de
         micro à attendre. Sans ça le moteur resterait en « pas de source » et
         les deux renderers dessineraient leur écran d'attente. */
      engine.status = "ok";
      sim.setParams({ targetDb: niveau(t), timbre: TIMBRE, dynamics: 1, overdrive: false });
      sim.fill(block, PAR_IMAGE, engine.calibrationK);
      engine.feed(block, PAR_IMAGE, t);

      const snap = engine.snapshot(t);

      /* Le spectre d'abord — c'est le premier de la rotation sur l'appareil,
         voir `SonoMode.kt` — puis l'aiguille, puis l'onde. Rendu dans les deux
         tours et pas seulement le second : `render` est aussi ce qui nourrit
         `bandFloor` et `waveform`, et les laisser froids au premier tour
         ferait repartir leur convergence à zéro pile pendant le tour qu'on
         garde. */
      const modeIndex = Math.min(MODES.length - 1, Math.floor(local / PAR_TOY));
      const values = sono.render(snap, MODES[modeIndex]);
      if (tour < TOURS - 1) continue;
      push(toP(device, values));
    }
  }

  /* La version de format identifie la matrice visée, pas une révision : 1
     pour le (3), 137 LEDs pour le (4a) Pro — voir `deviceForDesign`. */
  const design = { v: 1, frames };
  const json = JSON.stringify(design);
  const OUT = path.join(
    ROOT,
    "static/preview",
    device.id === "phone4apro" ? "sonoglyph4apro.json" : "sonoglyph.json",
  );

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, json);

  const total = frames.reduce((s, f) => s + f.d, 0);
  console.log(
    `${path.relative(ROOT, OUT)} — ${frames.length} trames, ` +
      `${(total / 1000).toFixed(2)} s, ${(json.length / 1024).toFixed(0)} Ko`,
  );
}

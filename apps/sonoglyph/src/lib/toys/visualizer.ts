/** Toy 1 — visualiseur. Port de `render/VisualizerRenderer.kt`. */

import { F3, Grid, discMap, type Device } from "@glyph/kit";
import { MAX_DB, MIN_DB, type Snapshot } from "../engine";

export type Style = "mirror" | "bars";

export const STYLES: { v: Style; t: string }[] = [
  { v: "mirror", t: "Miroir" },
  { v: "bars", t: "Colonnes" },
];

/**
 * Plage d'une bande : celle du cadran, décalée vers le bas.
 *
 * Le décalage n'est pas un réglage au jugé. Une énergie répartie sur 25 bandes
 * en laisse 10·log10(25) ≈ 14 dB de moins à chacune, si bien qu'un signal qui
 * met l'aiguille en butée ne monterait qu'aux trois quarts du visualiseur avec
 * la plage du cadran. Les deux toys couvrent donc la même scène sonore.
 */
const SPREAD = 14;
const BAND_MIN = MIN_DB - SPREAD;
const BAND_MAX = MAX_DB - SPREAD;

/**
 * Hauteur pleine, **commune à toutes les colonnes**, et non la demi-hauteur du
 * disque à cette colonne. Mettre chaque colonne à son échelle donnait un dôme :
 * un spectre plat s'affichait bombé, et deux colonnes de même niveau n'avaient
 * pas la même hauteur. Ici le disque rogne les colonnes du bord, ce qui est la
 * bonne perte : on lit un spectre, pas une silhouette.
 */
const SPAN = (d: Device) => d.radius;

/** Secondes par tour de la comète d'attente. */
const IDLE_TURN = 3;

const level = (db: number): number =>
  Math.min(1, Math.max(0, (db - BAND_MIN) / (BAND_MAX - BAND_MIN)));

const band = (x: number, n: number, size: number): number =>
  Math.min(n - 1, Math.max(0, Math.floor((x * n) / size)));

/**
 * Toy 1 — visualiseur de spectre. Aucun texte : c'est le seul des deux toys
 * qu'on regarde sans le lire.
 *
 * **Tout est en tout ou rien.** Une LED de la matrice est allumée ou éteinte,
 * jamais entre les deux — les dégradés le long des barres lissaient le spectre
 * en une masse grise, et le dégradé n'ajoutait rien que la hauteur ne disait
 * déjà. La seule information portée par un pixel est sa présence.
 *
 * Il n'y a **pas de marqueur de crête**. Chaque bande en portait un, tenu
 * 0,45 s puis retombant : vingt-cinq points qui restent en l'air derrière des
 * barres qui, elles, bougent au rythme du son. Ça donnait une seconde image,
 * décalée dans le temps, superposée à celle qu'on regarde.
 *
 * Deux styles. Ils affichent le même **niveau** des bandes et ne diffèrent que
 * par la façon de le poser sur un disque.
 */
export class VisualizerRenderer {
  private readonly grid: Grid;
  private readonly disc: ReturnType<typeof discMap>;
  private readonly SIZE: number;
  private readonly CY: number;
  private readonly SPAN: number;

  /* Même remarque que pour le VU-metre : la geometrie vient du profil, pas d'un
     module global. */
  constructor(device: Device) {
    this.grid = new Grid(device);
    this.disc = discMap(device);
    this.SIZE = device.size;
    this.CY = device.cy;
    this.SPAN = SPAN(device);
  }

  render(snap: Snapshot, style: Style): Float32Array {
    this.grid.clear();
    if (snap.status !== "ok") {
      this.idle(snap);
      return this.grid.g;
    }
    if (style === "mirror") this.mirror(snap);
    else this.bars(snap);
    if (snap.overload) for (const i of this.disc.ring) this.grid.g[i] = 1;
    return this.grid.g;
  }

  private mirror(snap: Snapshot): void {
    const g = this.grid;
    for (let x = 0; x < this.SIZE; x++) {
      if (this.disc.halfWidth(x) <= 0) continue;
      const h = Math.round(level(snap.bands[band(x, snap.bands.length, this.SIZE)]) * this.SPAN);
      // L'axe médian traverse le disque en permanence : c'est la ligne de base
      // du spectre, et à bas niveau c'est la seule chose allumée — sans elle le
      // toy s'éteint dans le silence.
      g.set(x, this.CY, 1);
      for (let d = 1; d <= h; d++) {
        g.set(x, this.CY - d, 1);
        g.set(x, this.CY + d, 1);
      }
    }
  }

  private bars(snap: Snapshot): void {
    const g = this.grid;
    for (let x = 0; x < this.SIZE; x++) {
      const half = this.disc.halfWidth(x);
      if (half <= 0) continue;
      // le pied de la barre suit le bord du disque, sa hauteur non : c'est ce
      // qui garde les colonnes comparables tout en laissant l'assise ronde
      const bottom = this.CY + Math.floor(half);
      const h = Math.round(level(snap.bands[band(x, snap.bands.length, this.SIZE)]) * 2 * this.SPAN);
      for (let d = 0; d < h; d++) g.set(x, bottom - d, 1);
    }
  }

  /**
   * Pas de mesure : une comète qui fait le tour de l'anneau, pour ne pas mourir
   * noir. C'était un souffle — l'anneau entier respirant entre 10 et 20 % —
   * mais un anneau à 15 % n'est pas un anneau faible sur une matrice de 25 LEDs,
   * c'est un anneau flou. Un sixième d'anneau à plein qui tourne dit la même
   * chose en tout ou rien, et se lit de loin.
   */
  private idle(snap: Snapshot): void {
    const n = this.disc.ring.length;
    const head = Math.floor((snap.t / IDLE_TURN) * n);
    for (let k = 0; k < n / 6; k++) {
      this.grid.g[this.disc.ring[(((head + k) % n) + n) % n]] = 1;
    }
    this.grid.centeredText(F3, snap.status === "muted" ? "---" : "MIC", 10, 1);
  }
}




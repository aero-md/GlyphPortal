/** Toy 2 — VU-mètre à aiguille. Port de `render/NeedleRenderer.kt`. */

import { F5, Grid, discMap, type Device } from "@glyph/kit";
import { position, type Snapshot } from "../engine";

/** Demi-balayage : 90°, soit le demi-disque supérieur en entier. */
const SWEEP = (90 * Math.PI) / 180;

/** L'aiguille s'arrête sous les graduations, pas dessus. */
const R_NEEDLE = 9.5;

/** Ligne du haut du chiffre. Sept lignes de police, jusqu'à la 21. */
const VALUE_Y = 15;

/** Graduations majeures, en dB(A) — 30 / 50 / 70 / 90 / 110. */
export const TICKS = [30, 50, 70, 90, 110];

/**
 * **L'aiguille tourne autour du centre du disque et le cadran occupe la moitié
 * haute, en entier.** Le pivot avait été descendu sous le centre pour gagner du
 * rayon ; ça marchait, mais ça produisait un instrument décentré dans un hublot
 * rond, et le cadran restait à un rayon constant, donc en retrait du bord
 * partout sauf à ses extrémités.
 *
 * Le cadran **est** le contour du disque, restreint aux angles du balayage — de
 * − 90° à + 90°. Il part de (0, 12), passe par (12, 0) et revient à (24, 12) :
 * le demi-disque supérieur exactement, sans un pixel de marge. La moitié basse
 * revient au chiffre, ce qui lui rend la police 5×7.
 *
 * Le gris est employé, mais jamais pour porter une valeur : le cadran et le cœur
 * de l'aiguille sont pleins, seules l'épaule des obliques et le moyeu sont en
 * demi-teinte.
 */
export class NeedleRenderer {
  private readonly grid: Grid;
  private readonly disc: ReturnType<typeof discMap>;
  private readonly CX: number;
  private readonly CY: number;

  /* La géométrie vient du profil et n'est plus lue dans un module global : c'est
     ce qui permet au même renderer de tourner sur les deux matrices. Sur
     13 × 13 le résultat est illisible — d'où le seul appareil proposé côté
     interface — mais c'est un choix de l'app, pas une limite du renderer. */
  constructor(device: Device) {
    this.grid = new Grid(device);
    this.disc = discMap(device);
    this.CX = device.cx;
    this.CY = device.cy;
  }

  render(snap: Snapshot): Float32Array {
    const g = this.grid;
    g.clear();

    this.arc();
    this.ticks();

    if (snap.status === "ok") {
      this.needle(position(snap.laf));
      this.hub();
      this.value(snap.laf);
    } else {
      this.needle(0);
      this.hub();
      g.centeredText(F5, snap.status === "muted" ? "---" : "MIC", VALUE_Y, 1);
    }
    return g.g;
  }

  /** Angle d'une position 0..1 sur l'échelle, 0 rad = verticale. */
  private angle(p: number): number {
    return -SWEEP + 2 * SWEEP * Math.min(1, Math.max(0, p));
  }

  private px(r: number, a: number): number {
    return this.CX + r * Math.sin(a);
  }

  private py(r: number, a: number): number {
    return this.CY - r * Math.cos(a);
  }

  /**
   * Le cadran : les cellules du contour du disque dont l'angle tombe dans le
   * balayage. Pas un arc tracé au rayon — l'arc **est** la découpe, donc il
   * l'épouse marche par marche, sans décrocher dans les diagonales.
   */
  private arc(): void {
    for (const i of this.disc.edge) {
      if (Math.abs(this.disc.angleOf(i)) <= SWEEP) this.grid.g[i] = 1;
    }
  }

  /**
   * Cinq graduations majeures, rentrantes depuis l'arc — celui-ci est sur la
   * découpe, une graduation sortante n'aurait nulle part où aller. Celle de
   * 70 dB est la plus longue : c'est le repère qu'on cherche d'un coup d'œil.
   */
  private ticks(): void {
    for (let k = 0; k <= 4; k++) {
      const a = this.angle(k / 4);
      const r0 = this.disc.edgeDist(a);
      const len = k === 2 ? 4 : 2.5;
      const n = Math.max(1, Math.round(len * 4));
      for (let s = 0; s <= n; s++) {
        const r = r0 - (len * s) / n;
        this.grid.set(this.px(r, a), this.py(r, a), 1);
      }
    }
  }

  /**
   * L'aiguille, du moyeu à `R_NEEDLE`. Une seule : il y en a eu une seconde, en
   * demi-teinte, pour la crête — deux mains sur un cadran de 25 pixels se lisent
   * moins comme un instrument que comme une hésitation.
   *
   * C'est le seul endroit du toy où la nuance sert vraiment : une oblique posée
   * au pixel sur 25 LEDs de côté monte en escalier, et l'escalier se voit plus
   * que l'aiguille. Ici le dégradé ne code rien, il rattrape la grille.
   */
  private needle(p: number): void {
    const a = this.angle(p);
    this.grid.line(this.CX, this.CY, this.px(R_NEEDLE, a), this.py(R_NEEDLE, a), 1);
  }

  /** Moyeu en croix : l'aiguille a besoin d'un axe visible à tout angle. */
  private hub(): void {
    this.grid.set(this.CX, this.CY, 1);
    this.grid.set(this.CX - 1, this.CY, 0.5);
    this.grid.set(this.CX + 1, this.CY, 0.5);
    this.grid.set(this.CX, this.CY - 1, 0.5);
    this.grid.set(this.CX, this.CY + 1, 0.5);
  }

  /** Le niveau, arrondi à l'entier : à ± 5 dB de calibration, la décimale ment. */
  private value(db: number): void {
    const v = Math.min(199, Math.max(0, Math.round(db)));
    this.grid.centeredText(F5, String(v), VALUE_Y, 1);
  }
}

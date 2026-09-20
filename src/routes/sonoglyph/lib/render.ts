/**
 * Les trois modes de Sono sur un seul disque — port de `render/SonoRenderer.kt`
 * (Haloglyph).
 *
 * Une seule mesure, regardée sous trois angles, et c'est pour ça qu'ils vivent
 * dans une seule classe plutôt que trois renderers indépendants : l'aiguille,
 * le spectre et l'onde partagent une histoire (`bandFloor`, `waveform`) qu'il
 * faut nourrir **quel que soit le mode affiché**. Une aiguille rendue par une
 * classe à part, comme le portait l'ancien Sonoglyph, arrêtait cette histoire
 * dès qu'on la regardait — arriver ensuite sur le spectre ou l'onde faisait
 * clignoter l'écran le temps qu'elles rattrapent leur retard.
 *
 * - l'**aiguille** affiche un niveau absolu, en dB(A) ;
 * - le **spectre** affiche un écart au fond de la scène (`NoiseFloor`) ;
 * - l'**onde** affiche une amplitude rapportée au plus fort du moment (`WaveScale`).
 *
 * Les trois sont en tout ou rien : une LED est allumée ou éteinte. Le style
 * « colonnes » de l'ancien Sonoglyph ne survit pas au passage à trois modes —
 * l'appui long a mieux à faire que proposer deux fois le même spectre.
 */
import { F3, F3D, F5, Grid, discMap, type Device } from "$lib";
import { PEAK_SLICE_SECONDS, position, type Snapshot } from "./engine";
import { NoiseFloor } from "./noiseFloor";
import { Waveform } from "./waveform";
import { WaveScale } from "./waveScale";

export type SonoToy = "spectre" | "aiguille" | "onde";

/** Demi-balayage du cadran : 90°, soit le demi-disque supérieur en entier. */
const SWEEP = (90 * Math.PI) / 180;
/** L'aiguille s'arrête sous les graduations, pas dessus. */
const R_NEEDLE = 9.5;
/** Ligne du haut du chiffre. Sept lignes de police, jusqu'à la 21. */
const VALUE_Y = 15;
/** Graduations majeures, en dB(A) — 30 / 50 / 70 / 90 / 110. */
export const TICKS = [30, 50, 70, 90, 110];

/**
 * Le croissant `compact` — voir `dome()`. Centre du cercle intérieur décalé
 * sous le centre de la matrice, rayon fixe : la forme au niveau plein est
 * donc bornée une fois pour toutes, jamais un disque complet. C'est le
 * « rognage » voulu, pas un défaut à corriger — et le pivot de l'aiguille
 * imaginaire qui balaie le croissant.
 */
const CRESCENT_CY_OFFSET = 1.25;
const CRESCENT_INNER_R = 4.6;

/** Pas de temps maximal pris en compte pour le suivi du plancher. */
const MAX_DT = 0.25;
/** Secondes par tour de la comète d'attente. */
const IDLE_TURN = 3;

export class SonoRenderer {
  private readonly grid: Grid;
  private readonly disc: ReturnType<typeof discMap>;
  private readonly SIZE: number;
  private readonly CX: number;
  private readonly CY: number;
  private readonly SPAN: number;
  /**
   * (4a) Pro et ses 13 colonnes : ni les graduations ni une aiguille fine n'y
   * restent lisibles (voir `draw.ts`). L'aiguille y devient un dôme plein —
   * voir `dome()` — et le chiffre passe de trois colonnes (F5) à deux (F3).
   */
  private readonly compact: boolean;
  /**
   * Les cellules du croissant `compact` — indices row-major — voir `dome()`.
   * Fixe : c'est la forme, jamais ce qui est allumé dedans. Vide sur un
   * appareil non `compact`.
   */
  private readonly crescentCells: Int32Array;
  /**
   * L'angle de chaque cellule de `crescentCells` (même index), vu depuis le
   * pivot de l'aiguille imaginaire — le centre du cercle intérieur qui
   * découpe le croissant, pas le centre de la matrice. `dome()` compare cet
   * angle à celui de l'aiguille : à gauche d'elle, allumé : à droite, masqué.
   */
  private readonly crescentAngle: Float64Array;

  /** Le fond de la scène, une bande à la fois — décide de ce qui s'allume dans le spectre. */
  private readonly bandFloor: NoiseFloor;

  /** L'enveloppe récente, remplie à chaque image quel que soit le mode affiché. */
  readonly waveform: Waveform;

  /** L'échelle de l'onde, qui n'est pas celle du spectre — voir `WaveScale`. */
  private readonly waveScale = new WaveScale();

  private lastT = NaN;

  constructor(device: Device) {
    this.grid = new Grid(device);
    this.disc = discMap(device);
    this.SIZE = device.size;
    this.CX = device.cx;
    this.CY = device.cy;
    this.SPAN = device.radius;
    this.bandFloor = new NoiseFloor(25);
    this.waveform = new Waveform(device.size, PEAK_SLICE_SECONDS);
    this.compact = device.id === "phone4apro";
    const icy = this.CY + CRESCENT_CY_OFFSET;
    const cells = Array.from(this.disc.geo.inside).filter((i) => {
      const x = i % this.SIZE;
      const y = Math.floor(i / this.SIZE);
      if (y >= this.CY) return false;
      return Math.hypot(x - this.CX, y - icy) >= CRESCENT_INNER_R;
    });
    this.crescentCells = Int32Array.from(cells);
    this.crescentAngle = Float64Array.from(cells, (i) => {
      const x = i % this.SIZE;
      const y = Math.floor(i / this.SIZE);
      return Math.atan2(x - this.CX, -(y - icy));
    });
  }

  clearHistory(): void {
    this.waveform.clear();
    this.bandFloor.clear();
    this.waveScale.clear();
    this.lastT = NaN;
  }

  render(snap: Snapshot, toy: SonoToy): Float32Array {
    if (snap.status === "ok") this.feed(snap);
    this.grid.clear();
    if (snap.status !== "ok") {
      this.idle(snap, toy);
      return this.grid.g;
    }
    if (toy === "spectre") this.renderSpectrum(snap);
    else if (toy === "onde") this.renderWave();
    else this.renderNeedle(snap);
    /* Le halo sur tout l'anneau est le signal de surcharge du (3). Sur le
       dôme `compact`, la surcharge a son propre signal — voir `renderNeedle`
       — et l'anneau entier par-dessus le brouillerait plus qu'il n'aiderait. */
    if (snap.overload && !(this.compact && toy === "aiguille")) {
      for (const i of this.disc.ring) this.grid.g[i] = 1;
    }
    return this.grid.g;
  }

  /** Nourrit l'histoire sans rien dessiner — appelée à chaque image, quel que soit le mode affiché. */
  private feed(snap: Snapshot): void {
    const dt = Number.isNaN(this.lastT) ? 0 : Math.min(MAX_DT, Math.max(0, snap.t - this.lastT));
    this.lastT = snap.t;
    const n = Math.min(this.SIZE, snap.bands.length);
    for (let k = 0; k < n; k++) this.bandFloor.update(k, snap.bands[k], dt);
    this.pushWave(snap, dt);
  }

  /** Verse dans l'onde les crêtes de l'instantané — une colonne par tranche. */
  private pushWave(snap: Snapshot, dt: number): void {
    if (snap.lpeakCount <= 0) {
      this.waveScale.decay(dt);
      this.waveScale.update(snap.lpeak, dt);
      this.waveform.push(this.waveScale.amplitude(snap.lpeak), snap.t);
      return;
    }
    const slice = PEAK_SLICE_SECONDS;
    for (let j = 0; j < snap.lpeakCount; j++) {
      const db = snap.lpeaks[j];
      this.waveScale.decay(slice);
      this.waveScale.update(db, slice);
      this.waveform.push(this.waveScale.amplitude(db), snap.t - (snap.lpeakCount - 1 - j) * slice);
    }
  }

  // ---------- mode 1 : le spectre ----------

  /** Barres symétriques, chaque colonne rapportée au fond de sa propre bande. */
  private renderSpectrum(snap: Snapshot): void {
    const g = this.grid;
    for (let x = 0; x < this.SIZE; x++) {
      if (this.disc.halfWidth(x) <= 0) continue;
      const k = bandOf(x, Math.min(this.SIZE, snap.bands.length), this.SIZE);
      const h = Math.round(this.bandFloor.position(k, snap.bands[k]) * this.SPAN);
      g.set(x, this.CY, 1);
      for (let d = 1; d <= h; d++) {
        g.set(x, this.CY - d, 1);
        g.set(x, this.CY + d, 1);
      }
    }
  }

  // ---------- mode 2 : l'aiguille ----------

  private renderNeedle(snap: Snapshot): void {
    if (this.compact) {
      if (snap.overload) {
        this.dome(1);
        this.grid.centeredText(F3D, "99+", this.CY, 1);
      } else {
        this.dome(position(snap.laf));
        this.grid.centeredText(F3D, this.valueText(snap.laf), this.CY, 1);
      }
      return;
    }
    this.arc();
    this.ticks();
    this.needle(position(snap.laf));
    this.hub();
    this.grid.centeredText(F5, String(Math.min(199, Math.max(0, Math.round(snap.laf)))), VALUE_Y, 1);
  }

  /** Deux chiffres tiennent sur treize colonnes, pas trois — voir `compact`. */
  private valueText(db: number): string {
    return String(Math.min(99, Math.max(0, Math.round(db)))).padStart(2, "0");
  }

  private angle(p: number): number {
    return -SWEEP + 2 * SWEEP * Math.min(1, Math.max(0, p));
  }

  private px(r: number, a: number): number {
    return this.CX + r * Math.sin(a);
  }

  private py(r: number, a: number): number {
    return this.CY - r * Math.cos(a);
  }

  /** Le cadran : les cellules du contour dont l'angle tombe dans le balayage. */
  private arc(): void {
    for (const i of this.disc.edge) {
      if (Math.abs(this.disc.angleOf(i)) <= SWEEP) this.grid.g[i] = 1;
    }
  }

  /** Cinq graduations majeures, rentrantes depuis l'arc. */
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

  /** L'aiguille, du moyeu à `R_NEEDLE`. */
  private needle(p: number): void {
    const a = this.angle(p);
    this.grid.line(this.CX, this.CY, this.px(R_NEEDLE, a), this.py(R_NEEDLE, a), 1);
  }

  /**
   * Le croissant `compact` : une aiguille imaginaire, pivotée au centre du
   * cercle intérieur qui découpe le croissant (pas celui de la matrice),
   * balaie de -`SWEEP` à +`SWEEP` comme celle du (3) — voir `angle()`. Une
   * cellule du croissant s'allume si elle est à gauche de l'aiguille
   * (angle inférieur), masquée sinon. La forme du croissant ne bouge jamais,
   * seule la frontière gauche/droite se déplace.
   */
  private dome(p: number): void {
    const needle = this.angle(p);
    for (let k = 0; k < this.crescentCells.length; k++) {
      if (this.crescentAngle[k] <= needle) this.grid.g[this.crescentCells[k]] = 1;
    }
  }

  /** Moyeu en croix : l'aiguille a besoin d'un axe visible à tout angle. */
  private hub(): void {
    this.grid.set(this.CX, this.CY, 1);
    this.grid.set(this.CX - 1, this.CY, 0.5);
    this.grid.set(this.CX + 1, this.CY, 0.5);
    this.grid.set(this.CX, this.CY - 1, 0.5);
    this.grid.set(this.CX, this.CY + 1, 0.5);
  }

  // ---------- mode 3 : l'onde ----------

  /**
   * La forme d'onde qui défile de droite à gauche : même dessin que le
   * spectre, mais l'abscisse est le temps. La colonne de droite est l'instant
   * présent ; en remontant vers la gauche on remonte le temps.
   */
  private renderWave(): void {
    const g = this.grid;
    for (let x = 0; x < this.SIZE; x++) {
      if (this.disc.halfWidth(x) <= 0) continue;
      g.set(x, this.CY, 1);
      const level = this.waveform.at(this.SIZE - 1 - x);
      if (level <= Waveform.EMPTY) continue;
      const h = Math.round(level * this.SPAN);
      for (let d = 1; d <= h; d++) {
        g.set(x, this.CY - d, 1);
        g.set(x, this.CY + d, 1);
      }
    }
  }

  // ---------- pas de mesure ----------

  /**
   * Micro absent ou coupé. L'aiguille garde son cadran — un instrument sans
   * mesure reste un instrument. Les deux autres modes reçoivent une comète
   * qui fait le tour de l'anneau, pour ne pas mourir noirs.
   */
  private idle(snap: Snapshot, toy: SonoToy): void {
    const label = snap.status === "muted" ? "---" : "MIC";
    if (toy === "aiguille") {
      if (this.compact) {
        this.dome(0);
        this.grid.centeredText(F3, label, this.CY, 1);
        return;
      }
      this.arc();
      this.ticks();
      this.needle(0);
      this.hub();
      this.grid.centeredText(F5, label, VALUE_Y, 1);
      return;
    }
    const n = this.disc.ring.length;
    const head = Math.floor((snap.t / IDLE_TURN) * n);
    for (let k = 0; k < n / 6; k++) {
      this.grid.g[this.disc.ring[(((head + k) % n) + n) % n]] = 1;
    }
    this.grid.centeredText(F3, label, this.CY, 1);
  }
}

/** Colonne → bande : la matrice a `size` colonnes et le banc `n` bandes. */
function bandOf(x: number, n: number, size: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor((x * n) / size)));
}

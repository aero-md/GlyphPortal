/**
 * Port de `PlumbRenderer.kt` (Haloglyph) — niveau logarithmique et boussole à
 * quatre lettres.
 *
 * Comme dans le kit du portail, `fromBack` vaut toujours vrai : la préview
 * regarde la matrice par-derrière, jamais le hublot d'écran d'accueil. Seule
 * l'abscisse est niée ; la rose ne se retourne pas — voir l'en-tête Kotlin.
 */

import { Grid, R3, discMap, type Device } from "$lib";
import { Heading, PlumbScale, type PlumbMode, type PlumbRange, type PlumbReading } from "./engine";

const BUBBLE = ["01110", "11111", "11111", "11111", "01110"];
const BUBBLE_HALF = 2;

/**
 * Port compact (4a) Pro — voir `bubble()`. Le losange plein du (3) est bien
 * trop gros pour treize colonnes : la bulle y est une simple croix pleine,
 * dessin tiré des relevés « bulle au centre / en haut à droite / en bas à
 * gauche » (2026-09-20). Le repère qu'elle recouvre en passant dessus n'est
 * pas un second dessin — c'est `ring()`, inchangé : sa couronne à
 * `TARGET_FRACTION` du rayon tombe déjà pile sur ce même losange à treize
 * colonnes.
 */
const COMPACT_BUBBLE = ["010", "111", "010"];
const COMPACT_BUBBLE_HALF = 1;
/** Luminosité du repère `ring()` sur (4a) Pro : 114/255 dans les relevés, pas `AIM`. */
const COMPACT_RING = 114 / 255;

const RING_HALF = 0.55;
const TUNNEL_HALF = 3;
const AIM = 0.24;
const WALL = 0.1;
const LOCK = 1;

const LETTER_RADIUS = 10.4;
const LETTER_GIVE = 3;
const LETTER_STEP = 0.1;

const DEG = Math.PI / 180;

/** Chaque lettre est dessinée pour sa place au cerne — voir PlumbRenderer.kt. */
type Point = { bearing: number; glyph: string[]; dx: number; dy: number };
const POINTS: Point[] = [
  { bearing: 0, glyph: ["110", "101", "101", "101"], dx: -1, dy: -2 },
  { bearing: 90, glyph: ["0110", "1001", "1111", "1000", "0110"], dx: -1, dy: -2 },
  { bearing: 180, glyph: ["011", "100", "111", "001", "110"], dx: -1, dy: -2 },
  { bearing: 270, glyph: ["10001", "10101", "10101", "01010"], dx: -2, dy: -1 },
];

const NEEDLE = [
  "00100",
  "01010",
  "10001",
  "00100",
  "00100",
  "00100",
  "00100",
  "00100",
  "00100",
];
const NO_FIX = 0.45;
const FULL = 1;

/**
 * Répères de cap sur (4a) Pro — voir `compassMarks()`. Un point par cardinal
 * sauf le nord, qui porte un losange (croix 3×3 vide au centre) : rayon un
 * cran plus court pour que ses quatre sommets restent dans le disque, son
 * sommet extérieur tombant alors pile sur le même bord que les points des
 * trois autres cardinaux. Dessin tiré des relevés N/E/S/W (2026-09-20) ; le
 * repère qui devrait se trouver au bas de l'écran (cardinal opposé au cap en
 * cours) manquait dans deux des cinq relevés — l'utilisateur a confirmé que
 * le placement des repères n'était pas fiable dans ces fichiers, seules les
 * lettres au centre le sont, donc les quatre repères sont dessinés à chaque
 * image, sans exception pour ce cas.
 */
const TICK_RADIUS = 6;
const NORTH_MARK_RADIUS = 5;

const MAJOR_LABEL: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
const MINOR_LABEL: Record<number, string> = { 0: "NE", 90: "SE", 180: "SW", 270: "NW" };
const MAJOR_TOLERANCE = 15;

/**
 * La lettre affichée au centre de la boussole compacte : le cardinal majeur
 * si le cap en est à 15° ou moins, sinon le mineur de l'octant où il tombe —
 * voir le message utilisateur du 2026-09-20.
 */
function cardinalLabel(heading: number): string {
  const h = Heading.normalize(heading);
  const nearestMajor = (Math.round(h / 90) * 90) % 360;
  if (Math.abs(Heading.delta(nearestMajor, h)) <= MAJOR_TOLERANCE) return MAJOR_LABEL[nearestMajor];
  return MINOR_LABEL[Math.floor(h / 90) * 90];
}

export class PlumbRenderer {
  private readonly grid: Grid;
  private readonly cx: number;
  private readonly cy: number;
  private readonly usableRadius: number;
  private readonly rim: Int32Array;
  private readonly dist: Float64Array;
  private readonly gate: number;
  /** Port compact (4a) Pro — voir `bubble()` et `renderCompass()`. */
  private readonly compact: boolean;

  constructor(private readonly device: Device) {
    this.grid = new Grid(device);
    this.cx = device.cx;
    this.cy = device.cy;
    this.usableRadius = device.maxDist;
    const disc = discMap(device);
    this.rim = disc.ring;
    this.dist = disc.dist;
    this.compact = device.id === "phone4apro";
    this.gate = (this.compact ? COMPACT_BUBBLE_HALF : BUBBLE_HALF) + 1;
  }

  renderLevel(reading: PlumbReading, range: PlumbRange): Float32Array {
    this.grid.clear();
    if (!reading.hasTilt) {
      this.ring();
      return this.grid.g;
    }

    const r = PlumbScale.radiusOf(reading.tiltDegrees, range.degrees, this.usableRadius);
    if (reading.vertical) this.tunnel(reading.alongX);
    else this.ring();

    this.bubble(
      Math.round(this.cx + -1 * reading.dirX * r),
      Math.round(this.cy - reading.dirY * r),
    );

    if (reading.level) this.paint(this.rim, LOCK);
    return this.grid.g;
  }

  renderCompass(reading: PlumbReading): Float32Array {
    this.grid.clear();
    if (this.compact) {
      /* Pas d'équivalent capté du `NO_FIX` du (3) : aucun relevé ne montre
         cet état sur treize colonnes, et une aiguille sans cap n'a ici plus
         d'aiguille sur quoi retomber — l'écran reste donc vide plutôt que
         d'inventer un rendu. */
      if (reading.hasHeading) {
        this.compassMarks(reading.heading);
        this.grid.centeredText(R3, cardinalLabel(reading.heading), this.cy - 1, 1);
      }
      return this.grid.g;
    }
    if (!reading.hasHeading) {
      this.needle(NO_FIX);
      return this.grid.g;
    }
    this.rose(reading.heading, FULL);
    this.needle(FULL);
    return this.grid.g;
  }

  render(reading: PlumbReading, mode: PlumbMode, range: PlumbRange): Float32Array {
    return mode === "niveau" ? this.renderLevel(reading, range) : this.renderCompass(reading);
  }

  private tunnel(alongX: boolean): void {
    const size = this.device.size;
    for (let k = 0; k < size; k++) {
      if (alongX) {
        this.grid.set(k, this.cy - TUNNEL_HALF, WALL);
        this.grid.set(k, this.cy + TUNNEL_HALF, WALL);
      } else {
        this.grid.set(this.cx - TUNNEL_HALF, k, WALL);
        this.grid.set(this.cx + TUNNEL_HALF, k, WALL);
      }
    }
    for (let t = -TUNNEL_HALF; t <= TUNNEL_HALF; t++) {
      if (alongX) {
        this.grid.set(this.cx - this.gate, this.cy + t, AIM);
        this.grid.set(this.cx + this.gate, this.cy + t, AIM);
      } else {
        this.grid.set(this.cx + t, this.cy - this.gate, AIM);
        this.grid.set(this.cx + t, this.cy + this.gate, AIM);
      }
    }
  }

  private rose(heading: number, trust: number): void {
    for (const point of POINTS) {
      const angle = Heading.delta(heading, point.bearing) * DEG;
      const ax = Math.sin(angle);
      const ay = -Math.cos(angle);

      let radius = LETTER_RADIUS;
      while (radius > LETTER_RADIUS - LETTER_GIVE && !this.fits(point, ax, ay, radius)) {
        radius -= LETTER_STEP;
      }
      this.stamp(point, ax, ay, radius, trust);
    }
  }

  private fits(point: Point, ax: number, ay: number, radius: number): boolean {
    const cx = Math.round(this.cx + ax * radius);
    const cy = Math.round(this.cy + ay * radius);
    for (let row = 0; row < point.glyph.length; row++) {
      const line = point.glyph[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "1" && !this.isLed(cx + point.dx + col, cy + point.dy + row)) return false;
      }
    }
    return true;
  }

  private stamp(point: Point, ax: number, ay: number, radius: number, brightness: number): void {
    const cx = Math.round(this.cx + ax * radius);
    const cy = Math.round(this.cy + ay * radius);
    for (let row = 0; row < point.glyph.length; row++) {
      const line = point.glyph[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "1") this.grid.set(cx + point.dx + col, cy + point.dy + row, brightness);
      }
    }
  }

  private isLed(x: number, y: number): boolean {
    const { size, isInside } = this.device;
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    return isInside[y * size + x] === 1;
  }

  private needle(brightness: number): void {
    const x0 = this.cx - Math.floor(NEEDLE[0].length / 2);
    const y0 = this.cy - Math.floor(NEEDLE.length / 2);
    for (let row = 0; row < NEEDLE.length; row++) {
      const line = NEEDLE[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "1") this.grid.set(x0 + col, y0 + row, brightness);
      }
    }
  }

  private paint(cells: Int32Array, brightness: number): void {
    const size = this.device.size;
    for (const i of cells) this.grid.set(i % size, Math.floor(i / size), brightness);
  }

  /**
   * Repères de cap sur (4a) Pro : un point par cardinal, sauf le nord qui
   * porte un losange — voir la constante `TICK_RADIUS`. Même formule que
   * `rose()` (delta au cap, projeté en sin/cos) : le (3) fait tourner des
   * lettres autour d'une aiguille fixe, le (4a) Pro fait tourner des points
   * autour d'une lettre fixe au centre.
   */
  private compassMarks(heading: number): void {
    for (const bearing of [0, 90, 180, 270]) {
      const angle = Heading.delta(heading, bearing) * DEG;
      const ax = Math.sin(angle);
      const ay = -Math.cos(angle);
      const r = bearing === 0 ? NORTH_MARK_RADIUS : TICK_RADIUS;
      const x = this.cx + ax * r;
      const y = this.cy + ay * r;
      if (bearing === 0) this.diamond(x, y);
      else this.grid.set(x, y, 1);
    }
  }

  /** Losange creux (4 sommets, centre vide) — le repère du nord. */
  private diamond(x: number, y: number): void {
    const cx = Math.round(x);
    const cy = Math.round(y);
    this.grid.set(cx, cy - 1, 1);
    this.grid.set(cx - 1, cy, 1);
    this.grid.set(cx + 1, cy, 1);
    this.grid.set(cx, cy + 1, 1);
  }

  private bubble(bx: number, by: number): void {
    const shape = this.compact ? COMPACT_BUBBLE : BUBBLE;
    const half = this.compact ? COMPACT_BUBBLE_HALF : BUBBLE_HALF;
    for (let row = 0; row < shape.length; row++) {
      const line = shape[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === "1") this.grid.set(bx + col - half, by + row - half, 1);
      }
    }
  }

  private ring(): void {
    const targetRadius = this.usableRadius * PlumbScale.TARGET_FRACTION;
    const brightness = this.compact ? COMPACT_RING : AIM;
    for (const i of this.device.inside) {
      if (Math.abs(this.dist[i] - targetRadius) <= RING_HALF) {
        this.grid.set(i % this.device.size, Math.floor(i / this.device.size), brightness);
      }
    }
  }
}

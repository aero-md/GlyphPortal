/**
 * De quoi **écrire** sur une Glyph Matrix : une surface de dessin en
 * luminosités, et la topologie du disque dont un toy a besoin pour s'y caler.
 *
 * `matrix.ts` dit quelles cellules existent. Ce fichier dit comment y poser
 * quelque chose — un trait, un chiffre, un cadran, un anneau.
 *
 * Tout est dérivé d'une `Geometry` et non figé sur 25 × 25 : un toy écrit pour
 * la matrice du (3) tourne alors tel quel sur celle du (4a) Pro, en plus
 * grossier. Ce qui reste à sa charge, c'est de décider si le résultat est
 * lisible — treize colonnes ne portent ni graduations ni chiffre.
 *
 * Port de `render/Disc.kt` et `render/Canvas.kt` des toys Kotlin.
 */

import { type Font, textWidth } from "./fonts";
import type { Geometry } from "./matrix";

/**
 * La topologie du disque : distances, bord, contour, rayon disponible par angle.
 *
 * Le calcul est fait une fois par géométrie et mémoïsé — `edge` et `ring` sont
 * des tris, et un toy qui redessine à 60 images par seconde n'a pas à les
 * refaire à chaque image.
 */
export type DiscMap = {
  geo: Geometry;
  /** Distance au centre de chaque cellule, row-major. */
  dist: Float64Array;
  /** Cellules du bord triées par angle depuis 12 h, sens horaire. */
  ring: Int32Array;
  /** Le contour : cellules du disque ayant au moins un voisin dehors. */
  edge: Int32Array;
  /** Angle d'une cellule vue du centre, en radians, 0 = 12 h, horaire. */
  angleOf(i: number): number;
  /** Rayon disponible dans la direction `a`, en cellules. */
  edgeDist(a: number): number;
  /** Demi-largeur du disque à la ligne (ou colonne) `y`, en cellules. */
  halfWidth(y: number): number;
};

const CACHE = new WeakMap<Geometry, DiscMap>();

export function discMap(geo: Geometry): DiscMap {
  const hit = CACHE.get(geo);
  if (hit) return hit;

  const { size, cells, cx, cy, radius } = geo;

  const dist = new Float64Array(cells);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) dist[y * size + x] = Math.hypot(x - cx, y - cy);

  const angleOf = (i: number) => Math.atan2((i % size) - cx, -(Math.floor(i / size) - cy));

  /** Le même ramené à 0..2π, pour trier tout le tour dans l'ordre horaire. */
  const turnOf = (i: number) => {
    const a = angleOf(i);
    return a < 0 ? a + 2 * Math.PI : a;
  };

  /* Seuil relatif au rayon, et non 11,3 en dur : la couronne doit rester d'une
     cellule d'épaisseur quelle que soit la grille. */
  const ringMin = radius - 1.2;
  const ring = Int32Array.from(
    geo.inside.filter((i) => dist[i] >= ringMin).sort((a, b) => turnOf(a) - turnOf(b)),
  );

  /* Le contour : la découpe elle-même, épaisse d'une cellule. C'est la seule
     définition qui ne laisse pas de trou — un cercle tramé sur 25 pixels est un
     escalier, pas un cercle, et un rayon constant ne peut pas en épouser les
     marches. */
  const solid = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < size && py < size && dist[py * size + px] < radius;
  const edge = Int32Array.from(
    geo.inside.filter((i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      return !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
    }),
  );

  const edgeAngle = Float64Array.from(edge, angleOf);

  /* Un balayage radial donnerait un autre résultat, et un moins bon : dans les
     diagonales le rayon tombe entre deux cellules du contour, et l'arrondi le
     renvoie une cellule plus bas. Le cadran décrochait du bord juste là où on le
     regarde. En passant par le contour, l'arc est celui du disque, par
     construction. */
  const edgeDist = (a: number) => {
    let best = 0;
    let bestGap = Infinity;
    for (let k = 0; k < edge.length; k++) {
      let gap = Math.abs(edgeAngle[k] - a);
      if (gap > Math.PI) gap = 2 * Math.PI - gap;
      if (gap < bestGap) {
        bestGap = gap;
        best = dist[edge[k]];
      }
    }
    return best;
  };

  const halfWidth = (y: number) => {
    const dy = y - cy;
    const r2 = radius * radius - dy * dy;
    return r2 <= 0 ? 0 : Math.sqrt(r2);
  };

  const map: DiscMap = { geo, dist, ring, edge, angleOf, edgeDist, halfWidth };
  CACHE.set(geo, map);
  return map;
}

/** Écart minimal, en cellules, avant qu'un trait allume son épaule. */
const SHOULDER = 0.5;

/**
 * Grille de travail en luminosités 0..1.
 *
 * Composition en **maximum**, masque du disque appliqué à l'écriture : l'ordre
 * de dessin n'a donc aucune importance, et rien de ce qui sort du hublot n'est
 * jamais stocké.
 *
 * Le gris s'emploie avec parcimonie, et jamais pour porter une valeur : sur
 * 25 LEDs de côté, une nuance ne se lit pas comme une nuance mais comme une LED
 * qui hésite. Il ne sert qu'à deux choses — adoucir un oblique, poser un élément
 * au second plan — et tout ce qui porte de l'information est plein.
 */
export class Grid {
  readonly g: Float32Array;
  private readonly size: number;
  private readonly radius: number;
  private readonly dist: Float64Array;

  constructor(readonly geo: Geometry) {
    this.g = new Float32Array(geo.cells);
    this.size = geo.size;
    this.radius = geo.radius;
    this.dist = discMap(geo).dist;
  }

  clear(): void {
    this.g.fill(0);
  }

  /** Cellule franche. Les coordonnées réelles sont posées au plus proche. */
  set(x: number, y: number, b: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.size || yi >= this.size) return;
    const i = yi * this.size + xi;
    if (this.dist[i] < this.radius && b > this.g[i]) this.g[i] = b;
  }

  /**
   * Segment : un cœur net d'un pixel, plus une épaule en demi-teinte du côté où
   * le trait passe entre deux cellules.
   *
   * Un anticrénelage classique — répartir chaque échantillon sur ses quatre
   * voisins — donne ici un trait large de deux cellules, gris des deux côtés.
   * Sur 25 LEDs, une aiguille de deux cellules de large n'est plus une aiguille.
   * L'épaule ne s'allume donc qu'au-delà d'un quart de cellule d'écart, et
   * proportionnellement : le trait reste plein et droit, et le gris ne sert qu'à
   * casser l'escalier des obliques.
   */
  line(x0: number, y0: number, x1: number, y1: number, b: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    const flat = Math.abs(dx) >= Math.abs(dy);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      const xi = Math.round(x);
      const yi = Math.round(y);
      this.set(xi, yi, b);
      const f = flat ? y - yi : x - xi;
      const s = 2 * Math.abs(f) - SHOULDER;
      if (s > 0) {
        const step = f > 0 ? 1 : -1;
        if (flat) this.set(xi, yi + step, b * s);
        else this.set(xi + step, yi, b * s);
      }
    }
  }

  drawText(f: Font, s: string, x0: number, y0: number, b: number): void {
    let x = x0;
    for (const c of s) {
      if (c === " ") {
        x += 1;
        continue;
      }
      const gl = f.glyphs[c];
      if (!gl) {
        x += 4;
        continue;
      }
      for (let r = 0; r < f.height; r++)
        for (let k = 0; k < gl[r].length; k++) if (gl[r][k] === "1") this.set(x + k, y0 + r, b);
      x += gl[0].length + 1;
    }
  }

  private clippedCount(f: Font, s: string, x0: number, y0: number): number {
    let clip = 0;
    let x = x0;
    for (const c of s) {
      if (c === " ") {
        x += 1;
        continue;
      }
      const gl = f.glyphs[c];
      if (!gl) {
        x += 4;
        continue;
      }
      for (let r = 0; r < f.height; r++) {
        for (let k = 0; k < gl[r].length; k++) {
          if (gl[r][k] !== "1") continue;
          const px = x + k;
          const py = y0 + r;
          if (
            px < 0 ||
            px >= this.size ||
            py < 0 ||
            py >= this.size ||
            this.dist[py * this.size + px] >= this.radius
          ) {
            clip++;
          }
        }
      }
      x += gl[0].length + 1;
    }
    return clip;
  }

  /** Ligne centrée, avec le micro-décalage qui perd le moins de pixels. */
  centeredText(f: Font, s: string, y: number, b: number): void {
    const x0 = Math.round((this.size - textWidth(f, s)) / 2);
    let best = 0;
    let bestClip = Infinity;
    for (const dx of [0, -1, 1, -2, 2]) {
      const c = this.clippedCount(f, s, x0 + dx, y);
      if (c < bestClip) {
        bestClip = c;
        best = dx;
        if (c === 0) break;
      }
    }
    this.drawText(f, s, x0 + best, y, b);
  }

  /** Sortie pour le SDK : luminosités 0..255, row-major. */
  toBrightness(out = new Uint8ClampedArray(this.geo.cells)): Uint8ClampedArray {
    for (let i = 0; i < this.geo.cells; i++) out[i] = Math.min(1, this.g[i]) * 255;
    return out;
  }
}

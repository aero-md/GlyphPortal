/**
 * Le rendu du toy — port de `render/LapseRenderer.kt`.
 *
 * Trois couches se superposent sur la même grille, dans cet ordre : le contenu
 * textuel (la décomposition), les secondes (anneau ou sablier), et les
 * transitions (glissement, arrivée). La composition est en **maximum** : l'ordre
 * n'a donc d'importance que pour la lisibilité, pas pour le résultat.
 *
 * Ce qui n'est pas dans le kit et vit ici, c'est la **mise en page du texte dans
 * un disque**. Le kit sait centrer une ligne ; GlyphLapse doit en poser jusqu'à
 * trois, dans une forme ronde dont les bandes du haut et du bas n'ouvrent que
 * trois colonnes, et choisir entre deux façons d'écrire la même chose selon
 * celle qui perd le moins de pixels.
 */

import { Grid, discMap, textWidth, type Device, type Font } from "@glyph/kit";
import { F3, F5 } from "./fonts";
import type { Breakdown, Format, SecondsMode, Unit } from "./lapse";
import { units } from "./lapse";

/** Pente du talus de sable, en cellules de descente par cellule d'écart. */
const SLOPE = 0.45;

/** Durées des deux glissements, en secondes. */
export const FMT_SLIDE = 0.3;
export const LAPSE_SLIDE = 0.35;

/** Bruit figé, reproductible : le sable ne doit pas grésiller d'une image à l'autre. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 1000) / 1000;
}

export class LapseRenderer {
  private readonly grid: Grid;
  private readonly disc: ReturnType<typeof discMap>;
  private readonly SIZE: number;
  private readonly CX: number;
  private readonly CY: number;
  /** L'anneau du kit est déjà trié par angle depuis 12 h, sens horaire. */
  private readonly ring: Int32Array;

  constructor(private readonly device: Device) {
    this.grid = new Grid(device);
    this.disc = discMap(device);
    this.SIZE = device.size;
    this.CX = device.cx;
    this.CY = device.cy;
    this.ring = this.disc.ring;
  }

  /**
   * Une image complète.
   *
   * `t` est le temps d'animation en secondes depuis le montage — il pilote le
   * cycle et le filet de sable. `slide` et `arrival`, quand ils sont fournis,
   * remplacent ou recouvrent le rendu de base.
   */
  render(
    d: Breakdown,
    format: Format,
    sec: SecondsMode,
    t: number,
    slide: { from: Float32Array; progress: number } | null,
    arrivalT: number | null,
  ): Float32Array {
    this.grid.clear();
    this.content(format, d, t);
    if (sec === 1) this.hourglass(d, t);
    else this.ringSeconds(d);

    let g = this.grid.g;

    /* Glissement horizontal : l'ancien format — ou l'ancien lapse — sort par la
       gauche pendant que le nouveau entre par la droite. Un seul mouvement pour
       deux causes différentes, parce que c'est le même geste : on remplace ce
       qui est affiché par autre chose du même ordre. */
    if (slide) {
      const e = 1 - Math.pow(1 - slide.progress, 3);
      const dx = Math.round(e * this.SIZE);
      const mix = new Grid(this.device);
      this.put(mix, slide.from, dx);
      this.put(mix, g, dx - this.SIZE);
      g = mix.g;
    }

    /* Arrivée : l'échéance vient d'être franchie. Le contenu s'efface aux trois
       quarts pour laisser la place à l'onde. */
    if (arrivalT !== null) {
      for (const i of this.device.inside) g[i] *= 0.25;
      this.arrival(g, arrivalT);
    }

    return g;
  }

  private put(dst: Grid, src: Float32Array, off: number): void {
    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        const sx = x + off;
        if (sx < 0 || sx >= this.SIZE) continue;
        const b = src[y * this.SIZE + sx];
        if (b > 0) dst.set(x, y, b);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Mise en page du texte                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Le décalage horizontal qui perd le moins de pixels dans le disque.
   *
   * Une ligne centrée sur la grille ne l'est pas dans le hublot : les rangées
   * hautes et basses n'ouvrent qu'une poignée de colonnes, et un caractère de
   * bout de ligne y tombe dehors. On essaie donc sept positions autour du centre
   * et on garde celle qui coupe le moins. Trois cellules d'amplitude suffisent —
   * au-delà, la ligne n'est plus centrée, elle est décalée.
   */
  private bestDx(f: Font, s: string, x0: number, y0: number): [number, number] {
    const { dist } = this.disc;
    const { radius } = this.device;
    let best = 0;
    let bestClip = Infinity;
    for (const dx of [0, -1, 1, -2, 2, -3, 3]) {
      let clip = 0;
      let x = x0 + dx;
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
            const X = x + k;
            const Y = y0 + r;
            if (X < 0 || X >= this.SIZE || Y < 0 || Y >= this.SIZE || dist[Y * this.SIZE + X] >= radius)
              clip++;
          }
        }
        x += gl[0].length + 1;
      }
      if (clip < bestClip) {
        bestClip = clip;
        best = dx;
        if (!clip) break;
      }
    }
    return [best, bestClip];
  }

  /**
   * Une ligne centrée, recalée par `bestDx`. Si elle coupe encore et qu'elle
   * porte deux unités, on resserre le séparateur de groupe — deux pixels de
   * blanc entre « 3J » et « 12H » deviennent zéro. Serré vaut mieux que rogné :
   * un chiffre amputé ne se lit pas, deux groupes collés se lisent encore.
   */
  private layoutLine(f: Font, s: string, y: number, b: number): void {
    let text = s;
    let x0 = Math.round((this.SIZE - textWidth(f, s)) / 2);
    let fit = this.bestDx(f, s, x0, y);
    if (fit[1] > 0 && s.includes(" ")) {
      const alt = s.replace(/ /g, "");
      const ax0 = Math.round((this.SIZE - textWidth(f, alt)) / 2);
      const afit = this.bestDx(f, alt, ax0, y);
      if (afit[1] < fit[1]) {
        text = alt;
        x0 = ax0;
        fit = afit;
      }
    }
    this.grid.drawText(f, text, x0 + fit[0], y, b);
  }

  /** Un bloc de lignes, centré verticalement dans le disque. */
  private lines(rows: string[], f: Font, b: number, gap = 1): void {
    const H = rows.length * f.height + (rows.length - 1) * gap;
    const y0 = Math.round((this.SIZE - H) / 2);
    rows.forEach((s, k) => this.layoutLine(f, s, y0 + k * (f.height + gap), b));
  }

  private centered(f: Font, s: string, yc: number, b: number): void {
    this.grid.drawText(
      f,
      s,
      Math.round((this.SIZE - textWidth(f, s)) / 2),
      Math.round(yc - f.height / 2),
      b,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Les quatre formats                                                      */
  /* ---------------------------------------------------------------------- */

  private content(fmt: Format, d: Breakdown, t: number): void {
    const u = units(d);

    // moins d'une minute : il n'y a que des secondes à dire, et elles ont droit
    // au disque entier plutôt qu'à un anneau
    if (d.years === 0 && d.months === 0 && d.days === 0 && d.hours === 0 && d.minutes === 0) {
      this.centered(F5, d.seconds + "S", this.CY, 1);
      return;
    }

    if (fmt === 0) this.dense(u);
    else if (fmt === 1) this.compact(u);
    else if (fmt === 2) this.cycle(u, t);
    else this.days(d);
  }

  /** Dense — la granularité complète, deux unités par ligne quand il le faut. */
  private dense(u: Unit[]): void {
    const s = (x: Unit) => x.value + x.inline;
    let rows: string[];
    if (u.length === 5) rows = [s(u[0]), s(u[1]) + " " + s(u[2]), s(u[3]) + " " + s(u[4])];
    else if (u.length === 4) rows = [s(u[0]), s(u[1]) + " " + s(u[2]), s(u[3])];
    else rows = u.map(s);
    this.lines(rows, u.length <= 2 ? F5 : F3, 1);
  }

  /** Compact — les deux unités de tête seulement, en grand. */
  private compact(u: Unit[]): void {
    this.lines(u.slice(0, 2).map((x) => x.value + x.short), F5, 1);
  }

  /**
   * Cycle — une unité à la fois, qui défile **vers le haut**.
   *
   * Le sens compte : le glissement horizontal dit « on change de chose
   * affichée », le vertical dit « c'est la suite de la même chose ». Les
   * confondre rendrait un changement de lapse indiscernable d'un tour de cycle.
   */
  private cycle(u: Unit[], t: number): void {
    const per = 2.0;
    const n = u.length;
    const tt = t % (per * n);
    const idx = Math.floor(tt / per);
    const ph = tt - idx * per;
    const sl = Math.min(1, ph / 0.3);
    const e = 1 - Math.pow(1 - sl, 3);
    const cur = u[idx];
    const prev = u[(idx + n - 1) % n];

    const page = (unit: Unit, dy: number) => {
      const s = String(unit.value);
      this.grid.drawText(F5, s, Math.round((this.SIZE - textWidth(F5, s)) / 2), 4 + dy, 1);
      this.grid.drawText(
        F3,
        unit.long,
        Math.round((this.SIZE - textWidth(F3, unit.long)) / 2),
        15 + dy,
        0.55,
      );
    };

    if (sl < 1 && n > 1) page(prev, Math.round(-e * this.SIZE));
    page(cur, n > 1 ? Math.round((1 - e) * this.SIZE) : 0);
  }

  /** Jours — un seul nombre, en 5×7 s'il rentre. */
  private days(d: Breakdown): void {
    const s = d.dir === "until" ? "J-" + d.totalDays : d.totalDays + "J";
    this.centered(textWidth(F5, s) <= this.SIZE ? F5 : F3, s, this.CY, 1);
  }

  /* ---------------------------------------------------------------------- */
  /* Les secondes                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * L'anneau : la minute en cours, remplie depuis 12 h. Le sens suit la
   * direction — horaire quand le temps s'accumule, antihoraire quand il se
   * consomme. La tête est à pleine intensité, la traîne au tiers.
   */
  private ringSeconds(d: Breakdown): void {
    const g = this.grid.g;
    const n = this.ring.length;
    const k = Math.round((d.seconds / 60) * n);
    for (let j = 0; j < k; j++) {
      const idx = d.dir === "since" ? j : (n - 1 - j) % n;
      g[this.ring[idx]] = Math.max(g[this.ring[idx]], j === k - 1 ? 1 : 0.32);
    }
  }

  /**
   * Le sablier : du sable en fond, dont le niveau est la fraction de minute.
   *
   * La surface est un cône — pointe au centre quand le temps s'accumule,
   * entonnoir quand il se consomme. La hauteur de base est trouvée par
   * dichotomie et non calculée : le disque n'est pas un rectangle, la surface
   * de sable au-dessus d'une ligne n'a pas d'expression simple, et quatorze
   * itérations suffisent à retomber sur la bonne quantité à la cellule près.
   */
  private hourglass(d: Breakdown, t: number): void {
    const inside = this.device.inside;
    const g = this.grid.g;
    const target = Math.round((d.seconds / 60) * inside.length);
    if (target <= 0) return;

    const prof =
      d.dir === "since"
        ? (dx: number) => SLOPE * dx
        : (dx: number) => SLOPE * (this.CX - dx);

    let lo = -14;
    let hi = this.SIZE + 14;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      let cnt = 0;
      for (const i of inside) {
        const x = i % this.SIZE;
        const y = (i - x) / this.SIZE;
        if (y >= mid + prof(Math.abs(x - this.CX))) cnt++;
      }
      if (cnt > target) lo = mid;
      else hi = mid;
    }
    const yB = (lo + hi) / 2;

    for (const i of inside) {
      const x = i % this.SIZE;
      const y = (i - x) / this.SIZE;
      const depth = y - (yB + prof(Math.abs(x - this.CX)));
      if (depth < 0) continue;
      // surface irrégulière, corps avec bruit granulaire figé
      const b = depth < 1 ? (hash2(x, y) < 0.55 ? 0.1 : 0.055) : 0.06 + 0.03 * hash2(x, y);
      g[i] = Math.max(g[i], b);
    }

    if (d.dir !== "since") return;

    const topC = Math.ceil(yB); // premier pixel de sable au centre, sommet du cône
    if (topC <= 2) return;

    /* Filet continu jusqu'au sommet — il le touche, sinon le sable a l'air de
       tomber de nulle part. Un grain brillant descend, un creux sombre le suit
       en opposition de phase : ça fait des paquets dans le filet plutôt qu'un
       trait qui clignote. */
    for (let y = 0; y < topC; y++) this.grid.set(this.CX, y, 0.07);
    const gy = Math.floor((t * 16) % topC);
    this.grid.set(this.CX, gy, 0.2);
    const j = Math.floor((gy + topC / 2) % topC) * this.SIZE + this.CX;
    if (g[j] <= 0.08) g[j] = 0.02;
    // éclaboussure posée sur la surface du talus, alternance gauche/droite
    const sx = this.CX + (Math.floor(t * 5) % 2 ? 1 : -1);
    this.grid.set(sx, Math.ceil(yB + SLOPE) - 1, 0.15);
  }

  /* ---------------------------------------------------------------------- */
  /* L'arrivée                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Le passage de « jusqu'à » à « depuis » : deux éclairs, trois ondes qui
   * partent du centre, et l'anneau qui pulse en s'amortissant. Quatre secondes,
   * une fois, et le toy reprend son cours.
   */
  private arrival(g: Float32Array, t: number): void {
    const inside = this.device.inside;
    const { dist } = this.disc;

    const f = Math.max(Math.exp(-6 * t), t > 0.25 ? 0.9 * Math.exp(-6 * (t - 0.25)) : 0) * 1.1;
    if (f > 0.04) for (const i of inside) g[i] = Math.max(g[i], Math.min(1, f));

    for (let w = 0; w < 3; w++) {
      const r = 14 * (t - 0.3 - w * 0.35);
      if (r > 0 && r < 14)
        for (const i of inside) if (Math.abs(dist[i] - r) < 0.7) g[i] = 1;
    }

    const p = (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t)) * (1 - t / 4);
    for (const i of this.ring) g[i] = Math.max(g[i], p);
  }
}

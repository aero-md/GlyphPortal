/**
 * Le rendu d'un dé, quel que soit son solide.
 *
 * **Un convexe, lancé de rayons, une cellule à la fois.** Pour chaque LED du
 * hublot on tire un rayon parallèle dans la scène et on le rogne contre les plans
 * des faces : ce qui revient, c'est la face par laquelle il est entré. Six cent
 * vingt-cinq rayons contre vingt plans au plus, à soixante images par seconde, c'est
 * quelques milliers de multiplications — la matrice est si petite que la méthode
 * la plus directe est aussi la moins chère.
 *
 * Le rognage contre des demi-espaces est la même chose que le test de tranches
 * d'un cube, écrit sans supposer que les faces vont par paires parallèles. C'est
 * ce qui fait tourner le cube et le trapézoèdre dans exactement le même code, et
 * ce qui a fait entrer le dodécaèdre et l'icosaèdre sans y toucher une ligne : un
 * solide de plus est un maillage de plus dans `solids.ts`, et rien ne change ici.
 *
 * Ce que ça achète par ailleurs : la grille n'apparaît nulle part dans le tracé.
 * Le même code rend le dé sur les 25 × 25 du (3) et sur les 13 × 13 du (4a) Pro,
 * à la seule condition que le hublot soit rond.
 *
 * Trois niveaux, et la règle du portail tient : **ce qui porte l'information est
 * plein**. La marque est à fond, c'est elle qu'on lit. L'arête est à moitié
 * moins, c'est la carcasse. Le corps des faces est un lavis de quelques
 * pour-cent, juste de quoi que le solide soit un solide et non un grillage — et
 * il varie avec l'éclairage, ce qui fait que la face du dessus, celle qui porte le
 * résultat, est toujours la plus claire.
 */

import { F3, F5, textWidth, type Device, type Font } from "$lib";
import { qMat, revealAt, toLocal, topIndex, type View } from "./dice";
import type { Die, Vec3 } from "./solids";

/**
 * Carcasse et lavis du corps — les deux niveaux qui **ne portent pas**
 * l'information, et qui doivent donc s'effacer devant celui qui la porte.
 *
 * Ces valeurs ont été baissées deux fois, et la première ne s'est pas vue. C'est
 * l'affaire du §4.3 des specs du portail : *la consigne envoyée à une LED est une
 * valeur PWM, mais l'œil la lit en gamma*. Enlever un tiers du rapport cyclique
 * n'enlève qu'un dixième de luminosité apparente — 0,55 et 0,38 se perçoivent à
 * 76 % et 64 %, ce qui explique très bien qu'on ne voie aucune différence.
 *
 * Les niveaux sont donc posés dans l'espace perceptuel, puis ramenés en PWM par
 * `v^2,2` :
 *
 *     marque   1,00  →  perçue 100 %
 *     arête    0,18  →  perçue  46 %
 *     lavis    0,03 – 0,08  →  perçu 20 – 32 %
 *
 * L'arête à mi-hauteur perçue laisse enfin le rapport de deux qu'on croyait avoir
 * depuis le début, et la silhouette ne perd rien : c'est un contour d'une cellule,
 * il n'a jamais eu besoin d'être vif pour se voir. Le lavis, lui, ne descend pas
 * plus bas : sous huit sur 255, la LED s'éteint pour de bon et le solide redevient
 * un grillage.
 *
 * Note pour l'écran : ces valeurs sont composées en alpha par le navigateur, donc
 * la préview les montre **déjà** en perçu. C'est la matrice qui les affiche plus
 * claires que prévu, pas la page qui se trompe.
 */
export const EDGE = 0.18;
/** Lavis du corps, de la face à contre-jour à la face éclairée. */
export const FILL_MIN = 0.03;
export const FILL_SPAN = 0.05;

/**
 * Côté d'un pip, **en cellules d'écran**, et c'est un parti pris contre la
 * perspective.
 *
 * Un pip n'est pas peint sur la face : son centre est projeté, puis un carré de
 * 3 × 3 est tamponné sur la grille. Il garde donc la même taille et reste aligné
 * sur les LEDs quelle que soit l'inclinaison de la face, et pendant que le
 * rapprochement fait grandir le solide sous lui.
 *
 * C'est faux, et c'est exactement ce qu'on veut. La version juste — un disque
 * mesuré dans le dé, projeté avec le reste — donnait un pip d'une à quatre
 * cellules selon là où il tombait entre les centres : trois pips côte à côte
 * n'avaient pas la même taille, et un 6 se lisait comme un motif irrégulier
 * plutôt que comme six points. Sur vingt-cinq LEDs de côté, la quantification
 * fait plus de dégâts que l'entorse à la géométrie. Les LEDs ne sont pas un
 * rendu, elles sont une trame : un point y a une taille, pas une distance.
 *
 * Impair, nécessairement : un carré centré sur une cellule a un côté impair.
 */
const PIP_PX = 3;

/**
 * Les nombres suivent la même règle que les pips : tamponnés à l'écran, donc
 * droits et à l'échelle de la trame, jamais déformés par l'inclinaison de leur
 * face. Un 8 penché sur un octaèdre qui culbute serait un 8 illisible.
 *
 * Trois tailles et pas un continuum, parce qu'une trame n'a pas de demi-cellule :
 * un chiffre ne peut grandir que par doublement de son pixel. La plus grande qui
 * tient dans le cercle inscrit de la face est retenue.
 *
 * Le test porte sur la **hauteur et la largeur**, et il fallait les deux dès que
 * le dix s'est écrit à deux chiffres : `10` dilaté deux fois fait vingt-deux
 * cellules de large, soit plus que le hublot entier. C'est ce qui choisit tout
 * seul la police non dilatée pour le dix, et laisse les chiffres seuls en grand.
 *
 * La place disponible est mesurée **au gros plan**, et pas dans l'image courante.
 * C'était le second `20` qui sautait : le rapprochement fait grandir la face, la
 * place franchit un cran de l'échelle en cours de route, et le nombre changeait de
 * corps — donc de largeur, donc de calage — à mi-révélation. La taille d'un nombre
 * est une propriété du dé, pas de l'instant : elle vaut celle qu'il aura une fois
 * posé, dès la première image où on le voit.
 */
const STEPS: { font: Font; scale: number }[] = [
  { font: F5, scale: 2 },
  { font: F5, scale: 1 },
  { font: F3, scale: 1 },
];

/**
 * La lumière, dans le monde et non dans le repère du dé : elle vient d'en haut,
 * un peu de la gauche, un peu de l'avant. C'est ce qui fait que le lavis des
 * faces change *pendant* la culbute au lieu d'être collé au solide, et que la
 * face du dessus se détache une fois le dé posé.
 */
const LIGHT: Vec3 = [-0.35, 0.92, 0.2];

/** Distance du plan de tirage. Projection parallèle : seul son signe compte. */
const CAM_D = 6;

/** Un plan rasant : au-delà, le rayon est parallèle à la face. */
const EPS = 1e-9;

export class DiceRenderer {
  private readonly g: Float32Array;
  private readonly out: Float32Array;
  /** Face touchée par cellule, ou −1 pour le vide. */
  private readonly face: Int8Array;

  constructor(readonly device: Device) {
    this.g = new Float32Array(device.cells);
    this.out = new Float32Array(device.cells);
    this.face = new Int8Array(device.cells);
  }

  /**
   * La trame du dé `die` dans la vue `v`.
   *
   * Le tampon est réutilisé d'une image à l'autre : à l'appelant d'en prendre une
   * copie s'il le garde.
   */
  render(die: Die, v: View): Float32Array {
    const { size, cx, cy, radius, cells, inside, isInside } = this.device;
    const g = this.g;
    const face = this.face;
    g.fill(0);
    face.fill(-1);

    /* Base de la caméra dans le monde. `ex` est tiré du seul azimut, ce qui la
       garde orthogonale à `ez` même à l'aplomb — un produit vectoriel avec la
       verticale dégénérerait pile dans la pose de repos. */
    const ce = Math.cos(v.cam.elev);
    const se = Math.sin(v.cam.elev);
    const cyw = Math.cos(v.cam.yaw);
    const syw = Math.sin(v.cam.yaw);
    const ez: Vec3 = [syw * ce, se, cyw * ce];
    const ex: Vec3 = [cyw, 0, -syw];
    const ey: Vec3 = [
      ez[1] * ex[2] - ez[2] * ex[1],
      ez[2] * ex[0] - ez[0] * ex[2],
      ez[0] * ex[1] - ez[1] * ex[0],
    ];

    /* Tout est ramené une fois par image dans le repère du dé : le rayon d'une
       cellule y est une combinaison linéaire de trois vecteurs constants. */
    const m = qMat(v.q);
    const A = toLocal(m, ex);
    const B = toLocal(m, ey);
    const C = toLocal(m, ez);
    const O = toLocal(m, [
      CAM_D * ez[0] - v.pos[0],
      CAM_D * ez[1] - v.pos[1],
      CAM_D * ez[2] - v.pos[2],
    ]);
    const L = toLocal(m, LIGHT);

    /** Unités de dé par cellule. */
    const k = v.cam.half / radius;

    /* Par face et une fois par image : la fonction du plan le long du rayon est
       affine en (wx, wy), et sa pente le long du rayon est constante puisque la
       projection est parallèle. La boucle par LED n'a donc qu'une division. */
    const F = die.face.length;
    const q0 = new Float64Array(F);
    const qx = new Float64Array(F);
    const qy = new Float64Array(F);
    const qd = new Float64Array(F);
    const fill = new Float64Array(F);
    for (let f = 0; f < F; f++) {
      const n = die.face[f].n;
      q0[f] = n[0] * O[0] + n[1] * O[1] + n[2] * O[2] - die.face[f].d;
      qx[f] = n[0] * A[0] + n[1] * A[1] + n[2] * A[2];
      qy[f] = n[0] * B[0] + n[1] * B[1] + n[2] * B[2];
      // Incidence : le rayon va vers `−C`, donc une face vue de face a `n·C > 0`.
      qd[f] = -(n[0] * C[0] + n[1] * C[1] + n[2] * C[2]);
      const lam = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
      fill[f] = FILL_MIN + FILL_SPAN * (lam > 0 ? lam : 0);
    }

    /**
     * La face qui portera la marque : celle du **dessus**, la même que relit le
     * résultat et que vise le recentrage — voir `topIndex`.
     *
     * Un dé physique montre les marques de toutes ses faces visibles, et il a deux
     * cents fois cette résolution pour le faire. Ici un d10 posé montre cinq
     * cerfs-volants à la fois : cinq chiffres pleins dans un hublot de vingt-cinq
     * LEDs, dont un seul est le résultat. **Un dé, un nombre.**
     *
     * Le critère a d'abord été « la face la plus de face », ce qui paraissait
     * revenir au même puisqu'on ne montre une marque qu'à l'aplomb. Ça n'y revient
     * pas au *début* du rapprochement : la caméra est encore à mi-élévation, et sur
     * un icosaèdre la face la plus de face y est encore une face latérale. Mesuré
     * sur 4 000 jets, le maximum changeait de face jusqu'à `z = 0,64` — donc à 93 %
     * de luminosité, donc bien visible : le 20 s'affichait une ou deux images sur le
     * flanc, à cinq cellules du centre, puis sautait à sa place. C'est le « chiffre
     * qui se téléporte ». Avec la face du dessus, plus une seule bascule sur 12 000
     * jets, et pour cause : le dé est posé, elle ne peut plus changer.
     */
    const best = topIndex(die, m);

    /* La grille entière, hublot compris : le masque est appliqué à l'écriture
       finale. Une passe restreinte au disque ferait croire à la détection
       d'arêtes que le dé s'arrête au bord du hublot, et dessinerait un arc vif
       sur la découpe. */
    for (let y = 0; y < size; y++) {
      const wy = -(y - cy) * k;
      for (let x = 0; x < size; x++) {
        const wx = (x - cx) * k;

        /* Rognage du rayon par les demi-espaces : on garde le plus tardif des
           instants d'entrée et le plus précoce des instants de sortie. La face
           d'entrée est celle qui a fixé le premier. */
        let lo = -Infinity;
        let hi = Infinity;
        let entry = -1;
        let outside = false;

        for (let f = 0; f < F; f++) {
          const num = q0[f] + wx * qx[f] + wy * qy[f];
          const den = qd[f];
          if (den > -EPS && den < EPS) {
            // Rayon parallèle à la face : soit dedans pour toujours, soit dehors.
            if (num > 0) {
              outside = true;
              break;
            }
            continue;
          }
          const t = -num / den;
          if (den < 0) {
            if (t > lo) {
              lo = t;
              entry = f;
            }
          } else if (t < hi) hi = t;
        }

        if (outside || entry < 0 || lo > hi) continue;

        const i = y * size + x;
        face[i] = entry;
        g[i] = fill[entry];
      }
    }

    /* Les arêtes ne sont pas tracées, elles sont **trouvées** : une cellule dont
       une voisine touche une autre face, ou le vide, est une arête. Ça donne une
       carcasse d'exactement une cellule quelle que soit la grille et quel que
       soit l'angle — un trait d'épaisseur constante en unités de dé aurait fondu
       sur les faces vues de biais, pile là où le solide a besoin de son contour. */
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const f = face[i];
        if (f < 0) continue;
        if (
          (x > 0 && face[i - 1] !== f) ||
          (x < size - 1 && face[i + 1] !== f) ||
          (y > 0 && face[i - size] !== f) ||
          (y < size - 1 && face[i + size] !== f)
        ) {
          if (g[i] < EDGE) g[i] = EDGE;
        }
      }
    }

    /* Les marques, en dernier et par-dessus les arêtes : ce sont elles qu'on lit.
       Le point d'ancrage est projeté à l'écran, puis la marque est tamponnée sur
       la grille — d'où sa taille constante.

       Le tampon n'écrit que sur les cellules de **sa** face, ce qui est
       l'occlusion exacte et gratuite : la passe de rayons a laissé l'identité de
       la face dans chaque cellule. Une marque qui déborde d'une arête est donc
       rognée par l'arête, au lieu de baver sur la face voisine ou dans le vide. */
    // Une marque n'apparaît qu'au gros plan — voir `revealAt`.
    const lit = revealAt(v.cam.z);
    if (lit > 0) {
      const fc = die.face[best];
      if (fc.pips.length) {
        for (const p of fc.pips) {
          const s = this.project(p, m, v.pos, ex, ey, k);
          this.block(s[0], s[1], PIP_PX, PIP_PX, best, lit);
        }
      } else {
        /* Place disponible pour un nombre, en cellules : le rayon inscrit de la
           face, mesuré dans le cadrage du gros plan et non dans celui de l'image
           courante — c'est ce qui empêche le corps de changer en cours de
           révélation. Voir `STEPS`. */
        const room = (fc.inr * this.device.radius) / die.close;
        const step = STEPS.find(
          (s) =>
            (s.font.height * s.scale) / 2 <= room &&
            (textWidth(s.font, fc.glyph) * s.scale) / 2 <= room,
        );
        if (step) {
          const s = this.project(fc.c, m, v.pos, ex, ey, k);
          this.text(step.font, step.scale, fc.glyph, s[0], s[1], best, lit);
        }
      }
    }

    const out = this.out;
    out.fill(0);
    const jx = v.jolt ? v.jolt[0] : 0;
    const jy = v.jolt ? v.jolt[1] : 0;
    if (!jx && !jy) {
      for (const i of inside) out[i] = g[i];
      return out;
    }
    for (let i = 0; i < cells; i++) {
      if (!isInside[i]) continue;
      const sx = (i % size) - jx;
      const sy = Math.floor(i / size) - jy;
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      out[i] = g[sy * size + sx];
    }
    return out;
  }

  /** Un point du repère du dé, en coordonnées de cellule. */
  private project(
    p: Vec3,
    m: Float64Array,
    pos: Vec3,
    ex: Vec3,
    ey: Vec3,
    k: number,
  ): [number, number] {
    const w0 = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + pos[0];
    const w1 = m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + pos[1];
    const w2 = m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + pos[2];
    // Projection parallèle, puis le calage de la boucle par cellule, à l'envers.
    return [
      this.device.cx + (w0 * ex[0] + w1 * ex[1] + w2 * ex[2]) / k,
      this.device.cy - (w0 * ey[0] + w1 * ey[1] + w2 * ey[2]) / k,
    ];
  }

  /** Un rectangle plein centré, rogné à la face `f`. */
  private block(sx: number, sy: number, w: number, h: number, f: number, b: number): void {
    const x0 = Math.round(sx - w / 2);
    const y0 = Math.round(sy - h / 2);
    for (let dy = 0; dy < h; dy++) {
      const yy = y0 + dy;
      if (yy < 0 || yy >= this.device.size) continue;
      for (let dx = 0; dx < w; dx++) {
        const xx = x0 + dx;
        if (xx < 0 || xx >= this.device.size) continue;
        const j = yy * this.device.size + xx;
        if (this.face[j] === f && this.g[j] < b) this.g[j] = b;
      }
    }
  }

  /**
   * Un nombre centré, chaque pixel de police dilaté en carré de `scale`.
   *
   * Un pixel de blanc entre deux chiffres, dilaté comme le reste — c'est ce que
   * mesure `textWidth`, et le centrage en dépend. Le dix est le seul nombre à deux
   * chiffres du lot, et il ne tient qu'à l'échelle 1 : cette cellule d'écart est
   * donc bien une cellule, et le `10` fait onze de large.
   */
  private text(
    font: Font,
    scale: number,
    s: string,
    sx: number,
    sy: number,
    f: number,
    b: number,
  ): void {
    const h = font.height * scale;
    const y0 = Math.round(sy - h / 2);
    let x0 = Math.round(sx - (textWidth(font, s) * scale) / 2);

    for (const ch of s) {
      const rows = font.glyphs[ch];
      if (!rows) continue;
      for (let r = 0; r < font.height; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          if (rows[r][c] !== "1") continue;
          for (let dy = 0; dy < scale; dy++) {
            const yy = y0 + r * scale + dy;
            if (yy < 0 || yy >= this.device.size) continue;
            for (let dx = 0; dx < scale; dx++) {
              const xx = x0 + c * scale + dx;
              if (xx < 0 || xx >= this.device.size) continue;
              const j = yy * this.device.size + xx;
              if (this.face[j] === f && this.g[j] < b) this.g[j] = b;
            }
          }
        }
      }
      x0 += (rows[0].length + 1) * scale;
    }
  }
}

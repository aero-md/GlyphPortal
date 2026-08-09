/**
 * Rendu de la vignette du sommaire.
 *
 * **Volontairement séparé de `render.ts`, et volontairement redondant avec lui.**
 * Les deux dessinent la même chose — l'appareil, LED carrée et halo — mais ne
 * répondent pas de la même contrainte :
 *
 * - `render.ts` sert la grande préview et l'export PNG. Sa cellule fait 5 à
 *   16 px, elle vit dans une colonne dont la largeur bouge avec la fenêtre, et
 *   son mode grand a de quoi s'étaler. Un réglage y est fait pour être lu LED
 *   par LED.
 * - ici, la cellule est au plancher, le disque tient dans une tuile de sommaire
 *   et la vignette n'a qu'une chose à dire : voilà à quoi ça ressemble sur
 *   l'appareil.
 *
 * Les faire passer par le même code les a déjà fait se marcher dessus : le jour
 * où le cerne du mode téléphone a été divisé par deux, celui du mode grand et
 * des PNG a suivi sans que personne le demande (voir `CERNE_DESSINE` dans
 * `render.ts`, qui est la cicatrice de cet épisode). Une vignette de 150 px et
 * un disque de 550 n'ont pas les mêmes marges de manœuvre : les régler ensemble,
 * c'est en régler un et casser l'autre. Le doublon est donc le prix payé pour
 * que les deux réglages soient indépendants — et il est petit, une cinquantaine
 * de lignes qui ne dépendent que de `Device` et `Frame`.
 *
 * Ce qui reste commun est ce qui décrit l'**appareil** et non son affichage :
 * la géométrie de la matrice (`devices.ts`), le contrat de trame (`frame.ts`).
 * Ces deux-là doivent rester uniques, c'est la raison d'être du paquet.
 */

import type { Device } from "./devices";
import type { Frame } from "./frame";

/** Ce que la vignette a besoin de savoir pour se peindre et se poser. */
export type ThumbGrid = {
  /** Pixels de backing par LED — entier, sinon la trame devient irrégulière. */
  cell: number;
  /** Côté du champ de LEDs, en pixels de backing. C'est la taille du canvas. */
  field: number;
  /** Le même en pixels CSS — ratio backing/CSS exactement 1. */
  fieldCss: number;
  /** Cerne de chaque côté, en pixels de backing. Entier : voir plus bas. */
  ring: number;
  /** Diamètre du disque, cerne compris, en pixels CSS. */
  discCss: number;
  /**
   * Coin haut-gauche du **canvas** dans la boîte, en px CSS, posé sur la grille
   * de pixels physiques — voir plus bas pourquoi ce n'est pas au CSS de centrer.
   */
  padCss: number;
  /** Coin haut-gauche du **disque** dans la boîte, en px CSS. Concentrique. */
  discCss0: number;
};

/** Cellule plancher. En dessous, LED et écart ne se distinguent plus. */
const MIN_CELL = 3;

/**
 * Cerne minimal, en largeurs de LED — la même borne géométrique que la grande
 * préview, pour la même raison : le masque teste le **centre** des cellules,
 * donc la LED la plus excentrée est à `maxDist` du centre et son coin une
 * demi-diagonale plus loin. En deçà, un coin de LED sort du hublot.
 */
const cerneMin = (d: Device) => d.maxDist - d.size / 2 + Math.SQRT1_2;

/**
 * Cerne de la mini-prévisu, en largeurs de LED.
 *
 * **Décoratif, et réglé à l'œil.** Il ne suit ni `device.margin` — la cote du
 * hublot sur la photo du dos — ni le cerne du mode grand : c'est une vignette,
 * son disque est dessiné, son bord n'existe que parce qu'on le peint, il n'a
 * donc aucune cote à respecter.
 *
 * Il est passé par `device.margin` au nom de la fidélité : sur un (3) le champ
 * occupe 94 % du hublot, et une vignette calée dessus rendait un cerne de 4 px
 * pour un disque de 141. À la taille d'une tuile de sommaire, ce filet
 * disparaît — le disque ne se lit plus comme le hublot d'un appareil mais comme
 * un carré de LEDs aux coins rognés. Doublé, il repose la matrice dans quelque
 * chose. Un rapport à tenir sur une photo et un rapport lisible à 140 px ne sont
 * pas le même nombre.
 *
 * Le disque se déduit ensuite de la cellule, il n'est pas imposé : la cellule
 * est entière et vaut 5 px sur un (3) en densité 1, donc le champ fait 125 px et
 * le disque 141. C'est l'appelant qui laisse le mou autour — l'inverse du mode
 * grand, qui remplit sa colonne.
 */
const CERNE = 1.6;

/**
 * La grille de la mini-prévisu, tenant dans `box` px CSS.
 *
 * **Le centrage est calculé ici, pas laissé au CSS.** Le canvas ne porte que le
 * champ ; centré par un `place-items` dans une boîte de 150 px, son coin tombait
 * à (150 − 125) / 2 = 12,5 px, c'est-à-dire sur un demi-pixel physique en
 * densité 1. Un canvas posé sur un demi-pixel est rééchantillonné par le
 * navigateur : il part au flou d'un coup alors que son contenu est net, et toute
 * la peine prise à garder une cellule entière est perdue. `padCss` est donc
 * arrondi au pixel physique, et le disque suit le canvas plutôt que la boîte
 * pour rester concentrique.
 */
export function thumbGrid(d: Device, box: number, dpr = window.devicePixelRatio || 1): ThumbGrid {
  const budget = box * dpr;
  const plancher = cerneMin(d);

  /* Le cerne d'une cellule donnée : la consigne décorative, arrondie au pixel,
     jamais sous la borne géométrique ni sous 1 px — à zéro, la LED du bord
     toucherait la découpe. */
  const ringFor = (cell: number) =>
    Math.max(1, Math.ceil(plancher * cell), Math.round(CERNE * cell));

  /* Départ au plus grand candidat plausible, puis on redescend : `ringFor`
     arrondit, donc la plus grande cellule qui rentre ne se calcule pas d'un
     trait. Deux tours au plus en pratique. */
  let cell = Math.max(MIN_CELL, Math.floor(budget / (d.size + 2 * CERNE)));
  while (cell > MIN_CELL && d.size * cell + 2 * ringFor(cell) > budget) cell--;

  const ring = ringFor(cell);
  const field = d.size * cell;
  /* Coin du canvas arrondi au pixel physique, puis le disque calé dessus : le
     cerne étant un entier de pixels de backing, les deux restent sur la grille
     et le disque reste centré sur la matrice au pixel près. */
  const padCss = Math.round((box * dpr - field) / 2) / dpr;
  return {
    cell,
    field,
    fieldCss: field / dpr,
    ring,
    discCss: (field + 2 * ring) / dpr,
    padCss,
    discCss0: padCss - ring / dpr,
  };
}

/* Blanc légèrement chaud des LEDs Nothing, fond du hublot, LED éteinte. Ces
   trois valeurs décrivent l'appareil et sont donc les mêmes que celles du mode
   `sharp` de `render.ts` — c'est le rendu autour d'elles qui est réglé à part. */
const ON = "242,242,239";
export const THUMB_BG = "#08080a";
const OFF = "#1b1b20";

/**
 * Part du halo, relative à la cellule.
 *
 * Plus discret que celui de la grande préview (0,55) : à cellule égale, une
 * vignette est regardée de plus loin dans la page et son halo se lit comme du
 * flou plutôt que comme de la lumière. Le reste — LED carrée, plancher
 * d'opacité, halo proportionnel à la luminosité — est identique, c'est ce qui
 * fait qu'on reconnaît l'appareil.
 */
const HALO = 0.45;

/** Opacité plancher d'une LED allumée : à 1 % elle doit se lire comme allumée. */
const FLOOR = 0.25;

/**
 * Peint le champ de LEDs dans un canvas de `g.field` de côté.
 *
 * Le canvas ne porte **que** le champ. Le disque et son cerne sont peints par le
 * CSS de la vignette : peindre ici un second disque en poserait un par-dessus
 * l'autre, à un diamètre légèrement différent, et le bord se dédoublerait.
 */
export function paintThumb(ctx: CanvasRenderingContext2D, frame: Frame, g: ThumbGrid): void {
  const { size, inside, duty } = frame.device;

  /* LED et marge dans la cellule. Au moins 1 px d'écart — deux LEDs jointives
     ne se distinguent plus — et une marge **plancher** plutôt que la moitié
     exacte : centrer imposerait une marge à la demie dès que l'écart est
     impair, donc un bord anticrénelé à chaque cellule. Décaler la trame entière
     d'un demi-pixel ne se voit pas ; un bord flou, si. */
  const led = Math.min(g.cell - 1, Math.max(2, Math.round(g.cell * duty)));
  const pad = Math.floor((g.cell - led) / 2);

  ctx.clearRect(0, 0, g.field, g.field);

  for (const i of inside) {
    const x = i % size;
    const y = (i - x) / size;
    const b = frame.values[i];

    if (b <= 0.02) {
      ctx.fillStyle = OFF;
    } else {
      ctx.fillStyle = `rgba(${ON},${FLOOR + (1 - FLOOR) * b})`;
      ctx.shadowColor = `rgba(${ON},${0.8 * b})`;
      ctx.shadowBlur = g.cell * HALO * b;
    }

    ctx.fillRect(x * g.cell + pad, y * g.cell + pad, led, led);
    ctx.shadowBlur = 0;
  }
}

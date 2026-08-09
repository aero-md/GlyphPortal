/**
 * Lottie → `Frame`.
 *
 * Les préviews exportées des toys sont des Lottie, et ce ne sont pas des
 * animations vectorielles libres : ce sont les **matrices elles-mêmes**, une LED
 * par rectangle, exportées depuis le toy. Le fichier de GlyphSlot en aligne 4877
 * sur un pas régulier, remplis d'un même gris à trois opacités.
 *
 * On pourrait donc les jouer tels quels. On ne le fait pas, pour deux raisons :
 * le Lottie ne dessine que les LEDs **allumées** — le disque resterait noir entre
 * les points, là où l'appareil et le mode `soft` montrent la grille éteinte — et
 * il porte sa propre géométrie, alors que ce paquet existe précisément pour
 * qu'il n'y en ait qu'une. On repasse donc par une `Frame`, et c'est `paint` qui
 * décide à quoi ressemble une LED.
 *
 * L'échantillonnage prend le **maximum** de la cellule et non sa moyenne. La
 * moyenne mesurerait la part de cellule couverte par le point — environ la
 * moitié, puisqu'une LED n'occupe que `duty²` de son pas — et rendrait toute la
 * matrice deux fois trop sombre. Le maximum lit le plateau du remplissage, qui
 * est la valeur voulue, et il est de surcroît insensible à un décalage d'une
 * fraction de cellule entre la grille du Lottie et la nôtre : un point qui
 * déborde sur sa voisine la contamine, mais aucune LED ne s'éteint.
 */

import type { AnimationConfigWithData } from "lottie-web";

import type { Device } from "./devices";
import { frameOf, type Frame } from "./frame";

/** Ce qu'une préview consomme : une trame par instant, et de quoi boucler. */
export type MatrixSampler = {
  /** Durée d'un tour, en secondes. */
  readonly duration: number;
  /**
   * Trame à l'instant `t` (secondes, repliée sur la durée).
   *
   * **Le tableau de valeurs est réutilisé d'un appel à l'autre.** À trente
   * trames par seconde, en allouer un neuf à chaque fois donnerait au ramasse-
   * miettes de quoi hoqueter sur une page qui en fait tourner plusieurs. La
   * trame rendue est donc à consommer avant le prochain appel — ce que fait un
   * `paint` synchrone, et ce qui interdit de la mettre de côté.
   */
  frameAt(t: number): Frame;
  destroy(): void;
};

/**
 * Blanc de référence, en deçà duquel on refuse de normaliser.
 *
 * Le point blanc est relevé sur l'animation elle-même (voir plus bas) : sans
 * plancher, une préview qui resterait sombre du début à la fin verrait son
 * maximum — disons 12 % — promu au blanc, et le moindre frémissement de LED
 * exploserait à pleine luminosité. Le plancher borne ce gain.
 */
const WHITE_FLOOR = 0.35;

/** Nombre de trames sondées pour établir le point blanc. */
const PRESCAN = 16;

/* Rec. 709, comme le mixeur de glyphcast : la matrice est monochrome, il faut
   bien projeter le RGB du Lottie sur une seule grandeur. */
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/**
 * Échantillons par LED, **propre à la lecture d'un Lottie**.
 *
 * Ce n'est pas `device.ss`, qui vaut 8 sur un (3) et sert au suréchantillonnage
 * d'une photo dans glyphcast. Les deux mesurent la même chose et n'ont pas du
 * tout le même besoin :
 *
 * - suréchantillonner une photo, c'est **moyenner** une texture continue. Huit
 *   par huit suffit largement, et c'est un coût payé à chaque frappe de curseur.
 * - relire un Lottie, c'est retrouver un **plateau** de remplissage déjà
 *   quantifié. Le maximum est pris sur toute la cellule, donc le bord
 *   anticrénelé du point voisin entre dans le compte dès qu'il déborde d'un
 *   demi-échantillon.
 *
 * À 8, la boucle de GlyphSlot rendait 21 cellules fausses sur 489, dont une à
 * 0,56 d'écart — la moitié de la plage. C'est ce qui donnait à la vignette son
 * air délavé, des LEDs à demi allumées là où le fichier n'en met aucune. La
 * mesure converge à 12 ; 16 laisse de la marge sans rien coûter, le temps d'une
 * trame étant dominé par le rendu du Lottie lui-même (~14 ms) et non par la
 * lecture des pixels.
 */
const LOTTIE_SS = 16;

/**
 * Luminance maximale de chaque cellule, pondérée par l'alpha.
 *
 * L'alpha compte : `getImageData` rend des composantes **non prémultipliées**,
 * si bien qu'un pixel de bord anticrénelé à moitié couvert renvoie la couleur
 * pleine du point. Sans la pondération, le halo d'anticrénelage se lirait comme
 * une LED allumée à fond, et les points paraîtraient un cran trop gros.
 */
function cellPeaks(
  d: Device,
  ss: number,
  sample: number,
  data: Uint8ClampedArray,
  out: Float32Array,
): number {
  const { size, isInside } = d;
  let peak = 0;

  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const i = cy * size + cx;
      if (!isInside[i]) {
        out[i] = 0;
        continue;
      }

      let best = 0;
      const y0 = cy * ss;
      const x0 = cx * ss;
      for (let y = 0; y < ss; y++) {
        let o = ((y0 + y) * sample + x0) * 4;
        for (let x = 0; x < ss; x++, o += 4) {
          const a = data[o + 3] / 255;
          if (a === 0) continue;
          const l = (LR * data[o] + LG * data[o + 1] + LB * data[o + 2]) * a * (1 / 255);
          if (l > best) best = l;
        }
      }

      out[i] = best;
      if (best > peak) peak = best;
    }
  }

  return peak;
}

/**
 * Monte un Lottie sur un canvas hors écran et rend un échantillonneur.
 *
 * Le canvas fait `LOTTIE_SS` pixels par LED — 400 de côté pour un (3) — et pas
 * un de plus : on ne cherche pas à afficher le Lottie, seulement à relever une
 * valeur par LED. Toute résolution au-delà serait jetée par le maximum.
 *
 * `lottie-web` est importé dynamiquement : c'est la plus grosse dépendance du
 * paquet, et une page qui n'affiche aucune préview animée n'a aucune raison de
 * la télécharger.
 *
 * Le build visé est `lottie_light_canvas` et non l'entrée principale, qui tire
 * les trois moteurs de rendu quand on n'en veut qu'un. « Light » veut dire sans
 * évaluateur d'expressions : les boucles exportées des toys n'en contiennent
 * aucune — elles sortent d'un rendu de matrice, pas d'un projet After Effects
 * scripté — et c'est 60 Ko de moins. Sans l'extension `.min`, parce que c'est
 * ce chemin-là qui porte les déclarations de types du paquet, et que le
 * minifieur du bundler fera le travail de toute façon.
 */
export async function lottieSampler(
  device: Device,
  animationData: unknown,
): Promise<MatrixSampler> {
  const { default: lottie } = await import("lottie-web/build/player/lottie_light_canvas");

  const S = device.size * LOTTIE_SS;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = S;
  const ctx = cvs.getContext("2d", { willReadFrequently: true })!;

  /* Le paramètre de type est obligatoire : `loadAnimation` est déclaré générique
     avec `"svg"` par défaut, et sans lui `renderer: "canvas"` est refusé — tout
     comme `context`, qui n'appartient qu'aux réglages du moteur canvas.

     **`container` est omis volontairement**, et la conversion de type est là
     pour ça : les déclarations du paquet le donnent pour requis, mais le moteur
     canvas s'en sert comme d'un aiguillage —

         if (animationItem.wrapper) { … dessine dans un canvas à lui … }
         else                       { canvasContext = renderConfig.context }

     — si bien qu'un conteneur, fût-il vide et détaché, fait **ignorer le
     `context` qu'on vient de fournir**. Le moteur se fabrique alors son propre
     canvas dans un élément hors document, donc de 0 × 0, et le premier masque
     venu casse sur un `drawImage` dont la source est vide. Sans conteneur, il
     prend le nôtre et en lit les cotes. */
  const anim = lottie.loadAnimation<"canvas">({
    renderer: "canvas",
    loop: false,
    autoplay: false,
    animationData,
    rendererSettings: {
      context: ctx,
      /* Le Lottie est carré et le canvas aussi : `meet` ne rogne donc rien, il
         garantit seulement qu'un fichier au format inattendu rentre en entier
         plutôt que d'être coupé. */
      preserveAspectRatio: "xMidYMid meet",
      clearCanvas: true,
      /* Sans quoi le moteur multiplierait la taille du canvas par la densité de
         l'écran. Ici le canvas n'est pas affiché : sa taille est un nombre
         d'échantillons par LED, pas une longueur, et elle n'a rien à voir avec
         les pixels physiques de la machine. */
      dpr: 1,
    },
  } as AnimationConfigWithData<"canvas">);

  /* `loadAnimation` rend la main avant d'avoir fini de configurer son rendu.
     Sonder l'animation avant cet événement tombe sur un moteur qui n'a pas
     encore de couches à dessiner. */
  await new Promise<void>((resolve) => {
    if (anim.isLoaded) resolve();
    else anim.addEventListener("DOMLoaded", () => resolve());
  });

  const total = Math.max(1, anim.totalFrames);
  const rate = anim.frameRate || 30;
  const values = new Float32Array(device.cells);

  const peakAt = (frame: number): number => {
    anim.goToAndStop(frame, true);
    return cellPeaks(device, LOTTIE_SS, S, ctx.getImageData(0, 0, S, S).data, values);
  };

  /* Point blanc relevé sur l'animation, et non posé en dur.
     Le remplissage de GlyphSlot est un gris à 77,6 %, pas un blanc : pris tel
     quel, aucune LED n'atteindrait jamais la pleine luminosité et la matrice
     paraîtrait voilée. Un autre toy exportera peut-être du blanc pur. Sonder
     quelques trames coûte quelques millisecondes une fois pour toutes et évite
     d'écrire la constante d'un fichier particulier dans le noyau commun. */
  let white = 0;
  for (let k = 0; k < PRESCAN; k++) {
    const p = peakAt((k / PRESCAN) * total);
    if (p > white) white = p;
  }
  const gain = 1 / Math.max(WHITE_FLOOR, white);

  return {
    duration: total / rate,

    frameAt(t: number): Frame {
      // `%` sur un `t` négatif rendrait une trame hors plage : on replie d'abord.
      const d = total / rate;
      const wrapped = d > 0 ? ((t % d) + d) % d : 0;
      peakAt(wrapped * rate);
      for (const i of device.inside) {
        const v = values[i] * gain;
        values[i] = v > 1 ? 1 : v;
      }
      return frameOf(device, values);
    },

    destroy() {
      anim.destroy();
    },
  };
}

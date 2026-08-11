/**
 * Le dé : orientation, cinématique du jet, fenêtres d'écoute.
 *
 * Un seul objet, une seule commande. Le toy n'a rien à régler et rien à
 * afficher d'autre — d'où le nom. Ce qui se joue tient dans trois décisions :
 *
 * 1. **Le dé est un solide, pas une image de dé.** L'orientation est un
 *    quaternion et la face lue est celle que la géométrie met vers le haut. Un
 *    jeu de six sprites aurait été plus court, mais il aurait fallu inventer une
 *    culbute qui *ressemble* à un dé qui tourne, et la culbute est tout le toy.
 *
 * 2. **La caméra fait partie de l'animation.** Sur 25 LEDs de côté, un dé vu de
 *    trois quarts ne se lit pas : les pips de la face du dessus tombent sur cinq
 *    cellules écrasées et un 6 devient deux barres. La position de repos est donc
 *    le **gros plan à la verticale**, où la face remplit le hublot ; les trois
 *    quarts n'existent que pendant le vol, quand il n'y a rien à lire. Le jet
 *    recule la caméra, la pose la ramène : le zoom n'est pas un effet posé à la
 *    fin, c'est la boucle.
 *
 * 3. **Le jet n'écoute pas tout le temps.** Voir `verdict` plus bas.
 *
 * `render.ts` ne connaît de tout ça que la `View` : une orientation, une
 * position, une caméra. Il ne sait pas qu'il y a un jet en cours.
 */

import { UP, cross, dot, norm, type Die, type Vec3 } from "./solids";

/* ------------------------------- quaternions ------------------------------- */

/** `[x, y, z, w]`, unitaire. Repère du dé → monde. */
export type Quat = [number, number, number, number];

/** 3 × 3 en ligne d'abord — `m[3r + c]`. */
export type Mat3 = Float64Array;

export const qId: Quat = [0, 0, 0, 1];

/**
 * `a ∘ b` : la rotation `b`, puis la rotation `a`.
 *
 * Un dé qui rebondit change d'axe à chaque contact, et c'est exactement ce
 * qu'un quaternion compose sans se coincer. Les angles d'Euler bloqueraient au
 * cardan sur le dé posé à plat — pile la position qu'on regarde le plus.
 */
export function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qAxis(axis: Vec3, ang: number): Quat {
  const h = ang / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/**
 * Interpolation sur l'arc. Le signe est recalé d'abord : deux quaternions
 * opposés désignent la même orientation, et sans ce recalage le dé prend le
 * chemin long — un tour complet là où un huitième de tour suffisait.
 */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    d = -d;
  }
  // Presque colinéaires : l'arc est plus court que la précision du sinus, on
  // interpole droit et on renormalise.
  if (d > 0.9995) {
    const q: Quat = [
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ];
    // Pas `Math.hypot` : voir `len` dans `solids.ts` — il n'est pas reproductible
    // d'une plateforme à l'autre, et ce port se compare au bit près.
    const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function qMat(q: Quat): Mat3 {
  const [x, y, z, w] = q;
  const m = new Float64Array(9);
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y - w * z);
  m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z);
  m[4] = 1 - 2 * (x * x + z * z);
  m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y);
  m[7] = 2 * (y * z + w * x);
  m[8] = 1 - 2 * (x * x + y * y);
  return m;
}

/** Le vecteur `v` du monde, exprimé dans le repère du dé — donc `Mᵗ · v`. */
export function toLocal(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

/** Le vecteur `v` du dé, exprimé dans le monde — donc `M · v`. */
export function toWorld(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/* ---------------------------------- le dé ---------------------------------- */

/** La rotation qui amène la direction `n` du dé sur la verticale du monde. */
function upright(n: Vec3): Quat {
  const c = dot(n, UP);
  if (c > 0.99999) return qId;
  // Déjà à l'envers : n'importe quel axe horizontal fait l'affaire.
  if (c < -0.99999) return qAxis([1, 0, 0], Math.PI);
  return qAxis(norm(cross(n, UP)), Math.acos(c));
}

/**
 * Une orientation **posée** : la face qui porte `v` vers le haut, tournée d'un
 * cran `twist` autour de la verticale.
 *
 * Le cran ne change pas ce qu'on lit. Les marques sont tamponnées à l'écran, donc
 * toujours droites, et les six motifs de pips du d6 sont de toute façon
 * symétriques au quart de tour — deux rangées de trois valent deux colonnes de
 * trois sur n'importe quel dé du commerce. Ce qu'il change, ce sont les faces
 * latérales visibles pendant le vol, et c'est tout ce qu'on lui demande : sans
 * lui, le dé repart toujours dans la même pose et la culbute se répète.
 *
 * « Vers le haut » veut dire : **la face qui regarde la caméra du gros plan**. Le
 * dé flotte dans le noir, il n'y a ni table ni dessous, et les quatre solides
 * retenus se lisent tous ainsi. C'est ce qui a écarté le d4 du jeu — un tétraèdre
 * posé présente un sommet en l'air, et un vrai d4 se lit sur sa face du dessous ;
 * il aurait fallu une règle rien que pour lui.
 */
export function restQuat(die: Die, v: number, twist: number): Quat {
  const f = die.face.find((x) => x.value === v) ?? die.face[0];
  return qMul(qAxis(UP, (twist * 2 * Math.PI) / die.spin), upright(f.n));
}

/**
 * L'indice de la face tournée vers le haut, dans une orientation déjà matricée.
 *
 * Trois endroits en ont besoin et doivent tomber d'accord : la relecture du
 * résultat, le recentrage de la caméra, et le tampon de la marque dans
 * `render.ts`. C'est la même question posée trois fois — « quelle face le dé
 * montre-t-il ? » — et il n'y en a qu'une réponse écrite ici. Deux critères
 * voisins, l'un dans le rendu et l'autre dans la caméra, c'est un dé qui écrit un
 * nombre à côté du chiffre qu'il vise.
 *
 * `M · n` projeté sur la verticale, c'est-à-dire la deuxième ligne de `M`.
 */
export function topIndex(die: Die, m: Mat3): number {
  let best = 0;
  let bestUp = -Infinity;
  for (let i = 0; i < die.face.length; i++) {
    const n = die.face[i].n;
    const up = m[3] * n[0] + m[4] * n[1] + m[5] * n[2];
    if (up > bestUp) {
      bestUp = up;
      best = i;
    }
  }
  return best;
}

/** La face tournée vers le haut, relue de l'orientation et non du tirage. */
export function topFace(die: Die, q: Quat): number {
  return die.face[topIndex(die, qMat(q))].value;
}

/* ------------------------------- la caméra -------------------------------- */

export type Cam = {
  /** Azimut, radians. */
  yaw: number;
  /** Élévation au-dessus du plan de la table, radians. */
  elev: number;
  /** Demi-largeur du champ, en unités de dé, ramenée au rayon du hublot. */
  half: number;
  /**
   * Où l'on en est du rapprochement : `0` en vol, `1` posé.
   *
   * Les trois autres champs suffisent à tracer l'image, celui-ci dit **ce que la
   * caméra est en train de faire**. Le rendu s'en sert pour n'imprimer les nombres
   * qu'au gros plan — voir `REVEAL_OFF` dans `render.ts`. Il pourrait le déduire de
   * `half`, en le comparant au cadrage large et au `close` du dé, mais ce serait
   * reconstruire par calcul une chose que l'appelant sait déjà.
   */
  z: number;
};

const D2R = Math.PI / 180;

/**
 * Le vol : trois quarts, de loin.
 *
 * Un champ de 2,25 unités de dé, et non les 2,55 qu'il faudrait pour garantir
 * que rien ne sorte jamais du hublot. À 2,55 le cube ne fait plus que onze
 * cellules de large au milieu d'un disque de vingt-cinq, et un dé perdu dans sa
 * fenêtre ne culbute pas, il flotte. À 2,25 il en fait treize à quinze, et il
 * arrive qu'un coin passe derrière la découpe au sommet du premier rebond — soit
 * exactement ce que fait un objet qui saute devant une fenêtre ronde.
 */
const WIDE = { yaw: 35 * D2R, elev: 40 * D2R, half: 2.25 };

/**
 * Le repos : la face du dessus, à l'aplomb, débordant du hublot. Le demi-champ,
 * lui, vient du dé — voir `close` dans `solids.ts`, la face d'un icosaèdre est deux fois
 * plus petite que celle d'un cube à solide égal.
 *
 * 84° et non 90° : le dernier degré et demi laisse un liseré de la face avant,
 * ce qui dit qu'on regarde un solide et pas une carte. À 90° le dé devient un
 * carré de pips, et un carré de pips ne culbute pas.
 */
const CLOSE = { yaw: 0, elev: 84 * D2R };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * **Une marque ne s'imprime qu'au gros plan**, et jamais pendant le vol — pips du
 * d6 compris.
 *
 * Le raisonnement est venu par les chiffres. En vol un nombre tombe sur une face de
 * trois quarts, à moitié rogné par une arête : ce qu'on lit n'est pas un nombre mais
 * une tache qui y ressemble, et il en passe un différent à chaque rebond — le dé a
 * l'air d'annoncer des résultats qu'il ne donne pas.
 *
 * Les pips ont tenu un temps comme exception, au motif qu'un pip qui culbute reste un
 * pip et que c'est ce qui fait lire un dé. C'est vrai en soi et faux dans le lot : le
 * d6 était alors le seul dé à porter quelque chose en vol, donc le seul à culbuter
 * *plein* quand les trois autres culbutent en carcasse. Une même cinématique lue de
 * deux façons selon le solide, ça n'a plus l'air d'une règle, ça a l'air d'un oubli.
 * Les quatre dés volent donc nus et se lisent au gros plan.
 *
 * Le seuil porte sur le rapprochement de la caméra et non sur l'inclinaison de la
 * face : la marque monte au milieu du zoom et vite — commencée 240 ms après la pose,
 * pleine à 380 ms, et pleine pour les 220 ms de gros plan qui restent. Le départ est
 * bien plus sec, et c'est le recul de la caméra qui le veut : à la puissance cinq,
 * `z` a franchi le seuil au bout de **vingt-cinq millisecondes**. La marque ne
 * s'attarde pas sur un dé qui part, elle s'éteint.
 *
 * Les seuils vivent ici et non dans `render.ts`, parce que la caméra s'en sert
 * aussi : le recentrage de la face est réglé sur `REVEAL_FULL`, et c'est ce qui
 * **fixe** la marque. Une fois le recentrage terminé, le centre de la face lue tombe
 * exactement au milieu du hublot quelle que soit l'élévation — le nombre n'a donc
 * plus une seule cellule à bouger, alors qu'avec un recentrage étalé sur tout le zoom
 * il glissait encore d'une cellule et demie après être devenu plein, deux pas d'une
 * cellule dans les soixante-dix dernières millisecondes.
 *
 * Une seule constante pour les deux, et le rapport est le bon dans ce sens-là : **la
 * face est arrivée au milieu avant que son nombre finisse de s'allumer.**
 */
export const REVEAL_OFF = 0.35;
export const REVEAL_FULL = 0.7;

/** `z = 0` en vol, `z = 1` posé. */
export function camAt(z: number, close: number): Cam {
  return {
    yaw: mix(WIDE.yaw, CLOSE.yaw, z),
    elev: mix(WIDE.elev, CLOSE.elev, z),
    half: mix(WIDE.half, close, z),
    z,
  };
}

/* ------------------------------- le calendrier ----------------------------- */

/**
 * Les contacts avec la table, en secondes depuis le jet. Le premier est le
 * lancer lui-même. Les intervalles se resserrent et les hauteurs s'écrasent,
 * comme n'importe quoi qui rebondit.
 */
const CONTACT = [0, 0.42, 0.78, 1.06, 1.28, 1.45, 1.58];
/** Sommet de chaque vol, en unités de dé (le dé fait 2 de côté). */
const PEAK = [0.38, 0.21, 0.12, 0.07, 0.04, 0.02];

/** Fin de l'impulsion : la caméra a fini de reculer, le dé est en l'air. */
export const T_TOSS = 0.35;
/** Dernier rebond — au-delà, le dé roule et ne saute plus. */
export const T_BRAKE = CONTACT[CONTACT.length - 1];
/** Le dé est posé. */
export const T_LAND = 2.55;
/** Durée du gros plan de révélation. */
export const T_ZOOM = 0.6;
/** Fin de l'animation : le dé est posé **et** lisible. */
export const T_END = T_LAND + T_ZOOM;

/** Vitesse de culbute au départ, radians par seconde. */
const RATE0 = 15;
/** Ce qu'un rebond garde de la vitesse précédente. */
const RATE_KEEP = 0.78;
/** Montée en régime de la rotation, le temps que la caméra recule. */
const RAMP = 0.14;
/** Excursion latérale maximale, en unités de dé. */
const DRIFT = 0.35;

/** Le dernier balancement, quand le dé bascule sur son arête avant de se poser. */
const ROCK_A = 0.09;
const ROCK_W = 24;
const ROCK_DAMP = 9;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const u = clamp01(v);
  return u * u * (3 - 2 * u);
};
/**
 * Le recul de la caméra au jet, et il est **brutal** : à la puissance cinq, les
 * quatre cinquièmes du chemin sont faits en cent millisecondes. Ce qui est fui
 * n'est pas la lenteur mais le cadrage de départ — un cube en gros plan qui se
 * met à tourner montre trois faces pleines de pips à la fois et devient une
 * bouillie. Il faut l'éloigner avant qu'il ait pris de la vitesse.
 */
const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 5);

/* --------------------------------- le jet ---------------------------------- */

type SegKind = "ramp" | "spin" | "decay";

type Seg = {
  t0: number;
  t1: number;
  axis: Vec3;
  /** Radians par seconde sur le segment. */
  rate: number;
  kind: SegKind;
  /** Orientation à `t0`, accumulée à la construction du plan. */
  q0: Quat;
};

type Hop = { t0: number; t1: number; peak: number };

/**
 * Le plan d'un jet, calculé une fois au lancement.
 *
 * Même parti pris que la machine à sous du portail : le hasard est tiré au
 * départ et la suite est une fonction du temps. Une simulation intégrée image
 * par image dépendrait de la cadence d'affichage — le dé tomberait sur une
 * autre face à 120 Hz qu'à 60 — et ne pourrait pas être rejouée pour une
 * vignette.
 */
export type Throw = {
  /** Face tirée, 1..6. Connue dès le départ ; l'animation l'y conduit. */
  value: number;
  q0: Quat;
  qEnd: Quat;
  segs: Seg[];
  hops: Hop[];
  /** Instants où l'image tressaute d'une cellule — les contacts appuyés. */
  bumps: number[];
  drift: Vec3;
  /** Axe du dernier balancement. */
  rock: Vec3;
};

/** Un axe de culbute franchement couché : un dé qui tourne sur la verticale ne
    culbute pas, il pivote, et la face du dessus ne change jamais. */
function tumbleAxis(rnd: () => number): Vec3 {
  return norm([rnd() * 2 - 1, (rnd() * 2 - 1) * 0.35, rnd() * 2 - 1]);
}

export function drawValue(die: Die, rnd: () => number = Math.random): number {
  return 1 + Math.floor(rnd() * die.faces);
}

export function makeThrow(
  die: Die,
  q0: Quat,
  value: number,
  rnd: () => number = Math.random,
): Throw {
  const segs: Seg[] = [];
  let q = q0;

  for (let k = 0; k + 1 < CONTACT.length; k++) {
    const t0 = CONTACT[k];
    const t1 = CONTACT[k + 1];
    const axis = tumbleAxis(rnd);
    const rate = RATE0 * Math.pow(RATE_KEEP, k);
    segs.push({ t0, t1, axis, rate, kind: k === 0 ? "ramp" : "spin", q0: q });
    q = qMul(qAxis(axis, rate * (t1 - t0)), q);
  }

  /* Le roulé final : plus de rebond, une vitesse qui tombe à zéro au moment de
     la pose. C'est cette trajectoire-là que la mise en place vient corriger. */
  const rate = RATE0 * Math.pow(RATE_KEEP, CONTACT.length - 1);
  segs.push({ t0: T_BRAKE, t1: T_LAND, axis: tumbleAxis(rnd), rate, kind: "decay", q0: q });

  const hops: Hop[] = PEAK.map((peak, k) => ({ t0: CONTACT[k], t1: CONTACT[k + 1], peak }));

  const a = rnd() * Math.PI * 2;
  return {
    value,
    q0,
    qEnd: restQuat(die, value, Math.floor(rnd() * die.spin)),
    segs,
    hops,
    bumps: [CONTACT[1], CONTACT[2]],
    drift: [Math.cos(a) * DRIFT, 0, Math.sin(a) * DRIFT],
    rock: norm([Math.cos(a + 1.2), 0, Math.sin(a + 1.2)]),
  };
}

/** La culbute libre, sans correction : la trajectoire que le dé suivrait. */
function freeAt(th: Throw, t: number): Quat {
  let seg = th.segs[0];
  for (const s of th.segs) if (t >= s.t0) seg = s;

  const s = Math.min(t, seg.t1) - seg.t0;
  let ang: number;
  if (seg.kind === "ramp") ang = seg.rate * s * smooth(s / RAMP);
  else if (seg.kind === "decay") {
    const tau = seg.t1 - seg.t0;
    ang = seg.rate * (s - (s * s) / (2 * tau));
  } else ang = seg.rate * s;

  return qMul(qAxis(seg.axis, ang), seg.q0);
}

/**
 * L'orientation à l'instant `t`.
 *
 * Le point délicat est la mise en place. Freiner puis interpoler vers la pose
 * finale donne un dé qui *vise* : il tourne, s'arrête net, puis glisse vers sa
 * face. Ici la culbute libre continue jusqu'à s'éteindre d'elle-même, et la
 * correction vers la pose est mélangée par-dessus avec un poids qui part de
 * zéro. Aux deux bouts la vitesse est celle de la trajectoire libre, il n'y a
 * donc aucun instant où la trajectoire se voit reprise en main.
 */
export function orientationAt(th: Throw, t: number): Quat {
  if (t >= T_LAND) {
    const s = t - T_LAND;
    const a = ROCK_A * Math.exp(-ROCK_DAMP * s) * Math.sin(ROCK_W * s);
    return qMul(qAxis(th.rock, a), th.qEnd);
  }
  const free = freeAt(th, t);
  if (t <= T_BRAKE) return free;
  const u = (t - T_BRAKE) / (T_LAND - T_BRAKE);
  const w = smooth(u) * smooth(u);
  return qSlerp(free, th.qEnd, w);
}

export function heightAt(th: Throw, t: number): number {
  for (const h of th.hops) {
    if (t < h.t0 || t >= h.t1) continue;
    const u = (t - h.t0) / (h.t1 - h.t0);
    return 4 * h.peak * u * (1 - u);
  }
  return 0;
}

/**
 * La position du centre du dé.
 *
 * Le dé part du centre et y revient. C'est faux — un dé jeté finit ailleurs —
 * et c'est assumé : les deux bouts de l'animation sont cadrés au plus près, et
 * un dé qui se pose hors du hublot n'a pas de face à révéler. Ce que l'excursion
 * doit rendre, c'est qu'il a été jeté, pas où il a atterri.
 */
export function posAt(th: Throw, t: number): Vec3 {
  const u = clamp01(t / T_LAND);
  const f = 4 * u * (1 - u);
  return [th.drift[0] * f, heightAt(th, t), th.drift[2] * f];
}

/** Recul et retour de la caméra. 0 = trois quarts de loin, 1 = gros plan. */
export function zoomAt(t: number): number {
  if (t < 0) return 1;
  if (t < T_TOSS) return 1 - easeOut(t / T_TOSS);
  if (t < T_LAND) return 0;
  if (t < T_END) return smooth((t - T_LAND) / T_ZOOM);
  return 1;
}

/**
 * L'opacité de la marque, tirée du seul rapprochement — voir `REVEAL_OFF`.
 *
 * Bande étroite et non un fondu sur toute la durée du zoom : ce qui porte
 * l'information est plein, une marque à mi-teinte pendant six cents millisecondes
 * serait un gris qui prétend dire un nombre.
 */
export function revealAt(z: number): number {
  if (z <= REVEAL_OFF) return 0;
  if (z >= REVEAL_FULL) return 1;
  return smooth((z - REVEAL_OFF) / (REVEAL_FULL - REVEAL_OFF));
}

/**
 * Le tressaut d'impact : **une cellule entière**, jamais un décalage de canvas.
 * Les LEDs d'une Glyph Matrix sont soudées — ce qui bouge, c'est ce qu'on y
 * écrit. Même règle que la secousse du jackpot de GlyphSlot, pour la même raison.
 */
export function joltAt(th: Throw, t: number): [number, number] | null {
  const s = t - T_LAND;
  if (s >= 0 && s < 0.05) return [0, -1];
  if (s >= 0.05 && s < 0.1) return [0, 1];
  for (const b of th.bumps) if (t >= b && t < b + 0.04) return [0, -1];
  return null;
}

/* ---------------------------------- la vue --------------------------------- */

/** Tout ce que le rendu a besoin de savoir. Il ignore qu'un jet existe. */
export type View = {
  q: Quat;
  pos: Vec3;
  cam: Cam;
  jolt: [number, number] | null;
};

/**
 * Le décalage qui amène le centre de la face lue sur celui du hublot.
 *
 * La caméra vise le centre du dé, ce qui suffit aux solides réguliers : le
 * centre d'un carré ou d'un triangle équilatéral est sur l'axe de sa normale, il
 * tombe donc pile au milieu quand la face est en haut. Le cerf-volant d'un d10
 * n'a pas cette politesse — son centre est décalé de près d'une demi-unité de
 * dé sur le côté, soit cinq cellules au gros plan, et le chiffre partait se
 * coller dans un coin du hublot.
 *
 * Le décalage est pesé par le rapprochement : nul en vol, où c'est le solide
 * entier qu'on regarde, entier au gros plan, où c'est la face. Mais il est
 * **terminé à `REVEAL_FULL`** et non à `z = 1`, ce qui ne change presque rien au
 * mouvement — la glissade se fait en 380 ms au lieu de 600 — et change tout à la
 * marque : une fois le décalage entier, le centre de la face tombe exactement au
 * milieu du hublot, donc le nombre est **fixe** pendant tout le temps où il est
 * plein. Réglé sur `z = 1`, il finissait sa course sous les yeux du lecteur.
 */
function centering(die: Die, q: Quat, z: number): Vec3 {
  const w = smooth(z / REVEAL_FULL);
  if (w <= 0) return [0, 0, 0];
  const m = qMat(q);
  const c = toWorld(m, die.face[topIndex(die, m)].c);
  return [-w * c[0], -w * c[1], -w * c[2]];
}

export function viewAt(die: Die, th: Throw, t: number): View {
  const q = orientationAt(th, t);
  const z = zoomAt(t);
  const p = posAt(th, t);
  const off = centering(die, q, z);
  return {
    q,
    pos: [p[0] + off[0], p[1] + off[1], p[2] + off[2]],
    cam: camAt(z, die.close),
    jolt: joltAt(th, t),
  };
}

export function restingView(die: Die, q: Quat): View {
  return { q, pos: centering(die, q, 1), cam: camAt(1, die.close), jolt: null };
}

/* ------------------------------ l'écoute ---------------------------------- */

/** L'étape lisible, pour l'affichage. */
export type Stage = "rest" | "toss" | "tumble" | "brake" | "read";

export function stageAt(t: number | null): Stage {
  if (t === null || t >= T_END) return "rest";
  if (t < T_TOSS) return "toss";
  if (t < T_BRAKE) return "tumble";
  if (t < T_LAND) return "brake";
  return "read";
}

/**
 * Fenêtre morte du départ. On vient de jeter : la caméra recule encore et le dé
 * n'est pas retombé une seule fois. Une secousse ici n'est pas une intention,
 * c'est la fin du geste précédent — le poignet qui revient. La compter ferait du
 * toy un bouton qui se déclenche deux fois.
 */
export const DEAD_HEAD = T_TOSS;

/**
 * Fenêtre morte de l'arrivée. Le dé est en train de choisir sa face. Relancer
 * là, c'est effacer un résultat qui n'a jamais été montré : on aurait un toy
 * qu'on peut secouer sans fin sans jamais rien lire, ce qui est exactement ce
 * qu'un dé n'est pas.
 */
export const DEAD_TAIL = 0.45;

export type Verdict = "ok" | "too-early" | "too-late" | "reading";

/**
 * Le jet est-il relançable ? `null` = dé posé.
 *
 * Deux états acceptent : **posé** et **au milieu du vol**. Le milieu du vol
 * compte parce qu'un dé encore en l'air n'a pas de résultat à effacer — une
 * seconde secousse le renvoie en l'air, ce qui est précisément ce qu'une main
 * fait quand le jet lui déplaît.
 */
export function verdict(t: number | null): Verdict {
  if (t === null) return "ok";
  if (t < DEAD_HEAD) return "too-early";
  if (t < T_LAND - DEAD_TAIL) return "ok";
  if (t < T_LAND) return "too-late";
  if (t < T_END) return "reading";
  return "ok";
}

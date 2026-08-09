/**
 * Le format de dessin du Glyph Museum — https://glyphmuseum.com/developers.
 *
 * Un dessin est un objet JSON portant une version de format et une liste
 * ordonnée de trames. Une trame = un dessin fixe, plusieurs = une animation.
 *
 *     { "v": 1, "frames": [ { "d": 200, "p": [0, 0, 80, …] }, … ] }
 *
 * - `v` identifie l'appareil visé : 1 pour le Phone (3), 4 pour le (4a) Pro.
 * - `p` porte les consignes 0-255 **des seules LEDs du disque**, dans l'ordre de
 *   lecture — ligne par ligne, de gauche à droite. 489 valeurs sur un (3), 137
 *   sur un (4a) Pro. C'est exactement l'ordre de `device.inside`, qui est bâti
 *   row-major et masqué par le même disque : les deux comptes publiés tombent
 *   juste avec notre seule formule (voir `matrix.ts`), et le profil de rangées
 *   qui en sort est celui de l'appareil.
 * - `d` est la durée d'affichage de la trame en millisecondes, facultative.
 *
 * **Ce n'est pas l'IntArray du SDK.** Celui-ci est carré et long de `size²` —
 * 625 sur un (3) — coins compris. Le passage de l'un à l'autre est le seul
 * travail de ce module, avec le repliage du temps sur la boucle.
 *
 * Ce que le format demande à un lecteur, et qui est tenu ici :
 * - ignorer les clés inconnues plutôt que refuser le fichier ;
 * - ne jamais faire échouer une lecture sur une attribution absente ou abîmée ;
 * - **repasser le bloc `meta` tel quel** quand on ré-enregistre un dessin. D'où
 *   `carryMeta`, et le fait que `meta` ne soit ni normalisé ni reconstruit.
 */

import { DEVICES, type Device, type DeviceId } from "./devices";
import { frameOf, toBytes, type Frame } from "./frame";
import type { MatrixSampler } from "./lottieFrame";

/** Attribution. Facultative, et jamais exigée d'un fichier entrant. */
export type DesignMeta = {
  /** Pseudo du créateur, sans l'arobase. */
  author?: string;
  /** Identifiant du post d'origine — fait foi contre `url` s'ils divergent. */
  postId?: string;
  /** Lien canonique, ouvrable dans un navigateur. */
  url?: string;
};

export type DesignFrame = {
  /** Consignes 0-255, LEDs du disque dans l'ordre de lecture. */
  p: number[];
  /** Durée d'affichage en millisecondes. */
  d?: number;
};

export type Design = {
  v: number;
  frames: DesignFrame[];
  meta?: DesignMeta;
};

/**
 * Version de format par appareil. Ce n'est pas un numéro de révision qui
 * s'incrémenterait : c'est l'identifiant de la matrice visée, et c'est pour ça
 * qu'il saute de 1 à 4.
 */
export const DESIGN_V: Record<DeviceId, number> = { phone3: 1, phone4apro: 4 };

/**
 * Durée d'une trame qui n'en déclare pas.
 *
 * La spécification dit « ~100 ms par défaut dans une animation » sans l'imposer.
 * Une valeur fixe est préférable à un calcul : sans elle, un fichier dont une
 * seule trame porte `d` se jouerait à deux cadences.
 */
export const DEFAULT_FRAME_MS = 100;

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */

/**
 * Est-ce un dessin du Glyph Museum ?
 *
 * Testé sur la **forme** et non sur une clé de marque : le format n'en porte
 * aucune. `v` numérique et au moins une trame dont `p` est un tableau suffisent
 * à le distinguer d'un Lottie, qui a lui aussi une clé `v` — mais en chaîne
 * (`"5.7.4"`) et sans `frames`.
 */
export function isDesign(data: unknown): data is Design {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Partial<Design>;
  return (
    typeof d.v === "number" &&
    Array.isArray(d.frames) &&
    d.frames.length > 0 &&
    Array.isArray(d.frames[0]?.p)
  );
}

/**
 * L'appareil d'un dessin, déduit de la **longueur de `p`** et non de `v`.
 *
 * C'est ce que dit la spécification — « array length alone identifies
 * resolution » — et c'est le bon choix : `v` est une étiquette qu'un fichier
 * recopié peut porter à tort, la longueur est une contrainte que le contenu ne
 * peut pas trahir. Rien ne rend un dessin dont aucun appareil n'a le compte de
 * LEDs : le jouer sur une autre grille décalerait toute la matrice d'un cran par
 * rangée.
 */
export function deviceForDesign(design: Design): Device | null {
  const n = design.frames[0].p.length;
  return DEVICES.find((d) => d.ledCount === n) ?? null;
}

/** Consigne 0-255 → 0..1, bornée. Un fichier édité à la main peut mentir. */
const level = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 255 ? 1 : n / 255;
};

/**
 * Écrit une trame du dessin dans un tableau de valeurs à la géométrie de
 * l'appareil. Les cellules hors disque restent à zéro — elles n'existent pas
 * dans `p`, et le rendu ne les regarde pas.
 */
function expand(device: Device, p: number[], out: Float32Array): void {
  const { inside } = device;
  for (let k = 0; k < inside.length; k++) out[inside[k]] = level(p[k]);
}

/**
 * Un dessin joué comme une animation.
 *
 * Même contrat que `lottieSampler` — c'est ce qui permet à une préview de
 * consommer les deux sans savoir lequel elle a reçu : `frameAt` réutilise son
 * tableau de valeurs d'un appel à l'autre, la trame rendue est donc à consommer
 * avant le prochain appel.
 *
 * Les trames sont dépliées une fois pour toutes à la construction, et non
 * relues à chaque appel : un dessin de (3) tient en 489 octets par trame, la
 * dépense mémoire est dérisoire devant le coût d'une conversion trente fois par
 * seconde.
 *
 * L'index de trame est trouvé par **recherche linéaire sur les cumuls**, sans
 * table de recherche : les durées sont libres — une animation peut poser 200 ms
 * sur une trame et 30 sur la suivante — donc il n'y a pas de cadence commune sur
 * laquelle indexer, et une animation de dessin compte quelques dizaines de
 * trames, pas quelques milliers.
 */
export function designSampler(design: Design, device: Device): MatrixSampler {
  const frames = design.frames;

  /* Les valeurs de chaque trame, prêtes à peindre. */
  const banks = frames.map((f) => {
    const v = new Float32Array(device.cells);
    expand(device, Array.isArray(f.p) ? f.p : [], v);
    return v;
  });

  /* Fin de chaque trame sur la boucle, en secondes. Une durée absente ou
     aberrante retombe sur le défaut : une trame de durée nulle serait
     inatteignable et casserait la recherche. */
  const ends: number[] = [];
  let acc = 0;
  for (const f of frames) {
    const ms = Number(f.d);
    acc += (Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_FRAME_MS) / 1000;
    ends.push(acc);
  }
  const duration = acc;

  /* Tableau de sortie unique, recopié depuis la banque de la trame courante.
     `frameOf` recompte `lit` et `mean` à chaque appel — les préviews ne s'en
     servent pas, mais le contrat de `Frame` dit qu'ils sont justes. */
  const out = new Float32Array(device.cells);

  return {
    duration,

    frameAt(t: number): Frame {
      const wrapped = duration > 0 ? ((t % duration) + duration) % duration : 0;
      let i = 0;
      while (i < ends.length - 1 && wrapped >= ends[i]) i++;
      out.set(banks[i]);
      return frameOf(device, out);
    },

    destroy() {
      /* Rien à libérer : aucun moteur externe, aucun canvas, aucun écouteur.
         La méthode existe pour que le type reste interchangeable avec celui du
         Lottie, dont le lecteur, lui, a bien quelque chose à détruire. */
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Écriture                                                                    */

/** Les LEDs du disque, dans l'ordre de lecture, en consignes 0-255. */
export function toDesignFrame(frame: Frame, ms?: number): DesignFrame {
  const bytes = toBytes(frame);
  const p = frame.device.inside.map((i) => bytes[i]);
  return ms === undefined ? { p } : { d: ms, p };
}

/**
 * Emballe une ou plusieurs trames en dessin.
 *
 * Toutes doivent venir du même appareil : un dessin porte **une** version de
 * format, donc une seule matrice. La première décide, et c'est une erreur si
 * une autre ne suit pas — un fichier mêlant deux longueurs de `p` serait accepté
 * par la sérialisation et illisible par tout le monde.
 *
 * `meta` est repassé tel quel, jamais reconstruit : c'est l'attribution du
 * créateur d'origine, et un outil qui ré-enregistre un dessin ne doit pas la
 * réécrire.
 */
export function toDesign(
  frames: Frame | Frame[],
  opts: { ms?: number; meta?: DesignMeta } = {},
): Design {
  const list = Array.isArray(frames) ? frames : [frames];
  if (list.length === 0) throw new Error("un dessin porte au moins une trame");

  const device = list[0].device;
  if (list.some((f) => f.device.id !== device.id))
    throw new Error("toutes les trames d'un dessin viennent du même appareil");

  /* Une trame seule est un dessin fixe : pas de durée, elle ne veut rien dire
     hors d'une animation. */
  const ms = list.length > 1 ? (opts.ms ?? DEFAULT_FRAME_MS) : undefined;

  const design: Design = { v: DESIGN_V[device.id], frames: list.map((f) => toDesignFrame(f, ms)) };
  if (opts.meta) design.meta = opts.meta;
  return design;
}

/**
 * Le bloc `meta` d'un fichier entrant, à repasser tel quel dans ce qu'on
 * ré-enregistre.
 *
 * Validé champ par champ et jamais en bloc : la spécification demande de jeter
 * ce qui est abîmé, pas le fichier. Un `meta` absent, d'un autre type ou
 * entièrement invalide rend `undefined` — c'est-à-dire « pas d'attribution », ce
 * qui reste un dessin parfaitement valide.
 */
export function carryMeta(raw: unknown): DesignMeta | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const src = raw as Record<string, unknown>;
  const out: DesignMeta = {};
  for (const k of ["author", "postId", "url"] as const) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

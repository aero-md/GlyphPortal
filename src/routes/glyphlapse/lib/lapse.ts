/**
 * Décomposition calendaire — miroir de `java.time` côté toy.
 *
 * L'écart entre deux instants n'est pas une durée en secondes déguisée : deux
 * mois font 59, 60 ou 62 jours selon lesquels, et une année en fait 365 ou 366.
 * On compte donc en avançant de mois en mois sur le calendrier, exactement comme
 * `Period.between` — d'où `addMonthsClamped`, qui ramène le 31 sur le dernier
 * jour d'un mois qui n'en a pas.
 */

export type Direction = "since" | "until";

export type Breakdown = {
  dir: Direction;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Écart total en jours entiers, pour le format « Jours ». */
  totalDays: number;
};

/** Ajoute `n` mois en ramenant le quantième au dernier jour du mois d'arrivée. */
export function addMonthsClamped(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const dim = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, dim));
  return r;
}

export function breakdown(refMs: number, nowMs: number): Breakdown {
  const dir: Direction = nowMs >= refMs ? "since" : "until";
  const a0 = new Date(Math.min(refMs, nowMs));
  const b = new Date(Math.max(refMs, nowMs));

  let a = new Date(a0);
  let years = 0;
  let months = 0;
  while (addMonthsClamped(a, 12) <= b) {
    a = addMonthsClamped(a, 12);
    years++;
  }
  while (addMonthsClamped(a, 1) <= b) {
    a = addMonthsClamped(a, 1);
    months++;
  }

  let s = Math.floor((b.getTime() - a.getTime()) / 1000);
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  const seconds = s - minutes * 60;

  return {
    dir,
    years,
    months,
    days,
    hours,
    minutes,
    seconds,
    totalDays: Math.floor((b.getTime() - a0.getTime()) / 86400000),
  };
}

/**
 * Une unité affichable : son suffixe collé au nombre, son étiquette en 5×7, son
 * étiquette en toutes lettres pour le format Cycle, et sa valeur.
 */
export type Unit = { inline: string; short: string; long: string; value: number };

/**
 * Les unités pertinentes, secondes exclues — elles sont portées par l'anneau ou
 * le sablier, pas par le texte.
 *
 * On coupe en tête tant que l'unité vaut zéro : afficher « 0A 0M 3J » gâche deux
 * lignes de disque pour dire qu'il ne s'est rien passé. La dernière est gardée
 * même à zéro, sinon un écart de moins d'une minute n'aurait rien à afficher.
 */
export function units(d: Breakdown): Unit[] {
  const all: Unit[] = [
    { inline: "A", short: "A", long: "A", value: d.years },
    { inline: "M", short: "M", long: "M", value: d.months },
    { inline: "J", short: "J", long: "J", value: d.days },
    { inline: "H", short: "H", long: "H", value: d.hours },
    { inline: "'", short: "'", long: "MIN", value: d.minutes },
  ];
  let i = 0;
  while (i < all.length - 1 && all[i].value === 0) i++;
  return all.slice(i);
}

/* -------------------------------------------------------------------------- */
/* Réglages d'un lapse                                                         */
/* -------------------------------------------------------------------------- */

/* Les libellés des quatre mises en page et des deux rendus de la minute sont
   dans `glyphlapse.formats` et `glyphlapse.secondsModes` des dictionnaires de
   langue, dans l'ordre de ces deux types-ci. Ils ne servaient qu'à peupler des
   sélecteurs : le moteur, lui, ne connaît que les indices. */
export type Format = 0 | 1 | 2 | 3;

export type SecondsMode = 0 | 1;

/** Chiffres romains — les trois lapses sont numérotés comme dans l'app. */
export const ROMAN = ["I", "II", "III"] as const;

export type Lapse = {
  /** Instant de référence, en millisecondes epoch. */
  ref: number;
  format: Format;
  sec: SecondsMode;
  /**
   * Dans la rotation de l'appui long. Le lapse I l'est toujours : un toy sans
   * aucun lapse actif n'aurait rien à afficher.
   */
  enabled: boolean;
};

export const LAPSE_COUNT = 3;

/**
 * Les trois lapses de départ.
 *
 * Ils étaient tous les trois en Dense sur le début ou la fin de l'année en
 * cours : trois entrées qui affichaient à peu près la même chose de la même
 * façon, donc trois fois rien à voir. Ceux-ci montrent **trois écarts d'ordres
 * différents dans trois formats différents**, ce qui est ce qu'on demande à un
 * jeu de défauts — donner à voir l'étendue de ce que le toy sait faire sans
 * toucher un réglage.
 *
 *     I    fin d'année, en Jours + sablier    un décompte, J-n qui descend
 *     II   18 avril 2026 23 h, en Cycle       une date au hasard, unité par unité
 *     III  1ᵉʳ janvier 2000, en Dense         un très long écart, granularité complète
 *
 * **Les trois sont actifs**, là où seul le I l'était. C'est la rotation de
 * l'appui long qui en dépend : c'est la seule commande que le système envoie au
 * toy, et avec un seul lapse actif elle ne fait rien. C'est aussi ce que montre
 * la mini-prévisu du sommaire, qui tourne sur ces trois-là — les deux sont
 * générés depuis cette fonction, il n'y a donc pas deux vérités à tenir
 * d'accord.
 *
 * **I est dérivé de l'année en cours, les deux autres sont absolus.** C'est
 * délibéré : « fin d'année » est un décompte qui n'a d'intérêt que sur l'année
 * qu'on vit, alors que l'an 2000 est un repère fixe — et le 18 avril est une date
 * arbitraire, qui n'a de sens que collée à son année.
 */
export function defaultLapses(now = new Date()): Lapse[] {
  const y = now.getFullYear();
  return [
    { ref: new Date(y, 11, 31, 23, 59).getTime(), format: 3, sec: 1, enabled: true },
    // le mois est un **indice**, donc 3 pour avril — pas 4
    { ref: new Date(2026, 3, 18, 23, 0).getTime(), format: 2, sec: 0, enabled: true },
    { ref: new Date(2000, 0, 1).getTime(), format: 0, sec: 0, enabled: true },
  ];
}

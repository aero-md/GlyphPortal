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

export const FORMATS = ["Dense", "Compact", "Cycle", "Jours"] as const;
export type Format = 0 | 1 | 2 | 3;

export const SECONDS_MODES = ["Anneau", "Sablier"] as const;
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
 * Défauts, miroir de `Config.defaultRef` : début d'année pour I et II,
 * 31 décembre 23:59 pour III — donc en mode « jusqu'à ».
 *
 * Seule entorse : le lapse I ouvre sur le sablier, pour le donner à voir
 * d'entrée. Côté toy le défaut reste l'anneau.
 */
export function defaultLapses(now = new Date()): Lapse[] {
  const y = now.getFullYear();
  const startOfYear = new Date(y, 0, 1).getTime();
  const endOfYear = new Date(y, 11, 31, 23, 59).getTime();
  return Array.from({ length: LAPSE_COUNT }, (_, i) => ({
    ref: i === 2 ? endOfYear : startOfYear,
    format: 0 as Format,
    sec: (i === 0 ? 1 : 0) as SecondsMode,
    enabled: i === 0,
  }));
}

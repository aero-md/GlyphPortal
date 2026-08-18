/**
 * La machine : symboles, rouleaux, cinématique. Port de `render/SlotEngine.kt`.
 *
 * Trois rouleaux de sept colonnes défilent verticalement dans une fenêtre de
 * sept lignes centrée sur le disque. Un rouleau n'est pas une liste de symboles
 * tirée au sort à l'arrivée : c'est une bande continue de cinq symboles qui
 * tourne, et l'arrêt consiste à choisir *où* la freiner. C'est ce qui fait qu'on
 * voit passer les voisins du symbole gagnant avant qu'il ne se pose.
 */

/** Colonnes de départ des trois rouleaux — 7 px chacun, 1 px de gouttière. */
export const COLS = [1, 9, 17];
/** Fenêtre de la payline, sept lignes centrées. */
export const PAY_TOP = 9;
export const PAY_BOT = 15;
/** 7 px de symbole plus 2 px de blanc. */
export const SYM_H = 9;
export const STRIP_LEN = 45;

/** Instants d'arrêt des trois rouleaux, en secondes — total ≈ 5 s. */
export const STOPS = [2.6, 3.8, 4.9];
/** Durée de décélération. */
const DECEL = 1.3;
/** Vitesse de plein régime, en lignes par seconde. */
const V = 34;

/* Effet ressort au lancement : le rouleau recule lentement, comme un ressort
   qu'on arme, puis se détend d'un coup. Sans ce recul, le départ est un
   glissement uniforme qui ne dit pas qu'on vient de tirer sur quelque chose. */
const T_PULL = 0.45;
const T_LAUNCH = 0.75;
const PULL = 5;

/** `2` = plein, `1` = demi-teinte, `.` = éteint. */
export const LVL: Record<string, number> = { ".": 0, "1": 0.45, "2": 1 };

export const SPR: Record<string, string[]> = {
  seven: ["2222222", "......2", ".....2.", "....2..", "...2...", "..2....", "..2...."],
  cherry: ["...1...", "..1.1..", ".1...1.", ".2...2.", "222.222", "222.222", ".2...2."],
  bar: ["2222222", "2222222", ".......", "2222222", "2222222", ".......", "2222222"],
  diamond: ["...2...", "..222..", ".22222.", "2222222", ".22222.", "..222..", "...2..."],
  bell: ["...2...", "..222..", ".22222.", ".22222.", ".22222.", "2222222", "...2..."],
};

export const STRIP = ["seven", "cherry", "bar", "diamond", "bell"];

/** Les noms affichables, dans l'ordre de la bande. Le 7 est le jackpot. */
/* Les noms des cinq symboles sont dans `glyphslot.symbols` des dictionnaires de
   langue, dans ce même ordre : c'est un libellé affiché dans le relevé, pas une
   donnée du moteur — lui ne manipule que des indices. */

/* Police 5×7 du bandeau JACKPOT — propre à ce toy, il n'écrit rien d'autre. */
const JK: Record<string, string[]> = {
  J: ["22222", "...2.", "...2.", "...2.", "2..2.", "2..2.", ".22.."],
  A: [".222.", "2...2", "2...2", "22222", "2...2", "2...2", "2...2"],
  C: [".2222", "2....", "2....", "2....", "2....", "2....", ".2222"],
  K: ["2...2", "2..2.", "2.2..", "22...", "2.2..", "2..2.", "2...2"],
  P: ["2222.", "2...2", "2...2", "2222.", "2....", "2....", "2...."],
  O: [".222.", "2...2", "2...2", "2...2", "2...2", "2...2", ".222."],
  T: ["22222", "..2..", "..2..", "..2..", "..2..", "..2..", "..2.."],
};

export const BANNER = Array.from({ length: 7 }, (_, r) =>
  "JACKPOT"
    .split("")
    .map((c) => JK[c][r])
    .join("."),
);
export const BANNER_W = BANNER[0].length; // 41 colonnes

export const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * L'ordre des symboles diffère d'un rouleau à l'autre : le rouleau `i` avance de
 * `i + 1` modulo 5. Les voisins d'un symbole aligné ne sont donc pas les mêmes
 * sur les trois rouleaux, et un alignement ne se lit pas d'avance en regardant
 * ce qui passe au-dessus.
 */
export const ORDER = [0, 1, 2].map((i) => Array.from({ length: 5 }, (_, j) => (j * (i + 1)) % 5));

const SLOT = ORDER.map((ord) => {
  const inv: number[] = [];
  ord.forEach((k, slot) => (inv[k] = slot));
  return inv;
});

/** L'offset auquel le rouleau `reel` montre le symbole `k` sur la payline. */
export const targetOffset = (reel: number, k: number) => mod(-SYM_H * SLOT[reel][k], STRIP_LEN);

/** Hermite : tangentes contrôlées aux deux extrémités. */
function herm(u: number, p0: number, p1: number, m0: number, m1 = 0): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    p0 * (2 * u3 - 3 * u2 + 1) +
    m0 * (u3 - 2 * u2 + u) +
    p1 * (-2 * u3 + 3 * u2) +
    m1 * (u3 - u2)
  );
}

export type Plan = { off0: number; t1: number; tStop: number; o1: number; oF: number };

/**
 * Le plan d'un rouleau : où il part, quand il freine, où il s'arrête.
 *
 * La distance de décélération est tirée dans `[30, 75)` plutôt que calculée au
 * plus court. Freiner sur la distance minimale ferait s'arrêter le rouleau
 * presque tout de suite après le début du freinage quand la cible est déjà
 * proche — on verrait la machine viser.
 */
export function makePlan(reel: number, off0: number, k: number, tStop: number): Plan {
  const t1 = tStop - DECEL;
  const o1 = off0 + V * t1;
  const tm = targetOffset(reel, k);
  const d = 30 + mod(tm - (o1 + 30), STRIP_LEN);
  return { off0, t1, tStop, o1, oF: o1 + d };
}

export function offsetAt(p: Plan, t: number): number {
  if (t <= 0) return p.off0;
  // recul lent, à l'envers
  if (t < T_PULL) return p.off0 - PULL * Math.sin((t / T_PULL) * Math.PI * 0.5);
  // puis détente, qui rejoint la trajectoire linéaire à T_LAUNCH
  if (t < T_LAUNCH) {
    const u = (t - T_PULL) / (T_LAUNCH - T_PULL);
    return herm(u, p.off0 - PULL, p.off0 + V * T_LAUNCH, 0, V * (T_LAUNCH - T_PULL));
  }
  if (t < p.t1) return p.off0 + V * t;
  if (t < p.tStop) return herm((t - p.t1) / DECEL, p.o1, p.oF, V * DECEL);
  return p.oF;
}

export type ResultType = "lose" | "win" | "jackpot";
export type Mode = "idle" | "spin" | "result";

/** Durée des effets de résultat, en secondes. */
export const RESULT_DUR: Record<ResultType, number> = { lose: 1, win: 2.8, jackpot: 7.5 };

/**
 * Le tirage. 5 % de jackpot, 15 % de gain simple, le reste perdant.
 *
 * `force` sert à la préview et n'existe pas côté toy : attendre un jackpot à
 * 5 % pour vérifier qu'il rend bien n'est pas une façon de travailler.
 */
export function draw(force?: "win" | "jackpot"): [number, number, number] {
  if (force === "jackpot") return [0, 0, 0];
  if (force === "win") {
    const k = 1 + Math.floor(Math.random() * 4);
    return [k, k, k];
  }
  const r = Math.random();
  if (r < 0.05) return [0, 0, 0];
  if (r < 0.2) {
    const k = 1 + Math.floor(Math.random() * 4);
    return [k, k, k];
  }
  let t: [number, number, number];
  do {
    t = [0, 0, 0].map(() => Math.floor(Math.random() * 5)) as [number, number, number];
  } while (t[0] === t[1] && t[1] === t[2]);
  return t;
}

export function resultOf([x, y, z]: [number, number, number]): ResultType {
  if (x !== y || y !== z) return "lose";
  return x === 0 ? "jackpot" : "win";
}

/** Trois symboles distincts, pour l'état de repos au premier chargement. */
export function idleTargets(): [number, number, number] {
  let s: [number, number, number];
  do {
    s = [0, 0, 0].map(() => Math.floor(Math.random() * 5)) as [number, number, number];
  } while (s[0] === s[1] && s[1] === s[2]);
  return s;
}

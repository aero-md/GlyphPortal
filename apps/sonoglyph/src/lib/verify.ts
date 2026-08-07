/**
 * Vérification numérique de la chaîne DSP — `bun run verify` (ou
 * `bun run src/lib/verify.ts` depuis `preview/`).
 *
 * Elle ne remplace pas les tests JUnit côté Android : elle produit les nombres
 * que ces tests figent. Toucher à `dsp.ts` sans relancer ceci, c'est déplacer
 * un gabarit sans s'en apercevoir.
 */

import {
  BandAnalyzer,
  Detector,
  Integrator,
  TAU_FAST,
  TAU_SLOW,
  aWeighting,
  msqToDbfs,
} from "./dsp";

const FS = 48000;

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  const mark = ok ? "  ok  " : " FAIL ";
  if (!ok) failures++;
  console.log(`[${mark}] ${name.padEnd(46)} ${detail}`);
}

/* -------------------------------------------------------------------------- */
console.log("\n— Pondération A contre le gabarit IEC 61672-1 —\n");

/** Valeurs nominales de la norme, en dB. */
const IEC_A: [number, number][] = [
  [10, -70.4], [12.5, -63.4], [16, -56.7], [20, -50.5], [25, -44.7], [31.5, -39.4],
  [40, -34.6], [50, -30.2], [63, -26.2], [80, -22.5], [100, -19.1], [125, -16.1],
  [160, -13.4], [200, -10.9], [250, -8.6], [315, -6.6], [400, -4.8], [500, -3.2],
  [630, -1.9], [800, -0.8], [1000, 0.0], [1250, 0.6], [1600, 1.0], [2000, 1.2],
  [2500, 1.3], [3150, 1.2], [4000, 1.0], [5000, 0.5], [6300, -0.1], [8000, -1.1],
];

const aNoHp = aWeighting(FS, false);
let worstLow = 0; // 20 Hz – 4 kHz
let worstAll = 0; // 10 Hz – 8 kHz
for (const [f, ref] of IEC_A) {
  const err = aNoHp.responseDb(f, FS) - ref;
  if (Math.abs(err) > Math.abs(worstAll)) worstAll = err;
  if (f >= 20 && f <= 4000 && Math.abs(err) > Math.abs(worstLow)) worstLow = err;
}
check("|écart| ≤ 0,30 dB entre 20 Hz et 4 kHz", Math.abs(worstLow) <= 0.3, `max ${worstLow.toFixed(3)} dB`);
check("|écart| ≤ 0,60 dB entre 10 Hz et 8 kHz", Math.abs(worstAll) <= 0.6, `max ${worstAll.toFixed(3)} dB`);
check("0 dB exact à 1 kHz", Math.abs(aNoHp.responseDb(1000, FS)) < 1e-9, `${aNoHp.responseDb(1000, FS).toExponential(2)} dB`);

const aFull = aWeighting(FS);
const hp10 = aFull.responseDb(10, FS) - aNoHp.responseDb(10, FS);
check("passe-haut : −3 dB à 10 Hz par-dessus A", Math.abs(hp10 + 3.01) < 0.05, `${hp10.toFixed(2)} dB`);

/* -------------------------------------------------------------------------- */
console.log("\n— Niveau : un sinus à 1 kHz doit se retrouver exactement —\n");

/** Sinus d'amplitude `a`, `sec` secondes, poussé dans la chaîne A + Fast. */
function sine(a: number, f: number, sec: number) {
  const filt = aWeighting(FS);
  const fast = new Detector(FS, TAU_FAST);
  const slow = new Detector(FS, TAU_SLOW);
  const leq = new Integrator();
  const n = Math.round(FS * sec);
  for (let i = 0; i < n; i++) {
    const x = a * Math.sin((2 * Math.PI * f * i) / FS);
    const y = filt.process(x);
    fast.process(y);
    slow.process(y);
    leq.process(y);
  }
  return { fast: msqToDbfs(fast.meanSquare), slow: msqToDbfs(slow.meanSquare), leq: msqToDbfs(leq.meanSquare) };
}

// pleine échelle : RMS = 1/√2, donc −3,01 dBFS
const full = sine(1, 1000, 3);
check("sinus pleine échelle → −3,01 dBFS (Fast)", Math.abs(full.fast + 3.0103) < 0.02, `${full.fast.toFixed(3)} dBFS`);
check("sinus pleine échelle → −3,01 dBFS (Leq)", Math.abs(full.leq + 3.0103) < 0.05, `${full.leq.toFixed(3)} dBFS`);

// −20 dB d'amplitude → −20 dB de niveau : la chaîne est linéaire
const quiet = sine(0.1, 1000, 3);
check("linéarité : −20 dB d'amplitude → −20 dB", Math.abs(quiet.fast - full.fast + 20) < 0.02, `${(quiet.fast - full.fast).toFixed(3)} dB`);

// la pondération à 100 Hz doit se retrouver au niveau, à −19,1 dB
const low = sine(1, 100, 4);
check("sinus 100 Hz → −19,1 dB de pondération", Math.abs(low.slow - full.slow + 19.1) < 0.3, `${(low.slow - full.slow).toFixed(2)} dB`);

/* -------------------------------------------------------------------------- */
console.log("\n— Détecteurs : constantes de temps —\n");

/** Temps mis pour atteindre `target` dB sous l'asymptote, sur un échelon. */
function riseTime(tau: number, targetDb: number): number {
  const det = new Detector(FS, tau);
  const n = FS * 5;
  for (let i = 0; i < n; i++) {
    det.process(1); // échelon d'énergie unité
    if (msqToDbfs(det.meanSquare) >= targetDb) return i / FS;
  }
  return Infinity;
}

// après une constante de temps, le carré moyen vaut 1 − 1/e = 63,2 % → −1,99 dB
const tF = riseTime(TAU_FAST, 10 * Math.log10(1 - 1 / Math.E));
const tS = riseTime(TAU_SLOW, 10 * Math.log10(1 - 1 / Math.E));
check("Fast : 63,2 % atteint à τ = 125 ms", Math.abs(tF - TAU_FAST) < 0.002, `${(tF * 1000).toFixed(1)} ms`);
check("Slow : 63,2 % atteint à τ = 1 s", Math.abs(tS - TAU_SLOW) < 0.01, `${(tS * 1000).toFixed(0)} ms`);

/* -------------------------------------------------------------------------- */
console.log("\n— Banc de bandes : conservation de l'énergie —\n");

const ba = new BandAnalyzer(FS, 25);
for (let i = 0; i < 8192; i++) ba.push(Math.sin((2 * Math.PI * 1000 * i) / FS));
const bands = new Float64Array(25);
ba.analyze(bands);
let total = 0;
let peakK = 0;
for (let k = 0; k < 25; k++) {
  total += bands[k];
  if (bands[k] > bands[peakK]) peakK = k;
}
// un sinus d'amplitude 1 a un carré moyen de 0,5 : la somme des bandes doit y tomber
check("somme des bandes = carré moyen du sinus", Math.abs(total - 0.5) < 0.02, `${total.toFixed(4)} au lieu de 0,5000`);
// 1 kHz tombe dans la bande 25·ln(1000/40)/ln(400) = 13,4 → bande 13
check("le sinus 1 kHz atterrit dans la bande 13", peakK === 13, `bande ${peakK}`);

/* -------------------------------------------------------------------------- */
// `throw` plutôt que `process.exit` : le code de sortie est le même sous Bun,
// et le script reste typable avec les seuls types du navigateur.
if (failures > 0) throw new Error(`${failures} vérification(s) en échec`);
console.log("\nTout passe.\n");

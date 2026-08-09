/**
 * Les deux sources d'échantillons de la préview.
 *
 * Le point important : **aucune des deux ne calcule de niveau**. Elles ne
 * produisent que des échantillons, exactement comme `AudioRecord` sur
 * l'appareil, et c'est le moteur porté depuis Kotlin qui en tire un dB. Une
 * simulation qui injecterait directement « 72 dB » afficherait ce qu'on lui a
 * dit ; celle-ci affiche ce que la chaîne en fait — pondération, détecteur,
 * banc de bandes compris.
 */

import { Biquad } from "./dsp";
import { aWeighting } from "./dsp";

export const FS = 48000;

/* -------------------------------------------------------------------------- */
/* Timbres de simulation                                                       */
/* -------------------------------------------------------------------------- */

export type Timbre = "sine" | "voice" | "pink" | "traffic" | "music";

export const TIMBRES: { v: Timbre; t: string; note: string }[] = [
  { v: "voice", t: "Voix", note: "Bande 200 Hz – 4 kHz, modulation syllabique ~4 Hz" },
  { v: "pink", t: "Ambiance", note: "Bruit rose large bande, quasi stationnaire" },
  { v: "traffic", t: "Trafic", note: "Grave dominant, passages lents" },
  { v: "music", t: "Musique", note: "Pulsation 2 Hz, grave marqué et aigus brefs" },
  { v: "sine", t: "Sinus 1 kHz", note: "Référence : la pondération A y vaut 0 dB" },
];

type Shape = {
  /** Passe-haut et passe-bas de mise en forme, en Hz. */
  hp: number;
  lp: number;
  /** Profondeur (0..1) et fréquence (Hz) de la modulation d'amplitude. */
  depth: number;
  rate: number;
};

const SHAPES: Record<Timbre, Shape> = {
  sine: { hp: 0, lp: 0, depth: 0, rate: 0 },
  voice: { hp: 200, lp: 4000, depth: 0.85, rate: 4.2 },
  pink: { hp: 30, lp: 12000, depth: 0.12, rate: 0.3 },
  traffic: { hp: 25, lp: 900, depth: 0.55, rate: 0.22 },
  music: { hp: 40, lp: 14000, depth: 0.7, rate: 2.0 },
};

const w = (f: number) => 2 * Math.PI * f;

function butterHp(f: number): Biquad {
  const wc = w(f);
  return Biquad.bilinear([1, 0, 0], [1, Math.SQRT2 * wc, wc * wc], FS);
}

function butterLp(f: number): Biquad {
  const wc = w(f);
  return Biquad.bilinear([0, 0, wc * wc], [1, Math.SQRT2 * wc, wc * wc], FS);
}

/**
 * Bruit rose par le filtre de Paul Kellet — trois pôles, −3 dB/octave à ±0,05 dB
 * de 10 Hz à 20 kHz. Un bruit blanc simple donnerait un spectre plat, c'est-à-
 * dire un visualiseur dont toutes les colonnes montent ensemble : joli une fois,
 * inutile pour juger d'un rendu.
 */
class Pink {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;

  next(): number {
    const white = Math.random() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + white * 0.099046;
    this.b1 = 0.963 * this.b1 + white * 0.2965164;
    this.b2 = 0.57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * 0.1848) * 0.22;
  }
}

/**
 * Générateur d'un timbre, sans réglage de niveau : la normalisation est faite
 * par l'appelant, qui connaît la consigne.
 */
class Voice {
  private readonly pink = new Pink();
  private readonly hp?: Biquad;
  private readonly lp?: Biquad;
  private readonly shape: Shape;
  private phase = 0;

  constructor(private readonly timbre: Timbre) {
    this.shape = SHAPES[timbre];
    if (this.shape.hp > 0) this.hp = butterHp(this.shape.hp);
    if (this.shape.lp > 0) this.lp = butterLp(this.shape.lp);
  }

  /** Un échantillon à l'instant `t` (secondes), amplitude de l'ordre de 1. */
  next(t: number, dynamics: number): number {
    let x: number;
    if (this.timbre === "sine") {
      this.phase += (2 * Math.PI * 1000) / FS;
      x = Math.sin(this.phase);
    } else {
      x = this.pink.next();
      if (this.hp) x = this.hp.process(x);
      if (this.lp) x = this.lp.process(x);
      if (this.timbre === "music") {
        // une pulsation grave franche, pour que le bas du spectre ait un rythme
        this.phase += (2 * Math.PI * 55) / FS;
        x += 0.55 * Math.sin(this.phase) * (0.35 + 0.65 * beat(t, 2));
      }
    }
    const { depth, rate } = this.shape;
    if (depth <= 0 || dynamics <= 0) return x;
    const d = depth * dynamics;
    const env = 1 - d + d * beat(t, rate);
    return x * env;
  }
}

/** Enveloppe 0..1 : montée franche, descente en exponentielle. */
function beat(t: number, rate: number): number {
  if (rate <= 0) return 1;
  const p = (t * rate) % 1;
  return Math.exp(-3.2 * p) * (0.35 + 0.65 * Math.abs(Math.sin(t * rate * Math.PI * 0.5)));
}

/* -------------------------------------------------------------------------- */
/* Source simulée                                                              */
/* -------------------------------------------------------------------------- */

export type SimParams = {
  /** Niveau visé, en dB(A) SPL. */
  targetDb: number;
  timbre: Timbre;
  /** 0 = stationnaire, 1 = toute la dynamique du timbre. */
  dynamics: number;
  /** Force le signal au-delà du plafond numérique, pour voir la surcharge. */
  overdrive: boolean;
};

export const DEFAULT_SIM: SimParams = {
  targetDb: 68,
  timbre: "voice",
  dynamics: 1,
  overdrive: false,
};

/**
 * Générateur d'échantillons simulés.
 *
 * La consigne est en **dB(A)**, pas en dBFS. Pour qu'un curseur sur 72 donne
 * bien 72 sur la matrice, le gain doit compenser deux choses d'un coup :
 *
 * 1. le niveau propre du timbre à gain unité — un bruit rose filtré n'a aucune
 *    raison d'avoir un carré moyen de 1 ;
 * 2. ce que la pondération A lui retirera — presque rien sur le sinus, une
 *    dizaine de dB sur le trafic.
 *
 * Les deux se ramènent à **une** grandeur : le carré moyen pondéré A du
 * générateur à gain unité, `maDb`. Il est mesuré en faisant passer deux
 * secondes de signal dans un vrai pondérateur A, une fois par timbre — pas
 * estimé, sinon le curseur mentirait de dix dB d'un timbre à l'autre.
 *
 * La modulation d'amplitude, elle, est traitée analytiquement : elle multiplie
 * le carré moyen par celui de son enveloppe, qu'on intègre sur une période. La
 * mesure se fait donc à modulation nulle et n'a pas à être refaite quand on
 * bouge le curseur de dynamique.
 */
export class SimSource {
  private voice: Voice;
  private timbre: Timbre;
  /** Carré moyen pondéré A du générateur à gain unité, en dB. */
  private maDb = 0;
  private t = 0;

  constructor(private params: SimParams = { ...DEFAULT_SIM }) {
    this.timbre = params.timbre;
    this.voice = new Voice(params.timbre);
    this.maDb = measureWeightedLevel(params.timbre);
  }

  setParams(p: SimParams): void {
    if (p.timbre !== this.timbre) {
      this.timbre = p.timbre;
      this.voice = new Voice(p.timbre);
      this.maDb = measureWeightedLevel(p.timbre);
    }
    this.params = p;
  }

  /** Remplit `out` avec `n` échantillons et avance l'horloge interne. */
  fill(out: Float32Array, n: number, calibrationK: number): void {
    const { targetDb, dynamics, overdrive } = this.params;
    const shape = SHAPES[this.timbre];
    // le creusement dû à la modulation, en dB : négatif, il faut le rendre
    const envDb = 10 * Math.log10(meanEnvSquare(shape.depth * dynamics, shape.rate));
    // +12 dB en surcharge pour taper le plafond franchement, pas le frôler
    const dbfs = targetDb - calibrationK - this.maDb - envDb + (overdrive ? 12 : 0);
    const gain = 10 ** (dbfs / 20);
    const dt = 1 / FS;
    for (let i = 0; i < n; i++) {
      this.t += dt;
      const x = this.voice.next(this.t, dynamics) * gain;
      // l'écrêtage est celui du convertisseur : le moteur doit le voir comme tel
      out[i] = x > 1 ? 1 : x < -1 ? -1 : x;
    }
  }
}

/** Carré moyen pondéré A d'un timbre à gain unité et modulation nulle, en dB. */
function measureWeightedLevel(timbre: Timbre): number {
  const voice = new Voice(timbre);
  const a = aWeighting(FS);
  let sum = 0;
  const n = FS * 2;
  for (let i = 0; i < n; i++) {
    const y = a.process(voice.next(i / FS, 0));
    sum += y * y;
  }
  return sum <= 0 ? 0 : 10 * Math.log10(sum / n);
}

/**
 * Carré moyen de l'enveloppe `1 − d + d·beat(t, rate)`.
 *
 * Intégré sur **deux** périodes de `rate` et non une : `beat` combine une dent
 * de scie de période `1/rate` et un sinus redressé de période `2/rate`, si bien
 * qu'une seule période n'en couvre que la moitié. Deux mille points suffisent,
 * l'enveloppe est lisse — et cette somme coûte moins qu'une image de rendu.
 */
function meanEnvSquare(d: number, rate: number): number {
  if (d <= 0 || rate <= 0) return 1;
  const n = 2000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = 1 - d + d * beat((2 * i) / (n * rate), rate);
    sum += e * e;
  }
  return sum / n;
}

/* -------------------------------------------------------------------------- */
/* Source micro                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Micro réel, via AudioWorklet.
 *
 * Les trois traitements du navigateur sont coupés explicitement. Ce sont les
 * mêmes que ceux qu'`UNPROCESSED` évite côté Android, et pour la même raison :
 * un contrôle de gain automatique fait remonter un silence et redescendre un
 * cri, ce qui donne un sonomètre qui affiche toujours la même chose.
 */
export class MicSource {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;

  /** Blocs reçus, à consommer par la boucle d'affichage. */
  private queue: Float32Array[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    // 48 kHz imposé : tout le reste de la chaîne est construit pour ce taux
    this.ctx = new AudioContext({ sampleRate: FS });
    /* Chemin absolu, et il doit le rester. `addModule` résout son argument
       contre l'URL du document : en relatif, le worklet est demandé à
       `/mic-worklet.js` depuis `/sonoglyph` mais à `/sonoglyph/mic-worklet.js`
       depuis `/sonoglyph/` — deux URL selon la barre finale, dont une seule
       existe. Du temps où la page était une app Vite servie sous `base:
       "/sonoglyph/"`, le relatif tombait juste par accident. */
    await this.ctx.audioWorklet.addModule("/mic-worklet.js");
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "mic-tap");
    this.node.port.onmessage = (e) => {
      this.queue.push(e.data as Float32Array);
      // garde-fou : si l'onglet est en arrière-plan la boucle d'affichage
      // s'arrête et la file grossirait sans fin
      if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
    };
    src.connect(this.node);
    // le worklet ne produit rien : sans destination le graphe serait élagué
    this.node.connect(this.ctx.destination);
    await this.ctx.resume();
  }

  /** Vide la file et renvoie les blocs accumulés depuis le dernier appel. */
  drain(): Float32Array[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  stop(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.queue = [];
  }
}

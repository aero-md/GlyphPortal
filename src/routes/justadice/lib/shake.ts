/**
 * La secousse — la commande du toy, telle qu'un navigateur peut la rendre.
 *
 * Sur l'appareil, le toy lit l'accéléromètre : le dé se relance en secouant le
 * téléphone. La page peut faire la même chose, à une condition — être ouverte sur
 * un téléphone. C'est le cas qui compte : `glyph.suns.red` se visite depuis le
 * Nothing qu'on a en main, et secouer celui-ci relance le dé de la préview comme
 * il relancerait celui du toy.
 *
 * Ailleurs, il n'y a pas de capteur, et le rack porte un bouton qui simule la
 * secousse. Ce n'est pas un pis-aller déguisé : l'état du capteur est affiché tel
 * qu'il est, y compris le cas tordu du navigateur de bureau qui **déclare**
 * `DeviceMotionEvent` et n'en émet jamais un seul. Un « capteur actif » qui ne
 * réagit à rien serait un mensonge, d'où l'état `silent`, constaté après un délai.
 *
 * Détection : un passe-haut sur la norme de l'accélération, un seuil, et un temps
 * mort. La gravité est retirée quand le navigateur sait le faire, et soustraite à
 * la moyenne glissante sinon — sans ça, un téléphone posé mesure déjà 9,81 et
 * n'importe quel seuil utile serait franchi en permanence.
 */

export type ShakeStatus =
  /** Pas d'API de mouvement dans ce navigateur. */
  | "unsupported"
  /** API présente, écoute non demandée. */
  | "off"
  /** Permission refusée (iOS la demande, et ne la redemande pas). */
  | "denied"
  /** Écoute lancée, rien reçu encore. */
  | "listening"
  /** Des mesures arrivent. */
  | "live"
  /** Écoute lancée, aucune mesure : capteur déclaré mais muet. */
  | "silent";

type MotionCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** Seuil par défaut, en m/s² d'accélération nette. */
export const THRESHOLD = 14;
export const THRESHOLD_RANGE = [6, 28] as const;
/** Plein d'échelle du vumètre du rack. */
export const LEVEL_MAX = 30;

/** Temps mort après une secousse retenue : un geste, pas une rafale. */
const REFRACTORY = 550;
/** Délai au bout duquel un capteur qui n'a rien dit est déclaré muet. */
const SILENCE = 1400;
/** Lissage de la mesure, et de la gravité quand il faut l'estimer. */
const SMOOTH = 0.4;
const GRAVITY_SMOOTH = 0.06;

export class Shaker {
  status: ShakeStatus = "off";
  /** Accélération nette lissée, m/s². Lu par le vumètre. */
  level = 0;
  threshold = THRESHOLD;

  onshake?: () => void;
  /** Appelé à chaque mesure — `status` peut avoir changé. */
  onlevel?: (level: number, status: ShakeStatus) => void;

  private last = 0;
  private silence: ReturnType<typeof setTimeout> | null = null;
  private grav: [number, number, number] = [0, 0, 0];
  private seen = false;

  constructor() {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window))
      this.status = "unsupported";
  }

  get supported(): boolean {
    return this.status !== "unsupported";
  }

  /**
   * Demande l'écoute. Sur iOS la permission ne peut être demandée que depuis un
   * geste de l'utilisateur — d'où le bouton du rack, qui n'est pas décoratif.
   */
  async start(): Promise<ShakeStatus> {
    if (this.status === "unsupported") return this.status;

    const ctor = DeviceMotionEvent as MotionCtor;
    if (typeof ctor.requestPermission === "function") {
      try {
        if ((await ctor.requestPermission()) !== "granted") {
          this.status = "denied";
          this.emit();
          return this.status;
        }
      } catch {
        this.status = "denied";
        this.emit();
        return this.status;
      }
    }

    this.seen = false;
    this.status = "listening";
    window.addEventListener("devicemotion", this.handle);
    this.silence = setTimeout(() => {
      if (!this.seen) {
        this.status = "silent";
        this.emit();
      }
    }, SILENCE);
    this.emit();
    return this.status;
  }

  stop(): void {
    if (this.status === "unsupported") return;
    window.removeEventListener("devicemotion", this.handle);
    if (this.silence) clearTimeout(this.silence);
    this.silence = null;
    this.level = 0;
    if (this.status !== "denied") this.status = "off";
    this.emit();
  }

  private emit(): void {
    this.onlevel?.(this.level, this.status);
  }

  private handle = (e: DeviceMotionEvent): void => {
    let ax: number;
    let ay: number;
    let az: number;

    const net = e.acceleration;
    if (net && (net.x !== null || net.y !== null || net.z !== null)) {
      ax = net.x ?? 0;
      ay = net.y ?? 0;
      az = net.z ?? 0;
    } else {
      const raw = e.accelerationIncludingGravity;
      if (!raw) return;
      const rx = raw.x ?? 0;
      const ry = raw.y ?? 0;
      const rz = raw.z ?? 0;
      // Moyenne très lente = la gravité, quelle que soit l'orientation du
      // téléphone. Ce qui dépasse est le geste.
      this.grav[0] += (rx - this.grav[0]) * GRAVITY_SMOOTH;
      this.grav[1] += (ry - this.grav[1]) * GRAVITY_SMOOTH;
      this.grav[2] += (rz - this.grav[2]) * GRAVITY_SMOOTH;
      ax = rx - this.grav[0];
      ay = ry - this.grav[1];
      az = rz - this.grav[2];
    }

    if (!this.seen) {
      this.seen = true;
      this.status = "live";
      if (this.silence) clearTimeout(this.silence);
      this.silence = null;
    }

    const mag = Math.hypot(ax, ay, az);
    this.level += (mag - this.level) * SMOOTH;
    this.emit();

    const now = performance.now();
    if (this.level > this.threshold && now - this.last > REFRACTORY) {
      this.last = now;
      this.onshake?.();
    }
  };
}

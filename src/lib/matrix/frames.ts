/**
 * La cadence des boucles de dessin : `requestAnimationFrame` tant que la
 * fenêtre a le focus, une image toutes les `IDLE_MS` sinon.
 *
 * Un onglet visible dans une fenêtre sans le focus — le portail d'un côté, une
 * vidéo de l'autre — garde son `requestAnimationFrame` à la fréquence de
 * l'écran : une dizaine de canvas redessinés soixante fois par seconde pour
 * personne, et le GPU qu'ils occupent manque à la fenêtre qu'on regarde. Le
 * navigateur ne ralentit que les onglets cachés, pas ceux-là.
 *
 * On ralentit sans arrêter : les boucles tiennent leur temps de l'horloge, pas
 * du nombre d'appels, donc elles reprennent au bon endroit au retour du focus.
 * Quand l'onglet est caché, `requestAnimationFrame` s'arrête de lui-même et un
 * minuteur ne ferait que le contredire — on y repasse.
 *
 * Les identifiants sont les nôtres : un identifiant de minuteur et un
 * identifiant de `requestAnimationFrame` peuvent coïncider, et annuler l'un
 * avec la fonction de l'autre ferait taire la boucle d'un voisin.
 */

const IDLE_MS = 250;

let focused = typeof document === "undefined" ? true : document.hasFocus();

if (typeof window !== "undefined") {
  window.addEventListener("focus", () => (focused = true));
  window.addEventListener("blur", () => (focused = false));
}

let seq = 0;
const pending = new Map<number, () => void>();

/** Demande la prochaine image. Même contrat que `requestAnimationFrame`. */
export function onFrame(cb: FrameRequestCallback): number {
  const id = ++seq;
  const run = (now: number) => {
    pending.delete(id);
    cb(now);
  };
  if (focused || document.hidden) {
    const raf = requestAnimationFrame(run);
    pending.set(id, () => cancelAnimationFrame(raf));
  } else {
    const timer = setTimeout(() => run(performance.now()), IDLE_MS);
    pending.set(id, () => clearTimeout(timer));
  }
  return id;
}

/** Annule une image demandée. Sans effet sur 0 ou sur une image déjà rendue. */
export function offFrame(id: number): void {
  pending.get(id)?.();
  pending.delete(id);
}

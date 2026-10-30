/**
 * Opacité affichée d'une LED allumée, pour une luminosité `b` dans 0..1.
 *
 * Miroir de `MatrixLook.LedStyle.alphaOf` côté Android — les deux se corrigent
 * ensemble.
 *
 * Le plancher (0,25 en sharp, 0,08 en soft) garde lisibles les LEDs faibles :
 * c'est le halo qui porte l'intensité, pas l'opacité du carré. Mais posé seul il
 * fait un cran — de `MIN_LIT` à juste au-dessus, l'opacité saute de 0 au plancher,
 * et un fondu se lit comme un on/off, ce que la vraie matrice ne fait pas. Sous
 * `KNEE`, l'opacité redescend donc continûment jusqu'à zéro.
 */

/** En dessous, la LED est éteinte. */
export const MIN_LIT = 0.02;

/** Luminosité sous laquelle l'opacité rejoint zéro au lieu de rester au plancher. */
export const KNEE = 0.15;

export function ledAlpha(b: number, floor: number): number {
  const full = floor + (1 - floor) * b;
  if (b >= KNEE) return full;
  const atKnee = floor + (1 - floor) * KNEE;
  return (atKnee * (b - MIN_LIT)) / (KNEE - MIN_LIT);
}

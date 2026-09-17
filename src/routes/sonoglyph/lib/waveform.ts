/**
 * Port de `Waveform.kt` — l'enveloppe récente du son, une valeur par tranche
 * de temps, la plus récente en tête.
 *
 * C'est ce qui fait défiler le visualiseur de droite à gauche : la colonne la
 * plus à droite porte la tranche d'âge 0, et remonter le temps revient à
 * remonter vers la gauche. Le découpage est indépendant de la cadence de
 * rendu — c'est ce qui fait défiler l'onde à la même vitesse sur la matrice et
 * dans un aperçu à cadence différente.
 */
export class Waveform {
  /** Valeur d'une tranche jamais écrite. Sous tout niveau affichable. */
  static readonly EMPTY = -1;

  /** Marge de troncature, en fraction de tranche. Voir `push`. */
  private static readonly TOLERANCE = 1e-6;

  private readonly cells: Float32Array;
  private head = 0;
  private pending = Waveform.EMPTY;
  private originAt = NaN;
  private slice = 0;

  /** Nombre de tranches réellement écrites — sert à ne pas dessiner du vide. */
  filled = 0;

  constructor(
    readonly columns: number,
    private readonly columnSeconds: number,
  ) {
    this.cells = new Float32Array(columns).fill(Waveform.EMPTY);
  }

  clear(): void {
    this.cells.fill(Waveform.EMPTY);
    this.head = 0;
    this.filled = 0;
    this.pending = Waveform.EMPTY;
    this.originAt = NaN;
    this.slice = 0;
  }

  /** Verse un niveau 0..1 dans la tranche courante, et bascule de tranche quand elle est pleine. */
  push(level: number, now: number): void {
    // Une horloge qui recule n'est pas hypothétique : un aperçu qui rejoue le
    // temps à sa guise repart de zéro sans que ça soit une anomalie.
    if (Number.isNaN(this.originAt) || now < this.originAt) {
      this.originAt = now;
      this.slice = 0;
    }

    const target = Math.trunc((now - this.originAt) / this.columnSeconds + Waveform.TOLERANCE);
    if (target - this.slice >= this.columns) {
      this.wipe();
      this.commit();
    } else {
      let k = this.slice;
      while (k < target) {
        this.commit();
        k++;
      }
    }
    this.slice = target;

    if (level > this.pending) this.pending = level;
  }

  private wipe(): void {
    this.cells.fill(Waveform.EMPTY);
    this.head = 0;
    this.filled = 0;
  }

  /** Ferme la tranche courante et en ouvre une neuve, en reportant la valeur si rien n'est arrivé. */
  private commit(): void {
    const carried = this.pending > Waveform.EMPTY ? this.pending : this.cells[this.head];
    this.head = (this.head + 1) % this.columns;
    this.cells[this.head] = carried;
    this.pending = Waveform.EMPTY;
    if (this.filled < this.columns) this.filled++;
  }

  /** Niveau de la tranche `age` colonnes en arrière — 0 = la plus récente. */
  at(age: number): number {
    if (age < 0 || age >= this.columns || age >= this.filled) return Waveform.EMPTY;
    return this.cells[((this.head - age) % this.columns + this.columns) % this.columns];
  }
}

/**
 * Prise micro — AudioWorklet.
 *
 * En clair : le fil audio pousse des blocs vers le fil principal, et rien
 * d'autre. Pas de traitement ici, la chaîne de mesure vit côté page pour être
 * exactement celle du toy.
 *
 * Fichier statique en JS plutôt que module TypeScript : `addModule` charge une
 * URL, et faire passer un `.ts` par le bundler pour un fichier de trente lignes
 * ajoute une dépendance de build là où une balise de script suffit.
 *
 * Les blocs natifs font 128 échantillons, soit 2,7 ms : les poster tels quels
 * ferait 375 messages par seconde pour un affichage à 60 images. On accumule
 * donc jusqu'à [BLOCK] avant de traverser.
 */

const BLOCK = 1024;

class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(BLOCK);
    this.n = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === BLOCK) {
        this.port.postMessage(this.buf.slice());
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor("mic-tap", MicTap);

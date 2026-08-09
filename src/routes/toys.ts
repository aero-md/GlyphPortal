/**
 * Le catalogue du portail.
 *
 * `ready` dit si la préview est servie ici. Tant qu'elle ne l'est pas, la tuile
 * reste dans le sommaire mais renvoie au dépôt : une entrée absente laisse
 * croire que le toy n'existe pas, une entrée qui pointe sur un 404 est pire.
 *
 * L'ordre est celui de la grille, et il est délibéré : l'outil qui tourne dans
 * le navigateur d'abord, les toys embarqués ensuite.
 */

export type Toy = {
  /** Segment d'URL sous glyph.suns.red, et nom du dossier au déploiement. */
  slug: string;
  /** Nom affiché, en capitales — c'est un wordmark, pas une phrase. */
  name: string;
  /** Ce que fait le toy, en une ligne. Sous-titre de la tuile. */
  line: string;
  /** Dépôt GitHub. */
  repo: string;
  /** La préview est-elle servie sur ce domaine ? */
  ready: boolean;
  /**
   * Boucle exportée du toy, servie depuis `public/preview/`.
   *
   * Deux formats sont lus, reconnus à la forme du fichier et non à son
   * extension :
   *
   * - le **dessin Glyph Museum** — `{ v, frames: [{ p, d }] }`, des consignes de
   *   LED, donc exactement ce que reçoit l'appareil. C'est celui à préférer :
   *   quelques kilo-octets, aucune dépendance pour le lire, et il porte le
   *   compte exact de LEDs de sa matrice, donc il ne peut pas se désaccorder de
   *   la grille. Voir `design.ts` dans le kit.
   * - le **Lottie**, hérité des premiers exports. Ce ne sont pas des animations
   *   vectorielles libres mais les matrices elles-mêmes, une LED par rectangle —
   *   voir `lottieFrame.ts`, qui les rééchantillonne dans la grille de l'appareil
   *   au lieu de les jouer. Il pèse quelques centaines de kilo-octets et tire
   *   `lottie-web` avec lui.
   *
   * Absente, la tuile garde son disque éteint. C'est un état tenable et non un
   * manque à combler dans l'urgence : un toy dont la boucle n'est pas encore
   * exportée occupe la même place et la même hauteur que les autres, et la
   * grille ne bougera pas le jour où elle arrive.
   *
   * **Plusieurs boucles : la tuile en tire une au sort à l'ouverture de la
   * page**, à chances égales, et la garde pour toute sa durée de vie. C'est ce
   * qui laisse GlyphCast montrer tantôt un rendu de Phone (3), tantôt un de
   * (4a) Pro — un outil qui convertit vers les deux matrices ne devrait pas
   * n'en montrer qu'une. La grille de la mini-prévisu se déduit du fichier lui-
   * même (voir `deviceForDesign`), il n'y a donc rien à déclarer ici : c'est la
   * longueur des trames qui dit l'appareil.
   */
  preview?: string | string[];
};

export const TOYS: Toy[] = [
  {
    slug: "glyphslot",
    name: "GLYPHSLOT",
    line: "(Glyph toy) Une machine à sous pixélisée",
    repo: "https://github.com/aero-md/glyphslot",
    ready: true,
    preview: "/preview/glyphslot.json",
  },
  {
    slug: "glyphlapse",
    name: "GLYPHLAPSE",
    line: "(Glyph toy) Une visualisation du temps qui passe",
    repo: "https://github.com/aero-md/glyphlapse",
    ready: true,
  },
  {
    slug: "sonoglyph",
    name: "SONOGLYPH",
    line: "(Glyph toy) \n Le son du micro, mesuré et représenté avec une poignée de pixels",
    repo: "https://github.com/aero-md/sonoglyph",
    ready: true,
  },
  {
    slug: "glyphcast",
    name: "GLYPHCAST",
    line: "Outil de convertion d'une image en rendu Glyph Matrix",
    repo: "https://github.com/aero-md/glyphcast",
    ready: true,
    /* Deux dessins fixes sortis de GlyphCast lui-même, la même image projetée
       sur les deux matrices — 489 LEDs sur le (3), 137 sur le (4a) Pro. La
       tuile en tire un au sort : c'est le seul endroit du sommaire où la
       différence entre les deux appareils se voit, et elle est le sujet de cet
       outil-là. */
    preview: ["/preview/hmmm.json", "/preview/hmmm4apro.json"],
  },
];

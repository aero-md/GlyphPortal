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
};

export const TOYS: Toy[] = [
  {
    slug: "glyphcast",
    name: "GLYPHCAST",
    line: "Convertit une image en rendu Glyph Matrix",
    repo: "https://github.com/aero-md/glyphcast",
    ready: true,
  },
  {
    slug: "sonoglyph",
    name: "SONOGLYPH",
    line: "Le son du micro sur la matrice",
    repo: "https://github.com/aero-md/sonoglyph",
    ready: true,
  },
  {
    slug: "glyphlapse",
    name: "GLYPHLAPSE",
    line: "Le temps qui passe, décomposé",
    repo: "https://github.com/aero-md/glyphlapse",
    ready: true,
  },
  {
    slug: "glyphslot",
    name: "GLYPHSLOT",
    line: "Une machine à sous pixélisée",
    repo: "https://github.com/aero-md/glyphslot",
    ready: true,
  },
];

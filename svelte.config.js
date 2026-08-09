import adapter from "@sveltejs/adapter-static";

/**
 * Le site est un paquet de fichiers statiques, servi tel quel : il n'y a pas de
 * serveur Node derrière. `adapter-static` est donc le seul adaptateur qui
 * convienne, et tout ce qui n'est pas pré-rendu au build n'existe pas en ligne.
 *
 * `fallback` reste absent volontairement. Il n'existe aucune route dynamique —
 * cinq pages, écrites en dur — donc le pré-rendu les couvre toutes, et un
 * fallback ne servirait qu'à masquer une route oubliée en la rendant vide. Ce
 * que doit faire une URL inventée revient au serveur de fichiers, pas au
 * bundler.
 *
 * @type {import("@sveltejs/kit").Config}
 */
export default {
  kit: {
    adapter: adapter({ pages: "build", assets: "build", precompress: false, strict: true }),
    /* Le domaine est servi à sa racine, il n'y a donc pas de `paths.base` : le
       dossier d'une route EST son URL, et il n'y a rien à tenir en accord entre
       le bundler, l'arborescence servie et `TOYS`. */
  },
};

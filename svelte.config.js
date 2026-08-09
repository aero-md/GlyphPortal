import adapter from "@sveltejs/adapter-static";

/**
 * Le site est un paquet de fichiers statiques posés sur un Raspberry Pi et
 * servis par Caddy. Il n'y a pas de serveur Node derrière : `adapter-static`
 * est donc le seul adaptateur qui convienne, et tout ce qui n'est pas
 * pré-rendu au build n'existe pas en ligne.
 *
 * `fallback` reste absent volontairement. Il n'existe aucune route dynamique —
 * cinq pages, écrites en dur — donc le pré-rendu les couvre toutes, et un
 * fallback ne servirait qu'à masquer une route oubliée en la rendant vide.
 * Ce que doit faire une URL inventée est décidé par Caddy, qui la renvoie au
 * sommaire : voir `deploy/Caddyfile.snippet`.
 *
 * @type {import("@sveltejs/kit").Config}
 */
export default {
  kit: {
    adapter: adapter({ pages: "build", assets: "build", precompress: false, strict: true }),
    /* Le domaine est servi à sa racine, il n'y a donc pas de `paths.base` — et
       c'est précisément ce qui disparaît par rapport au monorepo, où chaque app
       portait un `base: "/<slug>/"` dans son vite.config.ts, à tenir en accord
       avec le nom de son dossier de déploiement et avec TOYS. Ici le routeur
       tient les trois en même temps : le dossier de la route EST l'URL. */
  },
};

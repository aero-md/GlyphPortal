/**
 * Vite autonome pour `bun run og` — hors de SvelteKit et de son routeur.
 *
 * `og-render/App.svelte` importe le vrai `Preview.svelte` du portail : c'est
 * le point du dossier. Mais l'accrocher à une route SvelteKit (`src/routes`)
 * s'est heurté à `adapter-static` — toute route à paramètre y compte comme
 * « dynamique », prérendue ou non, `entries` ou pas (voir `builder.routes`
 * dans `adapter-static/index.js`, qui refuse au premier `[` du nom de route).
 * Contourner ça avec `fallback` aurait défait l'invariant que documente
 * `svelte.config.js` : ce portail n'a **aucune** route dynamique.
 *
 * Ce dossier est donc une seconde appli Vite, minuscule, qui ne connaît rien
 * de SvelteKit et n'entre jamais dans son build : `vite build` racine ne le
 * voit pas, `adapter-static` non plus. `scripts/og.ts` démarre ce serveur-ci
 * (`bun run og:serve`), jamais celui de SvelteKit.
 */
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  /* `App.svelte` lit ses boucles sous `/preview/*.json` — les mêmes fichiers
     que sert le vrai site. Sans ce `publicDir`, ce second serveur n'a pas de
     dossier public à lui et ces `fetch()` tombent en 404, silencieusement
     avalés par `sample()` — la carte sort alors vide, fond seul. */
  publicDir: fileURLToPath(new URL("../static", import.meta.url)),
  plugins: [svelte({ preprocess: vitePreprocess() })],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("../src/lib", import.meta.url)),
    },
  },
});

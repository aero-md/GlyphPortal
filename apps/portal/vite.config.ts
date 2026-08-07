import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// La seule app servie à la racine du domaine — d'où l'absence de `base`, qui
// est aussi ce qui la distingue des autres au déploiement.
export default defineConfig({
  plugins: [svelte()],
});

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Voir apps/glyphcast/vite.config.ts — le `base` doit correspondre au slug du
// deploy, sinon l'app se déploie au bon endroit en réclamant ses assets au
// mauvais.
export default defineConfig({
  base: "/sonoglyph/",
  plugins: [svelte()],
});

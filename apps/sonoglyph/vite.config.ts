import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Voir apps/glyphcast/vite.config.ts — le `base` doit correspondre au slug du
// deploy, sinon l'app se déploie au bon endroit en réclamant ses assets au
// mauvais.
export default defineConfig({
  base: "/sonoglyph/",
  plugins: [svelte()],
  // Port fixe : le serveur du portail proxyfie celui-ci en dev, et strictPort
  // fait échouer bruyamment plutôt que de glisser sur le port suivant — auquel
  // le proxy ne parlerait plus. En temps normal on n'ouvre pas cette adresse
  // directement : les liens du portail sont absolus, et ils n'existent que sur
  // http://localhost:5180.
  server: { port: 5182, strictPort: true },
});

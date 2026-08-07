import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Chaque app du portail est servie sous son propre préfixe — glyph.suns.red
// n'héberge un sommaire qu'à la racine. Sans `base`, le HTML généré pointerait
// sur `/assets/…` : le JS et le CSS partent en 404 depuis `/glyphcast/` et la
// page reste blanche, sans la moindre erreur au build.
//
// La barre finale compte : Vite l'exige, et le deploy s'en sert pour nommer le
// dossier de destination.
export default defineConfig({
  base: "/glyphcast/",
  plugins: [svelte()],
  // Port fixe : le serveur du portail proxyfie celui-ci en dev, et strictPort
  // fait échouer bruyamment plutôt que de glisser sur le port suivant — auquel
  // le proxy ne parlerait plus. En temps normal on n'ouvre pas cette adresse
  // directement : les liens du portail sont absolus, et ils n'existent que sur
  // http://localhost:5180.
  server: { port: 5181, strictPort: true },
});

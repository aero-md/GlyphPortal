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
  server: {
    port: 5182,
    strictPort: true,
    // Le HMR parle **directement** a ce port, sans passer par le proxy du
    // portail. Relayee, la websocket ne s'etablit pas sous Bun : le socket d'un
    // upgrade y est incomplet, la poignee de main echoue, et Vite finit la
    // reponse par un socket.destroySoon() qui n'existe pas - ce qui tuait le
    // processus au bout de quelques minutes. En sortant du proxy, la connexion
    // s'etablit et le chemin fautif n'est plus emprunte.
    hmr: { host: "localhost", port: 5182, protocol: "ws" },
    // La page est servie par le portail (5180) et la websocket vise ce port-ci :
    // c'est une connexion cross-origine, que Vite refuse par defaut pour empecher
    // le detournement de websocket depuis un site tiers. On autorise la seule
    // origine legitime, celle du portail - pas `true`, qui ouvrirait a n'importe
    // quelle page ouverte dans le navigateur.
    cors: { origin: "http://localhost:5180" },
  },
});

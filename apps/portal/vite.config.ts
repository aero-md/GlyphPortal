import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

/**
 * La seule app servie à la racine du domaine — d'où l'absence de `base`, qui
 * est aussi ce qui la distingue des autres au déploiement.
 *
 * En développement, c'est en plus **la porte d'entrée du portail** : elle
 * proxyfie les quatre autres serveurs Vite sur son propre port. Sans ça chaque
 * app vit sur une origine différente, et tous les liens du portail cassent — le
 * sommaire pointe sur `/glyphcast/`, le bouton « ◂ Index » de chaque préview
 * pointe sur `/`, et aucune des deux cibles n'existe sur le port du voisin.
 *
 * **Le HTTP seulement, pas la websocket.** Relayer le HMR ne marche pas sous
 * Bun : le socket d'un `upgrade` y est incomplet, la poignée de main échoue, et
 * Vite termine la réponse par un `socket.destroySoon()` qui n'existe pas — ce
 * qui tuait le processus, donc les cinq serveurs, au bout de quelques minutes.
 * Chaque app pointe donc son client HMR sur son propre port (`server.hmr`), et
 * la websocket ne passe plus par ici.
 */
const APPS = {
  glyphcast: 5181,
  sonoglyph: 5182,
  glyphlapse: 5183,
  glyphslot: 5184,
};

export default defineConfig({
  plugins: [svelte()],
  server: {
    // Fixe, et non « le premier port libre » : le proxy ci-dessous nomme des
    // ports, et un serveur qui glisse silencieusement sur le suivant fait
    // proxyfier vers le vide. `strictPort` transforme la collision en erreur.
    port: 5180,
    strictPort: true,
    proxy: Object.fromEntries(
      Object.entries(APPS).map(([slug, port]) => [
        `/${slug}`,
        { target: `http://localhost:${port}` },
      ]),
    ),
  },
});

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

/* Un seul config, un seul serveur de dev, un seul port. Ce qui remplace les
   cinq vite.config.ts du monorepo et le proxy maison de `scripts/dev.ts` — dont
   la moitié des lignes servaient à faire passer la websocket du HMR de cinq
   serveurs à travers un sixième. */
export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 5180, strictPort: true },
});

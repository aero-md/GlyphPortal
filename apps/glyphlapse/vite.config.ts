import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Voir apps/glyphcast/vite.config.ts — le `base` doit correspondre au slug du
// deploy.
export default defineConfig({
  base: "/glyphlapse/",
  plugins: [svelte()],
});

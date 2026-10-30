<script lang="ts">
  /* La feuille de style du portail, importée une fois pour les cinq pages.
     C'était le rôle des cinq `main.ts` du monorepo, qui faisaient chacun un
     `import "@glyph/kit/app.css"` avant de monter leur App. */
  import "$lib/app.css";

  let { children } = $props();
</script>

<!-- Fond d'écran : l'image est choisie par le CSS selon le thème et l'appareil
     affiché (`html[data-device]`, posé par `syncBackdrop`) — voir `.bg`. -->
<div class="bg" aria-hidden="true"></div>

{@render children()}

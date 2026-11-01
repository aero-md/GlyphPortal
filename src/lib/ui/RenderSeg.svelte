<script lang="ts">
  /* Échelle de préview et rendu des LED, réunis sous un seul intitulé : les deux
     ne règlent pas le toy, seulement la façon de le regarder, et vivaient pour
     ça hors des apps — dans `PreviewPane`, à côté du téléphone. Posés en boutons
     dans la carte [00] de chaque toy à la place, avec le reste de ce qui règle
     la préview, plutôt qu'une rangée à part que chaque page redessinait.
     Même geste que `Seg`, dont ce composant reprend le vocabulaire visuel :
     un `Seg` n'a qu'une valeur, celui-ci en règle deux sur la même ligne. */
  import { _ } from "svelte-i18n";
  import type { PreviewMode } from "../matrix/Preview.svelte";
  import type { LedStyle } from "../matrix/render";

  type Props = {
    mode: PreviewMode;
    style: LedStyle;
  };

  let { mode = $bindable(), style = $bindable() }: Props = $props();
</script>

<div class="seg">
  <span class="name">{$_("common.pane.render")}</span>
  <div class="opts">
    <div class="segmented" role="group" aria-label={$_("common.pane.scale")}>
      <button type="button" class:on={mode === "phone"} aria-pressed={mode === "phone"} onclick={() => (mode = "phone")}>
        {$_("common.pane.phone")}
      </button>
      <button type="button" class:on={mode === "large"} aria-pressed={mode === "large"} onclick={() => (mode = "large")}>
        {$_("common.pane.large")}
      </button>
    </div>
    <div class="segmented" role="group" aria-label={$_("common.pane.led")}>
      <button type="button" class:on={style === "sharp"} aria-pressed={style === "sharp"} onclick={() => (style = "sharp")}>
        {$_("common.pane.sharp")}
      </button>
      <button type="button" class:on={style === "soft"} aria-pressed={style === "soft"} onclick={() => (style = "soft")}>
        {$_("common.pane.soft")}
      </button>
    </div>
  </div>
</div>

<style>
  .name {
    display: block;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: 0.35rem;
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  /* Deux rails côte à côte, un par réglage — l'échelle et le rendu des LED
     sous un même intitulé faute d'avoir chacun le sien. Habillage dans
     `app.css`, voir `.segmented`. */
</style>

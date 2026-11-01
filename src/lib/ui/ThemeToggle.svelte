<script lang="ts">
  /* Format « LABEL : VALEUR ». L'icône est un disque mi-rempli qui pivote de
     180° — jamais un soleil/lune. Le thème initial a déjà été posé par le
     script inline du <head> ; on se contente de relire l'attribut. */
  import { _ } from "svelte-i18n";
  import { readTheme, toggleTheme } from "./theme";

  let theme = $state(readTheme());

  function toggle() {
    theme = toggleTheme();
  }
</script>

<button type="button" onclick={toggle}>
  <span class="k">{$_("common.theme.label")}</span>
  <span class="sep">:</span>
  <span class="v">{theme === "dark" ? $_("common.theme.dark") : $_("common.theme.light")}</span>
  <span class="icon" class:is-dark={theme === "dark"} aria-hidden="true"></span>
</button>

<style>
  /* Même habillage que les boutons du rack : sans le rail teinté il se lisait
     comme une simple mention de pied de page, pas comme une commande. */
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    background: var(--seg-track);
    border: 0;
    border-radius: 0.7rem;
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dim);
    transition:
      color 0.12s,
      background 0.12s;
  }

  button:hover {
    color: var(--ink);
    background: var(--seg-hover);
  }

  .k {
    color: var(--faint);
  }

  .v {
    color: var(--ink);
  }

  button:hover .k {
    color: var(--dim);
  }

  .icon {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid currentColor;
    background: linear-gradient(90deg, currentColor 0 50%, transparent 50% 100%);
    transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .icon.is-dark {
    transform: rotate(180deg);
  }
</style>

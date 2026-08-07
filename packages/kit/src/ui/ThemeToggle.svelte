<script lang="ts">
  /* Format « LABEL : VALEUR ». L'icône est un disque mi-rempli qui pivote de
     180° — jamais un soleil/lune. Le thème initial a déjà été posé par le
     script inline du <head> ; on se contente de relire l'attribut. */
  import { readTheme, toggleTheme } from "./theme";

  let theme = $state(readTheme());

  function toggle() {
    theme = toggleTheme();
  }
</script>

<button type="button" onclick={toggle}>
  <span class="k">Thème</span>
  <span class="sep">:</span>
  <span class="v">{theme === "dark" ? "Sombre" : "Clair"}</span>
  <span class="icon" class:is-dark={theme === "dark"} aria-hidden="true"></span>
</button>

<style>
  /* Même habillage que les boutons du rack : sans filet il se lisait comme une
     simple mention de pied de page, pas comme une commande. */
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    background: transparent;
    border: 1px solid var(--line-strong);
    border-radius: 0;
    padding: 0.34rem 0.6rem;
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dim);
    transition:
      color 0.12s,
      border-color 0.12s;
  }

  button:hover {
    color: var(--ink);
    border-color: var(--ink);
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

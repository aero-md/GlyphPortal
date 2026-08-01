<script lang="ts">
  /* Format « LABEL : VALEUR ». L'icône est un disque mi-rempli qui pivote de
     180° — jamais un soleil/lune. Le thème initial a déjà été posé par le
     script inline du <head> ; on se contente de relire l'attribut. */
  let theme = $state(document.documentElement.getAttribute("data-theme") ?? "light");

  function toggle() {
    theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("glyphcast:theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0e1013" : "#eff0f1");
  }
</script>

<button type="button" onclick={toggle}>
  <span class="k">Thème</span>
  <span class="sep">:</span>
  <span class="v">{theme === "dark" ? "Sombre" : "Clair"}</span>
  <span class="icon" class:is-dark={theme === "dark"} aria-hidden="true"></span>
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--faint);
  }

  button:hover {
    color: var(--ink);
  }

  .v {
    color: var(--dim);
  }

  button:hover .v {
    color: var(--ink);
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

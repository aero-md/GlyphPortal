<script lang="ts">
  /* Le sélecteur d'appareil de l'en-tête — posé à côté du thème et de la
     langue depuis que le choix de l'appareil a quitté la colonne de préview
     (changement structurel, 2026-09-20). Un seul appareil disponible, et il
     disparaît — un choix entre une option n'est pas un choix, même règle
     qu'avant son déménagement.

     L'option retenue s'inverse en rouge d'accent et non en plein encre comme
     `Seg` : c'est la seule commande d'en-tête qui change ce qui tourne sur
     l'appareil, les bascules voisines ne changent que la façon de le
     regarder — la couleur le distingue au premier coup d'œil, pas seulement
     au libellé. */
  import { _ } from "svelte-i18n";
  import { DEVICES, type Device } from "../matrix/devices";
  import { setDevicePref } from "../matrix/devicePref";

  type Props = {
    device: Device;
    /** Restreindre le choix — un toy 25 × 25 seul, par exemple. */
    devices?: Device[];
  };

  let { device = $bindable(), devices = DEVICES }: Props = $props();

  /* Choisir ici, c'est toujours un choix libre — le sélecteur ne s'affiche
     pas sinon — donc c'est toujours le réglage global qu'on retient, pas
     seulement l'état de la page où il est touché. */
  function pick(d: Device): void {
    device = d;
    setDevicePref(d.id);
  }
</script>

{#if devices.length > 1}
  <div class="dev" role="group" aria-label={$_("common.pane.device")}>
    {#each devices as d (d.id)}
      <button
        type="button"
        class:on={device.id === d.id}
        aria-pressed={device.id === d.id}
        onclick={() => pick(d)}
      >
        Phone {d.ref}
      </button>
    {/each}
  </div>
{/if}

<style>
  .dev {
    flex: none;
    display: flex;
    gap: 0.4rem;
  }

  /* Même habillage que les autres commandes de l'en-tête (bascule de thème,
     lien d'accueil) : le filet du registre, pas un bouton de framework. */
  button {
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--dim);
    border-radius: 0;
    padding: 0.34rem 0.6rem;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }

  button:hover {
    color: var(--ink);
    border-color: var(--ink);
  }

  /* Blanc en dur, pas `--bg` : en clair `--bg` est déjà quasi blanc donc ça ne
     changeait rien à l'œil, mais en sombre `--bg` est quasi noir — le
     libellé retombait sombre sur le rouge au lieu de rester lisible. Le
     rouge d'accent est assez sombre dans les deux thèmes pour porter du
     texte clair sans jamais recalculer lequel. */
  button.on {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
</style>

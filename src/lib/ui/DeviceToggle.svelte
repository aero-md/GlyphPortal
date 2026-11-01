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
  <div class="segmented accent" role="group" aria-label={$_("common.pane.device")}>
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
  /* Rail et surbrillance rouge dans `app.css` — voir `.segmented.accent`. */
  .segmented {
    flex: none;
  }
</style>

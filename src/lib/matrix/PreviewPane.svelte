<script lang="ts">
  /* La colonne de préview complète : les réglages de préview, la matrice, et la
     place d'une note sous celle-ci.

     Les trois sélecteurs sont ici et non dans les apps parce qu'ils ne règlent
     pas le toy — ils règlent la façon de le regarder. « Appareil », « Échelle de
     préview » et « Rendu des LED » ont exactement le même sens pour une image
     convertie, un spectre audio ou une horloge, et chaque préview qui les
     redessinait pour son compte les redessinait un peu différemment.

     L'appareil, lui, est `$bindable` : il change la grille sous le toy, donc
     l'app doit le voir pour recalculer sa trame.

     C'est aussi ici que vit la compaction de la rangée en colonne unique, avec
     les échappées `:global` qu'elle réclame. Elles ne sortent pas du composant,
     là où chaque app en gardait sa copie. */
  import type { Snippet } from "svelte";
  import { _ } from "svelte-i18n";
  import Seg from "../ui/Seg.svelte";

  import { DEVICES, deviceById, type Device } from "./devices";
  import type { Frame } from "./frame";
  import type { LedStyle } from "./render";
  import Preview, { type PreviewMode } from "./Preview.svelte";

  type Props = {
    frame: Frame;
    /** Trame de référence pour l'A/B « maintenir : avant / après ». */
    compare?: Frame | null;
    device: Device;
    mode?: PreviewMode;
    style?: LedStyle;
    /** Restreindre le choix d'appareil — un toy 25 × 25 seul, par exemple. */
    devices?: Device[];
    /**
     * Sélecteurs propres au toy, posés **en tête** de la rangée.
     *
     * L'ordre suit une règle : d'abord ce qui change ce qui tourne sur
     * l'appareil, ensuite ce qui ne change que la façon de le regarder. Le choix
     * du toy passe donc avant celui de l'appareil, qui passe avant l'échelle et
     * le rendu des LED.
     */
    controls?: Snippet;
    /** Note sous la matrice — consigne d'usage, état vide. */
    note?: Snippet;
    /** Libellé de ce que fera l'appui long sur le toy courant. */
    action?: string;
    /** Reçoit l'appui long — la seule commande qu'un Glyph Toy reçoive. */
    onlongpress?: () => void;
    /**
     * Sortant : le Glyph Button de la photo est-il atteignable ? Faux quand le
     * cadre est rogné au-dessus de lui — voir `Preview`. Une app qui pose une
     * commande sur l'appui long s'y lie pour offrir un repli dans son rack.
     */
    buttonReachable?: boolean;
  };

  let {
    frame,
    compare = null,
    device = $bindable(),
    mode = $bindable("phone" as PreviewMode),
    style = $bindable("sharp" as LedStyle),
    devices = DEVICES,
    controls,
    note,
    action,
    onlongpress,
    buttonReachable = $bindable(true),
  }: Props = $props();

  /* Largeur de la colonne, pour que le mode « grand » occupe exactement la
     place du téléphone. Mesurée ici : aucune app n'a de raison de la porter. */
  let colW = $state(550);
</script>

<div class="pane" bind:clientWidth={colW}>
  <div class="scale">
    {@render controls?.()}
    <!-- L'appareil vient avant l'échelle et le rendu : c'est le seul des trois
         qui change ce qui sort de l'outil, les deux autres ne changent que ce
         qu'on en voit. Un seul appareil disponible, et le sélecteur disparaît —
         un choix entre une option n'est pas un choix. -->
    {#if devices.length > 1}
      <Seg
        label={$_("common.pane.device")}
        value={device.id}
        options={devices.map((d) => ({ v: d.id, t: d.ref }))}
        onchange={(id) => (device = deviceById(id))}
      />
    {/if}
    <Seg
      label={$_("common.pane.scale")}
      bind:value={mode}
      options={[
        { v: "phone" as PreviewMode, t: $_("common.pane.phone") },
        { v: "large" as PreviewMode, t: $_("common.pane.large") },
      ]}
    />
    <Seg
      label={$_("common.pane.led")}
      bind:value={style}
      options={[
        { v: "sharp" as LedStyle, t: $_("common.pane.sharp") },
        { v: "soft" as LedStyle, t: $_("common.pane.soft") },
      ]}
    />
  </div>

  <Preview
    {frame}
    {mode}
    {style}
    {compare}
    {action}
    {onlongpress}
    {devices}
    bind:buttonReachable
    width={colW}
  />

  {@render note?.()}
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    min-height: 0;
  }

  .scale {
    flex: none;
    display: flex;
    justify-content: center;
    gap: 1.4rem;
    flex-wrap: wrap;
  }

  /* Colonne unique : voir le même point de rupture dans Shell et les constantes
     FLOOR / COMFY / LANDSCAPE de Preview. Les trois doivent bouger ensemble. */
  @media (max-width: 960px), (max-width: 1080px) and (max-aspect-ratio: 5 / 4) {
    .pane {
      gap: 0.7rem;
    }

    /* Les sélecteurs tiennent sur **une seule ligne**.
       Sur un (3) — 420 px de large, donc 381,6 utiles — les trois groupes
       réclamaient 435 px et passaient à la ligne : 46,5 px de hauteur volés à
       une bande de préview déjà plafonnée à 40 % de l'écran, pour une rangée
       qu'on ne touche qu'une fois par session.

       Trois leviers, dans cet ordre : les libellés sautent, la gouttière et le
       rembourrage se resserrent. Sans les libellés les valeurs restent lisibles
       seules — « (3) / (4a) Pro », « Téléphone / Grand », « Sharp / Soft »
       disent chacune ce qu'elles règlent. Le nom reste porté par l'`aria-label`
       du groupe, il n'est retiré qu'à l'œil.

       Le tout tombe à 331 px, ce qui passe sur un (3) comme sur un écran de
       390 px. `overflow-x` est le filet en dessous — un iPhone SE à 375 px
       déborde encore d'une poignée de pixels : la rangée y défile plutôt que de
       se casser en deux, parce qu'une ligne qui déborde reste une ligne. */
    .scale {
      flex-wrap: nowrap;
      justify-content: flex-start;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .scale::-webkit-scrollbar {
      display: none;
    }

    /* Enfants d'un autre composant : le CSS scopé de Svelte ne les atteint pas
       sans `:global`. Ils restent bornés à `.scale`, donc au seul endroit où la
       contrainte existe — les sélecteurs du rack gardent leur pleine taille. */
    .scale :global(.name) {
      display: none;
    }

    .scale :global(.opts) {
      flex-wrap: nowrap;
    }

    .scale :global(.opts button) {
      padding: 0.34rem 0.4rem;
      font-size: 9px;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }
  }
</style>

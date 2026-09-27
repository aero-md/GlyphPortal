<script lang="ts">
  /* La colonne de préview complète : la matrice et la place d'une note sous
     celle-ci.

     Ni les réglages du toy, ni « Échelle de préview »/« Rendu des LED » n'y
     vivent plus : les premiers ont rejoint la carte [00] de chaque page
     depuis un moment déjà ; les seconds l'ont rejointe à leur tour — voir
     `RenderSeg` — avec le reste de ce qui règle la préview, plutôt qu'une
     rangée à part posée à côté du téléphone. Cette colonne ne fait donc plus
     que dessiner la matrice qu'on lui donne.

     `mode` et `style` restent des props : `Preview` en a besoin pour savoir
     comment dessiner, ce composant se contente de les transmettre.

     `device` reste `$bindable` ici malgré tout : la grille qu'il change est
     celle que cette colonne dessine, donc l'app doit le voir pour recalculer
     sa trame — que le choix vienne de `Shell` ou d'ailleurs ne change rien à
     ça. */
  import type { Snippet } from "svelte";
  import { DEVICES, type Device } from "./devices";
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
    /**
     * Les appareils que `Preview` précharge — un toy 25 × 25 seul, par
     * exemple. Le sélecteur qui s'appuyait dessus a déménagé dans `Shell`,
     * qui prend la même liste ; celle-ci ne sert donc plus qu'au préchargement.
     */
    devices?: Device[];
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
    mode = "phone" as PreviewMode,
    style = "sharp" as LedStyle,
    devices = DEVICES,
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
</style>

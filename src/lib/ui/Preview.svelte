<script module lang="ts">
  export type PreviewMode = "phone" | "large";
</script>

<script lang="ts">
  /* Deux échelles pour la même matrice.
     - « téléphone » : rendue à sa position et à son échelle réelles sur le dos
       d'un Phone (3). Positions en pourcentage du cadre photo, jamais en px —
       c'est ce qui garde le calage quand la préview est redimensionnée.
       Relevé repris de SPECS-PREVIEW.md du repo GlyphLapse.
     - « grand » : le disque seul sur toute la largeur de la colonne, pour lire
       LED par LED ce que fait un réglage. */
  import { onMount } from "svelte";
  import { LED_COUNT, SIZE } from "../matrix";
  import type { Frame } from "../pipeline";
  import { DISC_BG, paint, screenGrid, type Grid, type LedStyle } from "../render";

  /* Calage de la photo. Le diamètre du disque est posé en ligne plutôt qu'en
     CSS : la taille de cellule s'en déduit, une seule source évite qu'un des
     deux dérive. */
  const DISC_PCT = 0.2604;
  const FULL = 576;

  type Props = {
    frame: Frame;
    mode?: PreviewMode;
    style?: LedStyle;
    /** Rendu de comparaison affiché tant que le bouton est maintenu. */
    compare?: Frame | null;
    /** Largeur disponible en px CSS, pour caler la grille du mode « grand ». */
    width?: number;
  };

  let { frame, mode = "phone", style = "sharp", compare = null, width = 576 }: Props = $props();

  let cvs = $state<HTMLCanvasElement>();
  let held = $state(false);
  let dpr = $state(1);

  onMount(() => {
    const sync = () => (dpr = window.devicePixelRatio || 1);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  });

  /* La préview n'est jamais réduite pour tenir dans la fenêtre : à 576 px de
     large le disque fait 150 px, soit les 6 px CSS par LED de l'échelle réelle
     de l'appareil — la rétrécir viderait le mode « téléphone » de son sens. Si
     elle ne rentre pas en hauteur, c'est la page qui défile (voir App). Seule
     une colonne plus étroite que 576 px la contraint. */
  const size = $derived(Math.min(FULL, width));

  /* Mode téléphone : la cellule suit le diamètre réellement affiché, pas une
     valeur figée — sur colonne étroite la trame deviendrait irrégulière. Mode
     grand : la plus grande cellule entière qui tient dans la colonne, un pas
     fractionnaire élargirait une colonne sur n. */
  const grid = $derived<Grid>(
    mode === "phone"
      ? screenGrid((size * DISC_PCT) / SIZE, dpr)
      : screenGrid(Math.max(6, Math.floor(size / SIZE)), dpr),
  );

  $effect(() => {
    if (!cvs) return;
    const g = grid;
    if (cvs.width !== g.size) cvs.width = cvs.height = g.size;
    const ctx = cvs.getContext("2d");
    if (ctx) paint(ctx, held && compare ? compare : frame, g, { style });
  });

  function hold(on: boolean) {
    if (!compare) return;
    held = on;
  }

  const holdHandlers = {
    onpointerdown: () => hold(true),
    onpointerup: () => hold(false),
    onpointerleave: () => hold(false),
    onpointercancel: () => hold(false),
    onkeydown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && hold(true),
    onkeyup: () => hold(false),
    onclick: (e: MouseEvent) => e.preventDefault(),
    oncontextmenu: (e: Event) => e.preventDefault(),
  };
</script>

<figure class="device">
  {#if mode === "phone"}
    <div class="phone" style="width:{size}px">
      <img src="/phone3-back.webp" alt="Dos d'un Nothing Phone (3)" draggable="false" />

      <div class="disc" style="width:{DISC_PCT * 100}%;background:{DISC_BG[style]}">
        <canvas bind:this={cvs}></canvas>
      </div>

      <button
        class="glyphbtn"
        class:is-held={held}
        disabled={!compare}
        aria-label="Glyph Button — maintenir pour comparer avec le rendu sans réglages"
        {...holdHandlers}
      ></button>

      <span class="hint" class:on={held}>{held ? "Rendu brut" : "Maintenir"}</span>
    </div>
  {:else}
    <div
      class="disc big"
      style="width:{grid.cssSize}px;height:{grid.cssSize}px;background:{DISC_BG[style]}"
    >
      <canvas bind:this={cvs}></canvas>
    </div>
    <button class="ab" class:is-held={held} disabled={!compare} {...holdHandlers}>
      {held ? "Rendu brut" : "Maintenir : avant / après"}
    </button>
  {/if}

  <figcaption>
    <span class="k">LED allumées</span>
    <span class="v">[{String(frame.lit).padStart(3, "0")} / {LED_COUNT}]</span>
    <span class="k">Moyenne</span>
    <span class="v">{Math.round(frame.mean * 100)} %</span>
    <span class="k">Échelle</span>
    <span class="v">{grid.cell} px / LED</span>
  </figcaption>
</figure>

<style>
  .device {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
  }

  /* largeur posée en ligne : la taille de cellule s'en déduit */
  .phone {
    position: relative;
    aspect-ratio: 704 / 913;
  }

  .phone img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    /* hors du hit-test : sinon l'appui long sur le bouton, qui la recouvre,
       ouvre le menu contextuel « enregistrer l'image » de Chrome Android */
    pointer-events: none;
    -webkit-user-drag: none;
    user-select: none;
    /* fondu plutôt qu'un aplat superposé, sinon la trame de fond de page
       disparaîtrait sur la bande basse */
    -webkit-mask-image: linear-gradient(to bottom, #000 86%, transparent 99%);
    mask-image: linear-gradient(to bottom, #000 86%, transparent 99%);
  }

  /* la couleur de fond vient du style de LED, posée en inline */
  .disc {
    border-radius: 50%;
    overflow: hidden;
  }

  /* largeur posée en ligne depuis DISC_PCT */
  .phone .disc {
    position: absolute;
    left: 79.53%;
    top: 15.36%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
  }

  .disc.big {
    max-width: 100%;
    box-shadow: 0 0 0 1px var(--line-strong);
  }

  .disc canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* bouton Glyph, calé sur le bouton physique de la photo */
  .glyphbtn {
    position: absolute;
    left: 84.53%;
    top: 74.82%;
    width: 15.86%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    /* accent en valeur fixe, jamais var(--accent) : le bouton est sur le corps
       noir de l'appareil, le rouge clair est le seul qui tienne en thème clair
       comme en sombre */
    border: 1px solid #ff3b2e;
    padding: 0;
    background: transparent;
    cursor: pointer;
    /* tactile : le navigateur ne doit prendre l'appui ni pour un début de
       scroll ni pour un appui long système */
    touch-action: none;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.12s;
  }

  .glyphbtn:disabled {
    border-color: rgba(255, 255, 255, 0.28);
    cursor: default;
  }

  .glyphbtn:not(:disabled):hover {
    border-width: 2px;
  }

  .glyphbtn.is-held {
    background: #ff3b2e;
    border-width: 2px;
  }

  .hint {
    position: absolute;
    left: 74.6%;
    top: 74.82%;
    transform: translate(-100%, -50%);
    white-space: nowrap;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    /* posé sur le corps noir du téléphone, pas sur la page : cette couleur ne
       peut pas suivre le thème, elle doit tenir sur du noir dans les deux */
    color: rgba(255, 255, 255, 0.45);
    pointer-events: none;
  }

  .hint.on {
    color: #ff3b2e;
  }

  /* équivalent du Glyph Button quand il n'y a pas de téléphone à l'écran */
  .ab {
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--dim);
    border-radius: 0;
    padding: 0.34rem 0.7rem;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    touch-action: none;
    user-select: none;
  }

  .ab:not(:disabled):hover {
    color: var(--ink);
    border-color: var(--ink);
  }

  .ab:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ab.is-held {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }

  figcaption {
    display: flex;
    align-items: baseline;
    gap: 0.5rem 0.9rem;
    flex-wrap: wrap;
    justify-content: center;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  figcaption .k {
    color: var(--faint);
  }

  figcaption .k::after {
    content: " :";
  }

  figcaption .v {
    color: var(--ink);
  }
</style>

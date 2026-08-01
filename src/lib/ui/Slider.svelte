<script lang="ts">
  /* Réglage continu, format « LABEL : VALEUR ». Le curseur est un plot carré
     sur un filet de 1 px : la portion parcourue est pleine, le reste est un
     filet. L'état se lit sans lire la valeur. */
  type Props = {
    label: string;
    value: number;
    /** Bornes, prises dans RANGES pour que curseur et import ne divergent pas. */
    range: readonly [number, number];
    /** « any » par défaut : un pas numérique fait snapper le navigateur sur
        l'échelle min + n·pas, et 0,2 + 80 × 0,01 ne vaut pas 1 en flottant —
        un zoom laissé au repos s'affichait à 99 %. Pas explicite = réglage
        réellement discret (rotation au degré, paliers de LED). */
    step?: number | "any";
    /** Valeur de repos — double-clic sur le libellé pour y revenir. */
    reset?: number;
    /** Mise en forme de la valeur affichée. */
    format?: (v: number) => string;
    unit?: string;
  };

  let {
    label,
    value = $bindable(),
    range,
    step = "any",
    reset,
    format,
    unit = "",
  }: Props = $props();

  const min = $derived(range[0]);
  const max = $derived(range[1]);
  const shown = $derived(format ? format(value) : value.toFixed(2));
  const pct = $derived(((value - min) / (max - min)) * 100);
  const dirty = $derived(
    reset !== undefined && Math.abs(value - reset) > (max - min) * 1e-4,
  );
</script>

<div class="slider">
  <div class="head">
    <button
      type="button"
      class="name"
      class:dirty
      disabled={reset === undefined}
      onclick={() => reset !== undefined && (value = reset)}
      title={reset !== undefined ? "Revenir au repos" : undefined}
    >
      {label}
    </button>
    <span class="val">{shown}{unit}</span>
  </div>
  <div class="track" style="--pct:{pct}%">
    <input type="range" {min} {max} {step} bind:value aria-label={label} />
  </div>
</div>

<style>
  .slider {
    display: block;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .name {
    background: none;
    border: none;
    padding: 0;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    cursor: pointer;
    text-align: left;
  }

  .name:disabled {
    cursor: default;
  }

  .name:not(:disabled):hover {
    color: var(--ink);
  }

  /* pastille pleine = le réglage a été touché, il ne vaut plus son repos */
  .name.dirty::after {
    content: "";
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
    margin-left: 0.5em;
    vertical-align: 2px;
  }

  .val {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--ink);
    white-space: nowrap;
  }

  .track {
    position: relative;
    height: 16px;
    display: flex;
    align-items: center;
  }

  /* filet complet + portion parcourue en plein encre */
  .track::before,
  .track::after {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    height: 1px;
    pointer-events: none;
  }

  .track::before {
    width: 100%;
    background: var(--line-strong);
  }

  .track::after {
    width: var(--pct);
    background: var(--ink);
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 16px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 3px;
    height: 14px;
    border-radius: 0;
    border: none;
    background: var(--ink);
  }

  input[type="range"]::-moz-range-thumb {
    width: 3px;
    height: 14px;
    border-radius: 0;
    border: none;
    background: var(--ink);
  }

  input[type="range"]:hover::-webkit-slider-thumb {
    background: var(--accent);
  }

  input[type="range"]:hover::-moz-range-thumb {
    background: var(--accent);
  }

  input[type="range"]:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 3px;
  }
</style>

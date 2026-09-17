<script lang="ts">
  /* Pavé de simulation à deux axes : ce que G-Forces et Float lisent sur un
     accéléromètre réel, ici donné au doigt. La position est normalisée en
     [-1, 1] sur les deux axes et bornée au disque — un coin du pavé ne veut
     rien dire de plus que son bord.

     `springBack` distingue les deux usages : G-Forces simule une **poussée**,
     qui cesse dès qu'on lâche le volant — le point revient au centre. Float
     simule une **pose** qu'on tient — le point reste où on l'a laissé, comme
     un téléphone qu'on continue de tenir penché. */
  type Props = {
    x: number;
    y: number;
    springBack?: boolean;
    label?: string;
    disabled?: boolean;
    onchange?: (x: number, y: number) => void;
    onrelease?: () => void;
  };

  let { x = $bindable(0), y = $bindable(0), springBack = false, label, disabled = false, onchange, onrelease }: Props = $props();

  let el = $state<HTMLDivElement | null>(null);
  let dragging = $state(false);

  function fromEvent(e: PointerEvent): void {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    const mag = Math.hypot(nx, ny);
    const clamped = mag > 1 ? mag : 1;
    x = nx / clamped;
    y = ny / clamped;
    onchange?.(x, y);
  }

  function down(e: PointerEvent): void {
    if (disabled) return;
    dragging = true;
    el?.setPointerCapture(e.pointerId);
    fromEvent(e);
  }

  function move(e: PointerEvent): void {
    if (!dragging) return;
    fromEvent(e);
  }

  function up(): void {
    if (!dragging) return;
    dragging = false;
    if (springBack) {
      x = 0;
      y = 0;
      onchange?.(0, 0);
    }
    onrelease?.();
  }

  const px = $derived(50 + x * 50);
  const py = $derived(50 + y * 50);
</script>

<div class="wrap">
  {#if label}<span class="name">{label}</span>{/if}
  <div
    bind:this={el}
    class="pad"
    class:dragging
    class:disabled
    role="slider"
    tabindex={disabled ? -1 : 0}
    aria-label={label}
    aria-valuenow={Math.round(Math.hypot(x, y) * 100)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <span class="axis h"></span>
    <span class="axis v"></span>
    <span class="dot" style="left:{px}%;top:{py}%"></span>
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .name {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .pad {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    max-width: 220px;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    background: var(--bg-2);
    touch-action: none;
    cursor: crosshair;
    -webkit-tap-highlight-color: transparent;
  }

  .pad.disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }

  .pad.dragging {
    border-color: var(--accent);
  }

  .axis {
    position: absolute;
    background: var(--line);
    pointer-events: none;
  }

  .axis.h {
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
  }

  .axis.v {
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
  }

  .dot {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: var(--ink);
    pointer-events: none;
    transition: background 0.12s;
  }

  .pad.dragging .dot {
    background: var(--accent);
  }
</style>

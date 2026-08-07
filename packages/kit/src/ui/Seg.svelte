<script lang="ts" generics="T extends string | number">
  /* Sélecteur exclusif. L'option retenue s'inverse en plein encre : l'état se
     lit à la forme, pas seulement à la couleur. */
  type Props = {
    label?: string;
    value: T;
    options: { v: T; t: string }[];
    onchange?: (v: T) => void;
  };

  let { label, value = $bindable(), options, onchange }: Props = $props();

  function pick(v: T) {
    value = v;
    onchange?.(v);
  }
</script>

<div class="seg">
  {#if label}<span class="name">{label}</span>{/if}
  <div class="opts" role="group" aria-label={label}>
    {#each options as o (o.v)}
      <button
        type="button"
        class:on={value === o.v}
        aria-pressed={value === o.v}
        onclick={() => pick(o.v)}
      >
        {o.t}
      </button>
    {/each}
  </div>
</div>

<style>
  .name {
    display: block;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: 0.35rem;
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  button {
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--dim);
    border-radius: 0;
    padding: 0.34rem 0.6rem;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
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

  button.on {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
  }
</style>

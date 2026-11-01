<script lang="ts" generics="T extends string | number">
  /* Sélecteur exclusif. Un seul rectangle arrondi, l'option retenue y est en
     surbrillance — voir `.segmented` dans `app.css`. */
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
  <div class="segmented" role="group" aria-label={label}>
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

  /* Le rail et ses boutons sont dans `app.css` — voir `.segmented`. */
</style>

<script lang="ts">
  /* Rendu nu d'une carte de partage — le vrai moteur de rendu, pas une
     imitation typographique. Ce que voit un crawler qui déplie un lien de
     glyph.suns.red n'était jamais le sujet du portail : la matrice.
     `scripts/og.ts` navigue ici avec un navigateur sans tête et capture le
     viewport tel quel — pas de titre, pas de chrome, juste ce qu'un visiteur
     vient regarder.

     Slug pris dans la query (`?slug=glyphslot`) et non dans un segment de
     route : cette appli vit hors de SvelteKit, voir vite.config.ts. */
  import Preview from "$lib/matrix/Preview.svelte";
  import { deviceForDesign, designSampler, isDesign, type Design } from "$lib/matrix/design";
  import type { Frame } from "$lib/matrix/frame";
  import { TOYS, type Slug } from "../src/routes/toys";

  /* Instant gelé, en fraction de la boucle — proche de la fin plutôt qu'au
     milieu : une boucle de toy part en général d'un écran vide et se termine
     sur son état abouti. Même convention que `poster` dans ToyPreview.

     Sonoglyph fait exception : sa boucle finit dans la phase spectre, où
     l'instant proche de la fin retombe régulièrement sur un blob illisible.
     0,3 tombe dans les quatre premières secondes — la phase aiguille — sur un
     cadran net. */
  const DEFAULT_POSTER = 0.94;
  const POSTER: Partial<Record<Slug, number>> = { sonoglyph: 0.3 };

  function previewUrl(slug: string): string | undefined {
    const toy = TOYS.find((t) => t.slug === slug);
    if (!toy?.preview) return undefined;
    return Array.isArray(toy.preview) ? toy.preview[0] : toy.preview;
  }

  async function sample(url: string, slug: string): Promise<Frame | null> {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isDesign(data)) return null;
    const design = data as Design;
    const device = deviceForDesign(design);
    if (!device) return null;
    const s = designSampler(design, device);
    const poster = POSTER[slug as Slug] ?? DEFAULT_POSTER;
    return s.frameAt(s.duration * poster);
  }

  const slug = new URLSearchParams(location.search).get("slug") ?? "";

  /* Deux rangées, 3 puis 2 — pas un flex-wrap laissé libre : à 5 entrées,
     un retour à la ligne spontané dépend de la largeur exacte des disques et
     peut aussi bien tomber en 4+1. Le découpage est explicite. */
  const mosaicRows = $derived([mosaic.slice(0, 3), mosaic.slice(3)]);

  let single = $state<Frame | null>(null);
  let mosaic = $state<{ slug: Slug; frame: Frame }[]>([]);

  if (slug === "home") {
    Promise.all(
      TOYS.map(async (t) => {
        const url = previewUrl(t.slug);
        const frame = url ? await sample(url, t.slug) : null;
        return frame ? { slug: t.slug, frame } : null;
      }),
    ).then((rows) => {
      mosaic = rows.filter((r): r is { slug: Slug; frame: Frame } => !!r);
    });
  } else if (slug) {
    const url = previewUrl(slug);
    if (url) sample(url, slug).then((frame) => (single = frame));
  }
</script>

<div class="stage">
  {#if slug === "home"}
    <div class="mosaic">
      {#each mosaicRows as row, i (i)}
        <div class="row">
          {#each row as m (m.slug)}
            <Preview frame={m.frame} mode="large" width={260} />
          {/each}
        </div>
      {/each}
    </div>
  {:else if single}
    <Preview frame={single} mode="phone" width={430} />
  {/if}
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    height: 100%;
  }

  .stage {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .mosaic {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 48px;
  }
</style>

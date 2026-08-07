<script lang="ts">
  /* Le sommaire. Il ne rend aucune matrice — c'est la seule page du domaine
     dans ce cas — donc il n'emprunte pas la coquille `Shell`, qui est bâtie
     autour de deux colonnes dont une porte un téléphone. Il reprend en revanche
     tout le reste : les repères d'angle, le wordmark, la bascule de thème, les
     étages typographiques.

     Une tuile par toy, et rien d'autre dedans que la préview du toy et une
     ligne qui dit ce qu'il fait. Pas de nom, pas de sous-titre, pas de bouton :
     la tuile *est* le lien, et ce qui tourne dedans identifie le toy mieux que
     son nom en capitales. Le nom survit dans l'`aria-label`, sans quoi le lien
     n'aurait pas de nom accessible. */
  import ThemeToggle from "@glyph/kit/ThemeToggle.svelte";
  import Wordmark from "@glyph/kit/Wordmark.svelte";
  import { TOYS } from "./toys";
</script>

<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page">
  <header>
    <Wordmark text="GLYPH" cell={8} />
    <div class="h-row">
      <p class="sub meta">
        Index de glyph toys par <a
          class="by"
          href="https://github.com/aero-md"
          target="_blank"
          rel="noopener noreferrer">Aero-md</a
        >
      </p>
      <ThemeToggle />
    </div>
  </header>

  <main>
    <ul class="grid">
      {#each TOYS as toy (toy.slug)}
        <li>
          <a
            class="tile"
            class:soon={!toy.ready}
            href={toy.ready ? `/${toy.slug}/` : toy.repo}
            aria-label="{toy.name} — {toy.line}"
          >
            <!-- Emplacement de la préview. Disque noir en attendant : c'est la
                 forme et l'encombrement définitifs, la tuile est déjà à sa
                 hauteur finale. -->
            <span class="disc" aria-hidden="true"></span>
            <span class="body">
              <span class="line">{toy.line}</span>
              {#if !toy.ready}
                <!-- Sans le libellé « Ouvrir », plus rien ne distinguerait une
                     tuile qui mène à une préview d'une tuile qui mène à un
                     dépôt. Ce mot est la seule chose qui les sépare. -->
                <span class="tag label">à venir</span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </main>
</div>

<style>
  /* Le sommaire défile, lui : il n'a pas de zone à garder fixe, et sur un
     écran court la liste doit pouvoir descendre. */
  .page {
    position: relative;
    z-index: 2;
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 2.4rem 2.5rem;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  header {
    flex: none;
    border-bottom: 1px solid var(--line);
    padding: 2.4rem 0 1rem;
    margin-bottom: 2rem;
  }

  .h-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.9rem;
  }

  .sub {
    margin: 0;
    min-width: 0;
  }

  /* Même main, même destination que la signature au pied de chaque préview. */
  .by {
    color: var(--ink);
  }

  main {
    flex: 1 1 auto;
  }

  /* Deux par ligne, en colonnes fixes de 500 px : les tuiles ont toutes le même
     contenu et la même hauteur, les laisser s'étirer sur la largeur disponible
     ne remplirait rien. */
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 500px);
    justify-content: center;
    gap: 2rem;
  }

  /* Rangée : la préview, puis ce qu'elle fait. La hauteur de la tuile n'est
     déclarée nulle part — c'est le disque plus le rembourrage, et c'est ce
     qu'on veut : elle suivra la préview réelle quand elle remplacera le
     placeholder. */
  .tile {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    padding: 2rem;
    /* Pas de filet : c'est la surface qui détoure la tuile. Les deux ensemble
       feraient panneau, et la page n'a qu'un seul registre de traits fins. */
    border-radius: 1rem;
    background: var(--bg-2);
    transition: background 0.12s;
  }

  /* Un jeton dédié plutôt que `--hover`, qui est translucide : posé en fond
     opaque il assombrirait la tuile en thème sombre, c'est-à-dire dans le
     mauvais sens. Ici la surface se rapproche de l'encre dans les deux thèmes. */
  .tile:hover,
  .tile:focus-visible {
    background: var(--bg-2-hover);
    text-decoration: none;
  }

  .disc {
    flex: none;
    width: 150px;
    height: 150px;
    border-radius: 50%;
    /* Fixe et non dérivé du thème : c'est la surface d'un appareil, pas celle
       de la page. Le dos d'un Nothing Phone est noir dans les deux thèmes. */
    background: #0a0b0d;
  }

  .body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* Sans fioriture : ni capitales, ni interlettrage. C'est une phrase, elle se
     lit comme une phrase — tout le reste de la page est déjà en registre
     technique. */
  .line {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink);
  }

  .tile:hover .line {
    color: var(--accent);
  }

  .soon .line {
    color: var(--dim);
  }

  .tag {
    color: var(--faint);
  }

  /* Sous 1200 px, une par ligne, et la tuile prend la largeur — jusqu'à 800 px,
     au-delà desquels le disque et sa ligne se retrouveraient aux deux bouts
     d'un ruban vide. Deux colonnes de tuiles étirées ne rentrent pas ici : à
     1199 px il resterait 545 px par colonne, soit une tuile plus étroite que
     celle du mode large. */
  @media (max-width: 1199px) {
    .grid {
      grid-template-columns: minmax(0, 800px);
    }
  }

  @media (max-width: 720px) {
    .page {
      padding: 0 1.2rem 2.5rem;
    }

    /* En colonne étroite le disque et le texte côte à côte laissent moins de
       120 px à la phrase, qui se casse en cinq lignes. Ils s'empilent, et le
       disque garde sa taille : c'est la préview, c'est ce qu'on vient voir. */
    .tile {
      flex-direction: column;
      align-items: flex-start;
      gap: 1.2rem;
      padding: 1.6rem;
    }
  }
</style>

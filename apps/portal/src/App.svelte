<script lang="ts">
  /* Le sommaire. Il ne rend aucune matrice — c'est la seule page du domaine
     dans ce cas — donc il n'emprunte pas la coquille `Shell`, qui est bâtie
     autour de deux colonnes dont une porte un téléphone. Il reprend en revanche
     le reste : les repères d'angle, la bascule de thème, les étages
     typographiques.

     Pas de wordmark ici. Chaque préview en porte un, et il y nomme ce qu'on
     regarde ; sur un index il ne nommerait que le domaine, qui est déjà dans la
     barre d'adresse. Ce qui reste tient en une ligne.

     Une tuile par toy, numérotée comme les cartes de réglage des préviews : le
     sommaire se lit comme un rack, ce qui est exactement ce qu'il est. */
  import ThemeToggle from "@glyph/kit/ThemeToggle.svelte";
  import { TOYS } from "./toys";

  const num = (i: number) => String(i + 1).padStart(2, "0");
</script>

<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page">
  <header>
    <p class="sub meta">
      Index de glyph toys par <a
        class="by"
        href="https://github.com/aero-md"
        target="_blank"
        rel="noopener noreferrer">Aero-md</a
      >
    </p>
    <ThemeToggle />
  </header>

  <main>
    <ul class="grid">
      {#each TOYS as toy, i (toy.slug)}
        <li>
          <a class="tile" class:soon={!toy.ready} href={toy.ready ? `/${toy.slug}/` : toy.repo}>
            <!-- Numéro et nom sur la même ligne de base, sous-titre dessous, le
                 tout calé en haut : la tuile tire sa hauteur du disque, et un
                 bloc de deux lignes centré dedans laisserait le numéro flotter
                 au milieu du bord gauche. -->
            <span class="head">
              <span class="ref">[{num(i)}]</span>
              <span class="body">
                <span class="name">{toy.name}</span>
                <span class="line">{toy.line}</span>
                {#if !toy.ready}
                  <!-- Sans le libellé « Ouvrir », plus rien ne distinguerait une
                       tuile qui mène à une préview d'une tuile qui mène à un
                       dépôt. Ce mot est la seule chose qui les sépare. -->
                  <span class="tag label">à venir</span>
                {/if}
              </span>
            </span>
            <!-- Emplacement de la préview. Disque noir en attendant : c'est la
                 forme et l'encombrement définitifs, la tuile est déjà à sa
                 hauteur finale. -->
            <span class="disc" aria-hidden="true"></span>
          </a>
        </li>
      {/each}
    </ul>
  </main>
</div>

<style>
  /* Tout est centré dans la fenêtre : l'index est court, et posé en haut d'un
     écran de bureau il laissait les deux tiers de la page vides sous lui.

     `safe center` et non `center` : dès que le contenu dépasse la fenêtre — en
     colonne unique, quatre tuiles empilées font le double d'un écran de
     téléphone — un centrage strict déborde des DEUX côtés, et ce qui sort par
     le haut n'est atteignable par aucun défilement. Le mot-clé rend la main au
     bord de départ dans ce cas. Un navigateur qui ne le connaît pas jette la
     déclaration entière et laisse tout en haut, ce qui est exactement le repli
     qu'on voudrait. */
  .page {
    position: relative;
    z-index: 2;
    max-width: 1120px;
    margin: 0 auto;
    padding: 2.5rem 2.4rem;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    background: var(--bg);
  }

  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--line);
    padding-bottom: 1rem;
    margin-bottom: 2rem;
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
    flex: none;
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

  /* La hauteur de la tuile n'est déclarée nulle part — c'est le disque plus le
     rembourrage, et c'est ce qu'on veut : elle suivra la préview réelle quand
     elle remplacera le placeholder. */
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

  /* `baseline` et non `flex-start` : le numéro est en 12 px, le nom en 14, et
     alignés par le haut ils flottaient l'un au-dessus de l'autre. La ligne de
     base du bloc, c'est celle de sa première ligne — donc celle du nom. */
  .head {
    align-self: flex-start;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
  }

  .head .ref {
    flex: none;
  }

  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .name {
    font-size: 14px;
    letter-spacing: 0.22em;
    color: var(--ink);
  }

  .tile:hover .name {
    color: var(--accent);
  }

  /* Sans fioriture : ni capitales, ni interlettrage. C'est une phrase, elle se
     lit comme une phrase — le nom au-dessus tient déjà le registre technique. */
  .line {
    font-size: 12px;
    line-height: 1.6;
    color: var(--dim);
  }

  .soon .name {
    color: var(--dim);
  }

  .tag {
    color: var(--faint);
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

  /* Sous 1200 px, une par ligne, et la tuile prend la largeur — jusqu'à 800 px,
     au-delà desquels le titre et le disque se retrouveraient aux deux bouts
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
      padding: 1.6rem 1.2rem;
    }

    /* En colonne étroite le texte et le disque côte à côte laissent moins de
       120 px au sous-titre, qui se casse en cinq lignes. Ils s'empilent, et le
       disque garde sa taille : c'est la préview, c'est ce qu'on vient voir. */
    .tile {
      flex-direction: column;
      align-items: flex-start;
      gap: 1.2rem;
      padding: 1.6rem;
    }

    .head {
      align-self: stretch;
    }
  }
</style>

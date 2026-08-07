<script lang="ts">
  /* Le sommaire. Il ne rend aucune matrice — c'est la seule page du domaine
     dans ce cas — donc il n'emprunte pas la coquille `Shell`, qui est bâtie
     autour de deux colonnes dont une porte un téléphone. Il reprend en revanche
     tout le reste : la trame de points, les repères d'angle, le wordmark, la
     bascule de thème, les étages typographiques.

     Une ligne par toy, numérotée comme les cartes de réglage des préviews : le
     sommaire se lit comme un rack, ce qui est exactement ce qu'il est. */
  import ThemeToggle from "@glyph/kit/ThemeToggle.svelte";
  import Wordmark from "@glyph/kit/Wordmark.svelte";
  import { TOYS } from "./toys";

  const YEAR = new Date().getFullYear();
  const num = (i: number) => String(i + 1).padStart(2, "0");
</script>

<div class="dots"></div>
<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page">
  <header>
    <Wordmark text="GLYPH" cell={8} />
    <div class="h-row">
      <p class="sub meta">Préviews web des Glyph Toys pour Nothing Phone</p>
      <ThemeToggle />
    </div>
  </header>

  <main>
    <ul class="rack">
      {#each TOYS as toy, i (toy.slug)}
        <li>
          <a class="row" class:soon={!toy.ready} href={toy.ready ? `/${toy.slug}/` : toy.repo}>
            <span class="ref">[{num(i)}]</span>
            <span class="body">
              <span class="name">{toy.name}</span>
              <span class="line">{toy.line}</span>
              <span class="detail">{toy.detail}</span>
            </span>
            <!-- L'état est porté par un mot, pas par une nuance de gris : « à
                 venir » se lit, un lien 8 % plus pâle ne se lit pas. -->
            <span class="go label">{toy.ready ? "Ouvrir ▸" : "Dépôt ▸ à venir"}</span>
          </a>
        </li>
      {/each}
    </ul>

    <p class="note">
      Chaque préview reproduit la Glyph Matrix à sa position et à son échelle réelles sur une photo
      du dos de l'appareil. Tout tourne en local, dans le navigateur : rien n'est envoyé nulle part.
    </p>
  </main>

  <footer>
    <div class="f-row">
      <span class="ref">[glyph.suns.red]</span>
      <span class="meta">
        Grille row-major masquée par un disque centré — 25×25 → 489 LEDs sur un Phone (3), 13×13 →
        137 sur un (4a) Pro.
      </span>
      <a class="sig" href="https://github.com/aero-md" target="_blank" rel="noopener noreferrer">
        © {YEAR} aero-md
      </a>
    </div>
  </footer>
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
    margin-bottom: 1.6rem;
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

  main {
    flex: 1 1 auto;
  }

  .rack {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Une ligne = une carte du rack des préviews, aplatie : même filet, même
     rembourrage, même inversion au survol que les boutons. */
  .row {
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    border: 1px solid var(--line);
    padding: 1.1rem 1.2rem;
    transition:
      background 0.12s,
      border-color 0.12s;
  }

  .row:hover,
  .row:focus-visible {
    background: var(--hover);
    border-color: var(--accent);
    text-decoration: none;
  }

  .row .ref {
    flex: none;
  }

  .body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .name {
    font-size: 14px;
    letter-spacing: 0.22em;
    color: var(--ink);
  }

  .line {
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--dim);
  }

  .detail {
    font-size: 11px;
    line-height: 1.65;
    color: var(--faint);
  }

  .go {
    flex: none;
    white-space: nowrap;
  }

  .row:hover .go {
    color: var(--accent);
  }

  /* Pas de `pointer-events: none` : la ligne reste cliquable, elle mène au
     dépôt. Ce qui change, c'est ce qu'elle promet. */
  .soon .name {
    color: var(--dim);
  }

  /* Mesure calée sur la ligne de pied, pas sur les rangées : à 11 px de mono
     une ligne pleine largeur ferait 170 caractères, qu'on ne relit pas. */
  .note {
    margin: 1.6rem 0 0;
    max-width: 88ch;
    font-size: 11px;
    line-height: 1.7;
    color: var(--faint);
  }

  footer {
    flex: none;
    margin-top: 2.4rem;
    border-top: 1px solid var(--line);
    padding: 1rem 0 0;
  }

  .f-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .f-row .meta {
    flex: 1 1 320px;
    text-transform: none;
    letter-spacing: 0.04em;
    line-height: 1.6;
  }

  .sig {
    flex: none;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    white-space: nowrap;
    transition: color 0.12s;
  }

  .sig:hover,
  .sig:focus-visible {
    color: var(--ink);
  }

  /* Sous 720 px la ligne se casse : le libellé d'action passe sous le corps
     plutôt que de comprimer le nom du toy à trois caractères par ligne. */
  @media (max-width: 720px) {
    .page {
      padding: 0 1.2rem 2.5rem;
    }

    .row {
      flex-wrap: wrap;
      gap: 0.6rem 1rem;
    }

    .go {
      width: 100%;
    }
  }
</style>

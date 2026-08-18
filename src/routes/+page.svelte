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
  import LangToggle from "$lib/i18n/LangToggle.svelte";
  import { _ } from "svelte-i18n";
  import ThemeToggle from "$lib/ui/ThemeToggle.svelte";
  import ToyPreview from "$lib/matrix/ToyPreview.svelte";
  import { TOYS } from "./toys";

  /* Encombrement de la mini-prévisu, en px CSS. Déclaré ici et passé au
     composant plutôt que laissé à son défaut : c'est la mise en page de la tuile
     qui en décide.

     C'est un plafond : le disque obtenu tombe un peu en dessous, la cellule
     étant un nombre entier de pixels. Le mou reste dans la boîte, donc la
     hauteur de la tuile ne bouge ni avec l'appareil ni avec la densité de
     l'écran.

     159 et non un compte rond : c'est la valeur qui, sur un (3) en densité 1,
     pose exactement le placement réglé à l'inspecteur — cellule de 5 px, champ
     de 125, cerne de 8, disque de 141 centré à 9 px et canvas à 17. Un compte
     rond aurait laissé le disque plus petit ou décentré d'un demi-pixel. */
  const DISC = 159;

  const num = (i: number) => String(i + 1).padStart(2, "0");

  /* Une boucle par tuile, tirée au sort parmi celles que le toy propose.
     Résolu **une fois**, au montage de la page, et non dans le balisage : un
     `$derived` ou un appel dans le `{#each}` se réévaluerait à chaque rendu, et
     la mini-prévisu changerait d'appareil sous le curseur au premier survol. Ce
     tirage-là doit tenir tant que la page est ouverte. */
  const tuiles = TOYS.map((toy) => ({
    ...toy,
    preview: Array.isArray(toy.preview)
      ? toy.preview[Math.floor(Math.random() * toy.preview.length)]
      : toy.preview,
  }));
</script>

<!-- Titre et description par page. Le monorepo les portait dans cinq
     `index.html` ; ici le `<head>` est commun et chaque route y ajoute ce qui
     lui est propre. -->
<svelte:head>
  <title>GLYPH</title>
  <meta name="description" content={$_("home.description")} />
</svelte:head>

<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page">
  <header>
    <p class="sub meta">
      {$_("home.intro")}
      <a class="by" href="https://github.com/aero-md" target="_blank" rel="noopener noreferrer"
        >aero-md</a
      >
    </p>
    <div class="h-tools">
      <ThemeToggle />
      <LangToggle />
    </div>
  </header>

  <main>
    <ul class="grid">
      {#each tuiles as toy, i (toy.slug)}
        <li>
          <a class="tile" class:soon={!toy.ready} href={toy.ready ? `/${toy.slug}/` : toy.repo}>
            <!-- La nature de l'entrée, sur la tranche. Première dans le DOM :
                 c'est aussi l'ordre de lecture d'un lecteur d'écran, et
                 « Glyph toy, 01, GLYPHSLOT, une machine à sous » est la bonne
                 phrase. Pas d'`aria-hidden` donc — ce n'est pas de la
                 décoration, c'est la seule chose qui distingue un APK d'un
                 outil qui tourne dans cet onglet. -->
            <span class="spine">{$_(`common.kind.${toy.kind}`)}</span>

            <!-- Numéro et nom sur la même ligne de base, sous-titre dessous, le
                 tout calé en haut : la tuile tire sa hauteur du disque, et un
                 bloc de deux lignes centré dedans laisserait le numéro flotter
                 au milieu du bord gauche. -->
            <span class="head">
              <span class="ref">[{num(i)}]</span>
              <span class="body">
                <span class="name">{toy.name}</span>
                <span class="line">{$_(`home.lines.${toy.slug}`)}</span>
                {#if !toy.ready}
                  <!-- Sans le libellé « Ouvrir », plus rien ne distinguerait une
                       tuile qui mène à une préview d'une tuile qui mène à un
                       dépôt. Ce mot est la seule chose qui les sépare. -->
                  <span class="tag label">{$_("home.soon")}</span>
                {/if}
              </span>
            </span>
            <!-- La préview, quand le toy a exporté sa boucle. Sans `src` le même
                 composant rend sa matrice éteinte : même forme, même
                 encombrement, même cerne, donc la tuile garde sa hauteur dans
                 les deux cas et la grille ne bouge pas quand une boucle arrive.

                 Le même composant et non un disque en CSS à côté : les deux
                 devaient tomber sur le même diamètre, et le diamètre se déduit
                 maintenant de la grille — une feuille de style ne peut pas le
                 connaître.

                 Décorative dans les deux cas — pas de `label`. Ce que la tuile
                 désigne est déjà écrit à côté, en toutes lettres ; le lecteur
                 d'écran annoncerait le nom du toy deux fois de suite. -->
            <ToyPreview src={toy.preview} size={DISC} />
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

  /* Les deux commandes de l'en-tête, groupées comme dans la coquille des
     préviews : sans conteneur, le `space-between` du bandeau les écarterait
     l'une de l'autre au lieu de les tenir ensemble à droite. */
  .h-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
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

  /**
   * La tranche : la nature de l'entrée, sur le flanc gauche de la tuile.
   *
   * Elle était dans le sous-titre — « (Glyph toy) Une visualisation du temps
   * qui passe » — où elle dépensait le premier tiers de la phrase à dire ce que
   * la tuile **est** avant de dire ce qu'elle **fait**. Une catégorie va dans la
   * marge. Au passage ça retire trois textes recopiés à la main, qui avaient
   * déjà divergé entre parenthèses et crochets.
   *
   * Bord gauche et non droit : c'est le bord de l'identité — tranche, numéro,
   * nom, de gauche à droite dans l'ordre croissant de précision. Essayée à
   * droite, après le disque, elle avait l'air de qualifier le disque plutôt que
   * la tuile.
   *
   * `rotate(180deg)` retourne le flux de `vertical-rl`, qui descend par défaut :
   * sur un bord gauche, une étiquette se lit de bas en haut.
   *
   * `align-self: stretch` lui donne la hauteur de la tuile et le contenu est
   * centré dedans. Sans ça elle suivrait le `center` de la tuile et flotterait
   * au milieu d'un flanc, ce qui ne se lit plus comme une tranche.
   */
  .spine {
    flex: none;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 0.2rem;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 10px;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: var(--faint);
    /* L'interlettrage ajoute un blanc APRÈS la dernière lettre. Sans cette
       compensation, le texte paraît décalé d'un demi-cran dans sa boîte. */
    text-indent: 0.4em;
  }

  /* Un jeton dédié plutôt que `--hover`, qui est translucide : posé en fond
     opaque il assombrirait la tuile en thème sombre, c'est-à-dire dans le
     mauvais sens. Ici la surface se rapproche de l'encre dans les deux thèmes. */
  .tile:hover,
  .tile:focus-visible {
    background: var(--bg-2-hover);
    text-decoration: none;
  }

  /* Deux alignements, qui ne parlent pas de la même chose.

     `align-self` place le **bloc de texte** dans la hauteur de la tuile. Il
     valait `flex-start` — une exception au `center` de la tuile, héritée du
     temps où le sous-titre tenait sur deux lignes et se calait sur le haut du
     hublot. Ils en font trois ou quatre maintenant, et le disque a pris neuf
     pixels : collé en haut, le texte laissait un trou sous lui et faisait face
     au sommet d'un cercle. La ligne ci-dessous ne fait donc que rendre au bloc
     l'alignement de la tuile — on pourrait la retirer, elle est gardée parce
     que la requête média plus bas la contredit et qu'il faut voir d'où vient
     la valeur par défaut.

     `align-items: baseline` aligne, lui, le **numéro et le nom** entre eux :
     l'un est en 12 px, l'autre en 14, et calés par le haut ils flottaient. La
     ligne de base d'un bloc étant celle de sa première ligne, c'est celle du
     nom qui commande. */
  .head {
    align-self: center;
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

    /* **La tuile reste en ligne.** Ce bloc a longtemps porté un commentaire
       affirmant que le texte et le disque « s'empilent » — c'était faux, il n'y
       a jamais eu de `flex-direction: column` ici, et la mesure le confirme :
       `flexDirection` vaut `row` à toutes les largeurs.

       Ce qui se passe réellement, et qui est accepté en l'état : sur une tuile
       de 360 px — un téléphone ordinaire — le disque en prend 159 et ne bouge
       pas, le numéro 43, les rembourrages et gouttières le reste. Il tombe
       **49 px** au sous-titre, soit cinq caractères par ligne. Relevé sans la
       tranche : 83 px, à peine mieux. Le coupable est le disque à taille fixe,
       pas le marqueur.

       Le corriger demande de trancher entre trois choses — empiler pour de bon,
       réduire le disque sous 720 px, ou retirer le numéro — et aucune n'est
       gratuite. En attendant, ce commentaire dit ce que le CSS fait plutôt que
       ce qu'on aurait voulu qu'il fasse. */
    .tile {
      align-items: flex-start;
      gap: 1.2rem;
      padding: 1.6rem;
    }

    .head {
      align-self: stretch;
    }

    /* La tranche reste, choix assumé : elle coûte une vingtaine de pixels au
       texte là où il en manque déjà, mais une catégorie qui disparaît selon la
       largeur de la fenêtre n'est plus une catégorie. Elle se resserre — moins
       d'interlettrage, moins d'écart — plutôt que de sauter. */
    .spine {
      margin-right: 0;
      letter-spacing: 0.3em;
      text-indent: 0.3em;
    }
  }
</style>

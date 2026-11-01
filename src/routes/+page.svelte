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
  import DeviceToggle from "$lib/ui/DeviceToggle.svelte";
  import ThemeToggle from "$lib/ui/ThemeToggle.svelte";
  import { syncBackdrop } from "$lib/ui/deviceBackdrop.svelte";
  import HaloglyphMark from "$lib/ui/HaloglyphMark.svelte";
  import ToyPreview from "$lib/matrix/ToyPreview.svelte";
  import { deviceById, type Device } from "$lib/matrix/devices";
  import { resolveDevice } from "$lib/matrix/devicePref";
  import { thumbGrid } from "$lib/matrix/thumb";
  import { TOYS } from "./toys";

  const YEAR = new Date().getFullYear();

  /* Même réglage global que les pages de toy — voir `devicePref.ts` — et même
     sélecteur qu'elles, posé au même endroit de l'en-tête : le sommaire est
     l'endroit où ce choix se fait le plus naturellement, avant même d'ouvrir
     un toy. */
  let device = $state<Device>(resolveDevice());

  /* Le fond d'écran suit le sélecteur — voir `syncBackdrop`. */
  syncBackdrop(() => device.id);

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

  /* Diamètre du hublot Haloglyph — celui du disque **réellement peint** par
     `ToyPreview` pour `DISC` demandés sur l'appareil par défaut, pas `DISC`
     lui-même : `DISC` est le plafond de la boîte, le disque tombe en dessous
     (141 px pour un (3) en densité 1, voir le commentaire ci-dessus). Un
     conteneur calé sur `DISC` rendait le hublot Haloglyph visiblement plus
     grand que le disque des autres tuiles.
     Calculé en effet et non en haut du script : `thumbGrid` lit
     `window.devicePixelRatio`, absent au prérendu. L'icône elle-même garde sa
     taille propre — voir `ICON_SIZE` — le conteneur n'affecte plus qu'elle-même.

     Dépend de `device` et non figé sur un appareil par défaut : le disque des
     autres tuiles change de diamètre avec l'appareil choisi (13 × 13 et 25 × 25
     ne tombent pas sur le même compte), et le hublot Haloglyph doit le suivre
     pour rester calé dessus. */
  let appDisc = $state(DISC);
  $effect(() => {
    appDisc = thumbGrid(device, DISC).discCss;
  });

  /* Taille de la marque, indépendante du hublot qui la porte : elle ne doit
     pas rétrécir avec lui. Valeur choisie à l'œil pour rester lisible dans un
     hublot bien plus petit qu'elle. */
  const ICON_SIZE = Math.round(DISC * 0.92);

  /* Une boucle par tuile, celle de l'appareil choisi.
   *
   * Avant le sélecteur d'appareil du sommaire, la boucle était tirée au sort
   * parmi celles que le toy proposait — c'était le seul moyen de montrer les
   * deux matrices de GlyphCast sans faire de choix arbitraire. Le tirage a
   * disparu avec lui : il y a maintenant un réglage à suivre, le hasard n'a
   * plus rien à décider.
   *
   * `$derived` et non figé au montage : c'est un changement délibéré du
   * visiteur sur le sélecteur, pas une réévaluation parasite au fil du rendu —
   * rien à voir avec ce que l'ancien commentaire évitait. */
  const tuiles = $derived(
    TOYS.map((toy) => {
      const has4aPro = !!toy.preview?.phone4apro;
      const usePro = device.id === "phone4apro" && has4aPro;
      return {
        ...toy,
        src: usePro ? toy.preview!.phone4apro : toy.preview?.phone3,
        tileDevice: toy.preview ? deviceById(usePro ? "phone4apro" : "phone3") : device,
        /* Vrai dès que le toy est prêt mais n'a qu'une boucle Phone (3) —
           indépendant de l'appareil choisi : c'est une propriété du toy, pas
           de la tuile du moment, voir `home.phone3only`. */
        exclusive: !!toy.preview && !has4aPro,
      };
    }),
  );
</script>

<!-- Titre et description par page. Le monorepo les portait dans cinq
     `index.html` ; ici le `<head>` est commun et chaque route y ajoute ce qui
     lui est propre. -->
<svelte:head>
  <title>Glyph.suns.red</title>
  <meta name="description" content={$_("home.description")} />
</svelte:head>

<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page">
  <header>
    <p class="sub meta">
      <!-- `{@html}` parce que la ligne porte une mise en relief — « Glyph
           Matrix » à l'accent — et que le nom n'est pas au même endroit dans
           les cinq langues : le balisage voyage donc avec la traduction, comme
           pour les notes des préviews. La signature elle-même est au pied,
           avec le thème et la langue — voir `footer`. -->
      {@html $_("home.intro")}
    </p>
    <div class="h-tools">
      <!-- Même endroit que sur chaque page de toy — voir `Shell` — et pour la
           même raison : c'est un réglage de la page, pas de la tuile. -->
      <DeviceToggle bind:device />
    </div>
  </header>

  <!-- `.stage` tient les deux fondus en haut et en bas de la liste — voir
       `.edge` dans `app.css` : ce ne peut pas être des enfants de `main`, ils
       défileraient avec lui. -->
  <div class="stage">
  <main class="scroll">
    <ul class="grid">
      {#each tuiles as toy, i (toy.slug)}
        <li class:wide={i === 0 && tuiles.length % 2 === 1}>
          <!-- Haloglyph n'a ni route ni dépôt à offrir en clic — sa description
               dit déjà « future application » — donc pas de `href` du tout : un
               `<a>` sans `href` n'est plus un lien (pas de navigation, pas de
               focus au clavier), et `.disabled` en CSS éteint aussi le survol.
               Un `<div>` aurait perdu le reste du balisage partagé avec les
               autres tuiles pour rien. -->
          <a
            class="tile"
            class:soon={!toy.ready}
            class:disabled={toy.slug === "haloglyph"}
            href={toy.slug === "haloglyph" ? undefined : toy.ready ? `/${toy.slug}/` : toy.repo}
          >
            <!-- La nature de l'entrée, sur la tranche. Première dans le DOM :
                 c'est aussi l'ordre de lecture d'un lecteur d'écran, et
                 « Glyph toy, GLYPHSLOT, une machine à sous » est la bonne
                 phrase. Pas d'`aria-hidden` donc — ce n'est pas de la
                 décoration, c'est la seule chose qui distingue un APK d'un
                 outil qui tourne dans cet onglet. -->
            <span class="spine">{$_(`common.kind.${toy.kind}`)}</span>

            <!-- Nom et sous-titre calés en haut : la tuile tire sa hauteur du
                 disque, et un bloc de texte centré dedans le laisserait
                 flotter au milieu du bord gauche. -->
            <span class="head">
              <span class="body">
                <span class="name">{toy.name}</span>
                <span class="line">{$_(`home.lines.${toy.slug}`)}</span>
                {#if !toy.ready}
                  <!-- Sans le libellé « Ouvrir », plus rien ne distinguerait une
                       tuile qui mène à une préview d'une tuile qui mène à un
                       dépôt. Ce mot est la seule chose qui les sépare. -->
                  <span class="tag label">{$_("home.soon")}</span>
                {/if}
                {#if toy.exclusive}
                  <!-- Propriété du toy, pas de l'appareil choisi en ce moment —
                       voir `tuiles` : elle reste affichée même quand Phone (3)
                       est le réglage courant, comme un fait de la tuile plutôt
                       qu'un avertissement ponctuel. -->
                  <span class="tag label">{$_("home.phone3only")}</span>
                {/if}
              </span>
            </span>
            {#if toy.slug === "haloglyph"}
              <!-- Haloglyph fait exception : ce n'est pas un toy à jouer mais
                   le pack qui les embarque, il n'a donc pas de boucle. Sa
                   marque tient la place de la matrice éteinte, dans un hublot
                   rond de `appDisc` — le diamètre du disque réel des autres
                   tuiles, pas leur boîte — pour que le hublot Haloglyph tombe
                   pile sur le leur. Son fond est un blanc/noir plein et non le
                   verre sombre de l'appareil : c'est une icône d'app, pas une
                   photo de matrice. Voir `.appicon` pour le pourquoi du fond
                   plein et de l'ombre. La boîte porteuse reste `DISC` : c'est
                   elle qui tient la grille, comme pour `ToyPreview`. -->
              <span class="appicon-box" style:width="{DISC}px" style:height="{DISC}px" aria-hidden="true">
                <span class="appicon" style:width="{appDisc}px" style:height="{appDisc}px">
                  <HaloglyphMark size={ICON_SIZE} />
                </span>
              </span>
            {:else}
              <!-- La préview, quand le toy a exporté sa boucle. Sans `src` le
                   même composant rend sa matrice éteinte : même forme, même
                   encombrement, même cerne, donc la tuile garde sa hauteur
                   dans les deux cas et la grille ne bouge pas quand une
                   boucle arrive.

                   Le même composant et non un disque en CSS à côté : les deux
                   devaient tomber sur le même diamètre, et le diamètre se
                   déduit maintenant de la grille — une feuille de style ne
                   peut pas le connaître.

                   Décorative — pas de `label`. Ce que la tuile désigne est
                   déjà écrit à côté, en toutes lettres ; le lecteur d'écran
                   annoncerait le nom du toy deux fois de suite. -->
              <ToyPreview src={toy.src} device={toy.tileDevice} size={DISC} />
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </main>
  <span class="edge top"></span>
  <span class="edge bottom"></span>
  </div>

  <!-- Même pied que chaque page de toy — voir `Shell` — thème, langue et
       signature vers le dépôt, pour la même raison de cohérence : ce sont des
       réglages et une mention de site, pas quelque chose de propre au
       sommaire. -->
  <footer>
    <div class="f-row">
      <div class="f-tools">
        <ThemeToggle />
        <LangToggle up />
      </div>
      <a class="sig" href="https://github.com/aero-md" target="_blank" rel="noopener noreferrer">
        © {YEAR} aero-md
      </a>
    </div>
  </footer>
</div>

<style>
  /* Même invariant que `Shell` : **la page ne défile pas.** Elle occupe la
     fenêtre, l'en-tête et le pied restent en place, et seule la liste de tuiles
     défile (voir `main`). En colonne unique la règle s'inverse — voir la
     requête média en bas de feuille. */
  .page {
    position: relative;
    z-index: 2;
    max-width: 1120px;
    margin: 0 auto;
    padding: 2.5rem 2.4rem;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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

  /* L'unique accent de la page, sur le seul nom propre de la ligne. `:global`
     parce que ce `<b>` vient du dictionnaire par `{@html}` : il ne passe pas
     par le compilateur et ne porte aucune classe de portée — même cas que les
     mises en relief des notes.

     `font-weight: inherit` : la couleur suffit à le détacher, et un gras dans
     une ligne en 11 px capitales interlettrées ferait deux signaux pour une
     seule emphase. */
  .sub :global(b) {
    color: var(--accent);
    font-weight: inherit;
  }

  /* Le sélecteur d'appareil de l'en-tête — un seul enfant depuis que le thème
     et la langue ont rejoint le pied (changement structurel, 2026-09-20) — le
     conteneur reste : c'est lui que le `space-between` du bandeau tient à
     droite. */
  .h-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* Le seul élément qui défile. `min-height: 0` pour qu'il puisse descendre sous
     la taille de la liste au lieu de pousser le pied hors de la fenêtre.

     Colonne flex et `margin-block: auto` sur la grille : une liste plus courte
     que la fenêtre reste centrée comme avant, une liste plus haute démarre en
     haut — contrairement à `justify-content: center`, qui ferait déborder les
     premières tuiles hors de portée du défilement.

     Aucun masque ni opacité ici : voir la note de `.card` dans `Card.svelte`,
     le flou des tuiles de verre en dépend. */
  .stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
  }

  main > .grid {
    margin-block: auto;
  }

  /* Même pied que la coquille des préviews — voir `Shell` — repris ici plutôt
     que partagé : le sommaire n'a ni `stamp` ni spec d'appareil unique à
     montrer, juste le thème, la langue et la signature. */
  footer {
    flex: none;
    margin-top: 2.5rem;
    border-top: 1px solid var(--line);
    padding-top: 1.2rem;
  }

  .f-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .f-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* Même signature que redsunshome, même lien : c'est la même main. */
  .sig {
    flex: none;
    margin-left: auto;
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

  /* Nombre de tuiles impair : la première prend les deux colonnes, sinon la
     dernière ligne resterait boiteuse. Uniquement en mode deux colonnes — sous
     1200 px la grille n'en a qu'une et `1 / -1` n'aurait rien à étendre. */
  @media (min-width: 1200px) {
    .wide {
      grid-column: 1 / -1;
    }

    /* Le contenu reste dans une boîte virtuelle centrée, large d'une tuile
       normale (500 px) plus 30 % : sans ça le texte colle à gauche et le disque
       à droite, aux deux bouts d'un ruban vide. Le pourcentage d'un rembourrage
       se calcule sur la largeur du `<li>`, donc sur la tuile entière. */
    .wide .tile {
      padding-inline: calc((100% - 650px) / 2 + 2rem);
    }
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
    background: var(--glass);
    -webkit-backdrop-filter: var(--glass-filter);
    backdrop-filter: var(--glass-filter);
    box-shadow:
      var(--glass-shadow),
      inset 0 1px 0 var(--glass-edge);
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
     mauvais sens. Ici la surface se rapproche de l'encre dans les deux thèmes.

     `:not(.disabled)` : Haloglyph n'a pas de `href`, donc pas de survol de
     lien à afficher — un `:hover` resterait déclenché par la souris sur un
     `<a>` sans `href` puisque la pseudo-classe ne regarde pas cet attribut. */
  .tile:not(.disabled):hover,
  .tile:not(.disabled):focus-visible {
    background: var(--glass-hover);
    text-decoration: none;
  }

  /* Curseur neutre : sans lui, le navigateur affiche quand même la main au
     survol d'un `<a>`, lien ou non. */
  .tile.disabled {
    cursor: default;
  }

  /* `app.css` souligne tout `a:hover`/`a:focus-visible` au global, sans
     regarder `href` — la règle au-dessus a justement exclu `.disabled` du
     bloc qui neutralise ce soulignement, donc il faut le refaire ici pour
     la tuile Haloglyph elle-même. */
  .tile.disabled:hover,
  .tile.disabled:focus-visible {
    text-decoration: none;
  }

  /* La boîte porteuse : même rôle que `.box` de `ToyPreview`, elle tient la
     grille à `DISC` px pendant que le hublot lui-même (`.appicon`) est plus
     petit — voir le commentaire sur `appDisc`. */
  .appicon-box {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* La marque Haloglyph, dans un hublot rond de la taille du disque **réel**
     de `ToyPreview` (`appDisc`, pas `DISC`). Fond plein — blanc en clair,
     noir en sombre — plutôt que transparent : posée à même la tuile, la
     marque se fondait dans `--bg-2`, l'off-white/off-black de la carte,
     faute d'assez d'écart de contraste avec elle. Le plein tranche net, et
     l'ombre portée creuse la tuile pour redonner à l'icône le relief que le
     disque de LEDs a nativement à côté d'elle.

     Pas d'`overflow: hidden` : la marque garde sa taille propre (`ICON_SIZE`)
     et déborde légèrement d'un hublot pensé pour rester au diamètre des
     autres disques plutôt que pour la contenir pile. */
  .appicon {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  }

  :global(:root[data-theme="dark"]) .appicon {
    background: #000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
  }

  /* `align-self` place le **bloc de texte** dans la hauteur de la tuile. Il
     valait `flex-start` — une exception au `center` de la tuile, héritée du
     temps où le sous-titre tenait sur deux lignes et se calait sur le haut du
     hublot. Ils en font trois ou quatre maintenant, et le disque a pris neuf
     pixels : collé en haut, le texte laissait un trou sous lui et faisait face
     au sommet d'un cercle. La ligne ci-dessous ne fait donc que rendre au bloc
     l'alignement de la tuile — on pourrait la retirer, elle est gardée parce
     que la requête média plus bas la contredit et qu'il faut voir d'où vient
     la valeur par défaut. */
  .head {
    align-self: center;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
  }

  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .name {
    font-size: 16px;
    letter-spacing: 0.22em;
    color: var(--ink);
  }

  .tile:not(.disabled):hover .name {
    color: var(--accent);
  }

  /* Sans fioriture : ni capitales, ni interlettrage. C'est une phrase, elle se
     lit comme une phrase — le nom au-dessus tient déjà le registre technique. */
  .line {
    font-size: 14px;
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

  /* Même bascule que `Shell` : en colonne unique la page redevient défilante,
     une zone fixe en plus des tuiles ne laisserait presque rien à l'écran sur
     un téléphone. */
  @media (max-width: 960px), (max-width: 1080px) and (max-aspect-ratio: 5 / 4) {
    .page {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    main {
      overflow: visible;
    }

    .edge {
      display: none;
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

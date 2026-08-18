<script lang="ts">
  /* La coquille de page, commune à toutes les préviews du portail.
     Repères d'angle, en-tête, deux colonnes, pied.

     Elle existe parce que Sonoglyph l'avait recopiée à la main depuis
     GlyphCast : deux copies déjà divergentes d'une mise en page qui n'a rien de
     spécifique à un toy. Ce qui change d'une préview à l'autre, c'est ce qu'on
     met dans les deux colonnes — et c'est exactement ce que prennent `preview`
     et `rack`.

     Invariant de la mise en page : **la page ne défile pas**. Elle occupe la
     fenêtre, l'en-tête, la préview et le pied restent en place, et seul le rack
     défile. En colonne unique la règle s'inverse : la page redevient défilante
     et c'est la préview, réduite à la bande qui porte le disque, qui s'épingle
     en haut. */
  import type { Snippet } from "svelte";
  import LangToggle from "$lib/i18n/LangToggle.svelte";
  import { _, number } from "svelte-i18n";
  import type { Device } from "../matrix/devices";
  import ThemeToggle from "./ThemeToggle.svelte";

  type Props = {
    /** Nom de la préview, en tête de la ligne de sous-titre. */
    title: string;
    /** Ligne de sous-titre, registre « plaque d'instrument ». */
    sub: string;
    /** Mention de gauche au pied de page, entre crochets. Souvent la version. */
    stamp?: string;
    /**
     * Appareil affiché — pour la ligne de spécifications du pied.
     *
     * Elle est construite ici et non passée en texte par chaque app : la grille,
     * le masque et le compte de LEDs ne dépendent que de l'appareil, et les
     * quatre préviews en écrivaient quatre copies du même gabarit. Ce qui
     * variait d'une copie à l'autre, c'était la queue de phrase propre au toy —
     * la plage de dB, la découpe des rouleaux — qui décrivait le toy sans dire
     * un mot de la matrice, et que le rack disait déjà mieux.
     */
    device?: Device;
    /** Message éphémère, en accent, sous la ligne de pied. */
    notice?: string;
    /** Cadre en accent : un fichier survole la page. */
    dragging?: boolean;
    /** Lien de retour vers le sommaire. Faux sur le sommaire lui-même. */
    home?: boolean;
    /**
     * Dépôt vers lequel pointe la signature du pied.
     *
     * Celui du **toy**, pas celui de la préview : quelqu'un qui clique depuis
     * `/glyphslot/` cherche GlyphSlot, pas le monorepo qui héberge sa page. Les
     * deux se confondent pour GlyphCast, qui n'existe que sur le web.
     */
    repo?: string;
    preview: Snippet;
    rack: Snippet;
  };

  let {
    title,
    sub,
    stamp,
    device,
    notice = "",
    dragging = false,
    home = true,
    repo = "https://github.com/aero-md",
    preview,
    rack,
  }: Props = $props();

  /* --- défilement du rack ---
     Le fondu haut/bas est proportionnel à la distance déjà parcourue, plafonnée
     à FADE — il apparaît donc en douceur sans transition CSS, et reste nul tant
     que la liste tient dans la hauteur. */
  const FADE = 32;
  let rackEl = $state<HTMLElement | null>(null);
  let rackTop = $state(0);
  let rackMax = $state(0);
  const fadeTop = $derived(Math.min(FADE, rackTop));
  const fadeBot = $derived(Math.min(FADE, rackMax - rackTop));

  function syncRack() {
    if (!rackEl) return;
    rackTop = rackEl.scrollTop;
    rackMax = Math.max(0, rackEl.scrollHeight - rackEl.clientHeight);
  }

  $effect(() => {
    const el = rackEl;
    if (!el) return;
    syncRack();
    /* La limite de défilement bouge sans qu'aucun scroll ne soit émis : la
       fenêtre change la hauteur du cadre, un curseur conditionnel apparaît et
       disparaît. On observe donc le cadre et chacun de ses enfants. */
    const ro = new ResizeObserver(syncRack);
    ro.observe(el);
    for (const card of Array.from(el.children)) ro.observe(card);
    return () => ro.disconnect();
  });

  /* Millésime lu à l'exécution, pas écrit en dur : un pied de page figé sur
     l'année de la dernière compilation vieillit tout seul. */
  const YEAR = new Date().getFullYear();

  /* Ce que la matrice est, pas ce que le toy en fait. Le rayon passe par le
     formateur de nombres : c'est la seule fraction affichée hors des curseurs,
     et elle ne s'écrit pas de la même façon d'une langue à l'autre. */
  const spec = $derived(
    device
      ? $_("common.spec", {
          values: {
            size: device.size,
            radius: $number(device.radius),
            leds: device.ledCount,
          },
        })
      : "",
  );
</script>

<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page" class:dragging>
  <header>
    <!-- Registre « plaque d'instrument » : le nom, puis ce que fait l'outil.
         Séparateur : la puce, pas le point médian. Elle est dans Geist Mono à la
         chasse de la fonte — donc rien à grossir en CSS — et c'est le seul
         séparateur rond, ce qui est la règle de la page : le cercle est réservé
         aux points et aux LEDs. -->
    <div class="h-row">
      <p class="sub meta"><span class="name">{title}</span> • {sub}</p>
      <div class="h-tools">
        {#if home}
          <a class="home" href="/">◂ {$_("common.home")}</a>
        {/if}
        <ThemeToggle />
        <LangToggle />
      </div>
    </div>
  </header>

  <main>
    {@render preview()}

    <div
      class="rack"
      bind:this={rackEl}
      onscroll={syncRack}
      style="--fade-t:{fadeTop}px;--fade-b:{fadeBot}px"
    >
      {@render rack()}
    </div>
  </main>

  <footer>
    <div class="f-row">
      {#if stamp}<span class="ref">[{stamp}]</span>{/if}
      {#if spec}<span class="meta">{spec}</span>{/if}
      <a class="sig" href={repo} target="_blank" rel="noopener noreferrer">
        © {YEAR} aero-md
      </a>
    </div>
    {#if notice}<p class="notice accent">{notice}</p>{/if}
  </footer>
</div>

<style>
  .page {
    position: relative;
    z-index: 2;
    /* Suit la colonne de préview : 550 + 25,6 de gouttière + 467 de rack +
       76,8 de marges. Le rack est la grandeur qu'on protège — sous 430 px ses
       libellés de curseur se cassent en deux lignes — donc rétrécir la préview
       de 242 px rétrécit la page d'autant, et pas d'un pixel de plus. */
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 2.4rem;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .page.dragging {
    outline: 1px solid var(--accent);
    outline-offset: -12px;
  }

  /* --- en-tête --- */
  header {
    flex: none;
    border-bottom: 1px solid var(--line);
    padding: 2rem 0 1rem;
    margin-bottom: 1.6rem;
  }

  /* La bascule de thème est calée sur la ligne du sous-titre : même
     construction que la ligne du pied. */
  .h-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .sub {
    margin: 0;
    min-width: 0;
    /* Le nom est deux fois plus haut que la ligne qui le porte : sans
       interligne à 1, le `<p>` réserverait la hauteur du 1,5rem multipliée par
       l'interligne du corps et l'en-tête gagnerait une bande de vide. */
    line-height: 1;
  }

  /* Le seul mot de la page qui ne soit pas à chasse fixe — donc pas d'espacement
     de lettres ni de capitales forcées : c'est la serif qui fait le titre, pas
     l'habillage `.meta` qu'il faut ici défaire. */
  .name {
    font-family: var(--serif);
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
    color: var(--ink);
  }

  .h-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  /* Même habillage que la bascule de thème : c'est une commande, pas une
     mention. Le chevron plein plutôt qu'une flèche — la page ne trace que des
     angles vifs et des filets. */
  .home {
    border: 1px solid var(--line-strong);
    padding: 0.34rem 0.6rem;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dim);
    white-space: nowrap;
    transition:
      color 0.12s,
      border-color 0.12s;
  }

  .home:hover,
  .home:focus-visible {
    color: var(--ink);
    border-color: var(--ink);
    text-decoration: none;
  }

  /* --- corps --- */
  /* La rangée est en 1fr et non en auto : elle doit occuper toute la place
     laissée par l'en-tête et le pied, pas se dimensionner sur son contenu.
     Le minmax(0, …) lui permet de descendre sous la taille du contenu, sinon
     le rack pousserait au lieu de défiler. */
  main {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    /* 550 px. Ce n'est pas la largeur d'un dos mais un plafond posé sur la
       colonne : au-delà, le téléphone dépassait la hauteur d'un écran 1080 et
       s'y faisait rogner du tiers, pour un rendu qui paraissait affiché à la
       loupe. Les appareils portent une largeur qui tient dessous — voir
       frameWidth dans devices.ts — et se centrent dans la colonne. */
    grid-template-columns: minmax(0, 550px) minmax(300px, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 1.6rem;
  }

  /* Le seul élément qui défile. Le fondu est un masque et non un aplat posé
     par-dessus : le fond reste intact dans la bande, comme sur le bas de la
     photo du téléphone. Les bornes viennent du script — à 0 le dégradé est plat
     et n'enlève rien. */
  .rack {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    overflow-y: auto;
    /* gouttière réservée en permanence : sans ça l'apparition d'un curseur
       conditionnel décale toute la colonne d'une largeur d'ascenseur */
    scrollbar-gutter: stable;
    padding-right: 0.5rem;
    scrollbar-width: thin;
    scrollbar-color: var(--line-strong) transparent;
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--fade-t, 0px),
      #000 calc(100% - var(--fade-b, 0px)),
      transparent 100%
    );
    mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--fade-t, 0px),
      #000 calc(100% - var(--fade-b, 0px)),
      transparent 100%
    );
  }

  /* --- pied --- */
  footer {
    flex: none;
    margin-top: 1.6rem;
    border-top: 1px solid var(--line);
    padding: 1rem 0 1.2rem;
  }

  /* `space-between` en plus de la gouttière : la ligne de specs écarte déjà les
     deux mentions, mais elle est facultative — sans elle la signature se
     collerait à la version. */
  .f-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .f-row .meta {
    flex: 1 1 320px;
    text-transform: none;
    letter-spacing: 0.04em;
    line-height: 1.6;
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

  .notice {
    margin: 0.7rem 0 0;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  /* En colonne unique il n'y a plus la place pour deux zones fixes : la page
     redevient défilante et c'est la préview, réduite à la bande qui porte le
     disque, qui s'épingle en haut de l'écran. Régler un curseur sans voir la
     matrice n'aurait aucun intérêt.

     Deux seuils, dont un qui regarde la **forme** de la fenêtre et pas seulement
     sa largeur :

     - 960 px : plancher dur. En dessous, 550 de préview + 25,6 de gouttière +
       les 300 px minimum du rack + 76,8 de marges ne tiennent plus (952,4).
     - 1080 px **et fenêtre pas plus large que 5/4** : entre les deux, la grille
       rentre mais le rack passe sous ~430 px. On n'y bascule que si la fenêtre
       est carrée ou portrait. Un portable — 1024 ou 1280 de large pour 640 à
       800 de haut — reste en deux colonnes : il y était envoyé en colonne unique
       par l'ancien seuil de 1200 px alors que les deux colonnes tenaient très
       bien, et le mode épinglé n'y apportait rien.

     Voir FLOOR / COMFY / LANDSCAPE dans Preview, qui doublent ces seuils côté
     script, et le même bloc dans PreviewPane. */
  @media (max-width: 960px), (max-width: 1080px) and (max-aspect-ratio: 5 / 4) {
    .page {
      height: auto;
      overflow: visible;
      padding: 0 1.2rem 2.5rem;
    }

    /* L'en-tête défile : collant il ferait 160 px volés à la bande de préview,
       qui est la seule chose qui doit rester à l'écran. */
    header {
      padding-top: 1.2rem;
    }

    main {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
    }

    /* La colonne de préview est fournie par l'appelant : `:global` est la seule
       façon de l'épingler d'ici. Elle est bornée à l'enfant direct de `main`,
       donc elle n'attrape rien d'autre. */
    main > :global(:first-child) {
      position: sticky;
      top: 0;
      z-index: 3;
      /* opaque et refermée par un filet : le rack passe dessous, la trame de
         fond ne doit pas transparaître à travers */
      background: var(--bg);
      border-bottom: 1px solid var(--line);
      /* un peu d'air en haut : épinglée, la bande toucherait sinon le bord de
         l'écran */
      padding: 0.6rem 0 0.8rem;
    }

    .rack {
      overflow: visible;
      padding-right: 0;
      scrollbar-gutter: auto;
      -webkit-mask-image: none;
      mask-image: none;
    }
  }
</style>

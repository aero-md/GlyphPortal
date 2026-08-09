<script lang="ts">
  /* Une préview de toy en vignette : le disque d'un appareil, jouant la boucle
     exportée du toy.

     Ce composant ne sait rien d'aucun toy — il reçoit l'URL d'une boucle et rend
     une matrice. C'est ce qui permet au sommaire d'en aligner autant qu'il a
     d'entrées sans que le noyau apprenne leurs noms.

     Elle montre **ce que montre l'appareil** : LED carrée, halo proportionnel à
     la luminosité, grille éteinte visible entre les points, et surtout le champ
     de LEDs à l'échelle qu'il occupe dans le hublot — 94 % du diamètre sur un
     (3). Elle est passée par un rendu adouci et un cerne décoratif de 1,5 largeur
     de LED, ce qui donnait une matrice rétrécie flottant dans un disque noir : ni
     l'appareil, ni la grande préview.

     Ce rendu vit dans `thumb.ts`, à part de `render.ts` qui sert la grande
     préview et les PNG. C'est délibéré : les deux dessinent la même chose mais
     n'ont pas les mêmes marges de manœuvre, et les régler ensemble revient à en
     régler un et casser l'autre — voir l'en-tête de `thumb.ts`.

     Deux choses la séparent de `Preview`, la grande : il n'y a ni photo de dos
     ni réglages, et le disque est **peint par le CSS** plutôt que par le canvas.
     Le canvas ne porte donc que le champ de LEDs, et le cerne est l'écart entre
     ce champ et la boîte ronde qui l'entoure — exactement le partage qu'utilise
     le mode téléphone de `Preview`, où le hublot vient de la photo. */
  import { deviceForDesign, designSampler, isDesign } from "./design";
  import { DEFAULT_DEVICE, type Device } from "./devices";
  import { emptyFrame } from "./frame";
  import { lottieSampler, type MatrixSampler } from "./lottieFrame";
  import { paintThumb, thumbGrid, THUMB_BG, type ThumbGrid } from "./thumb";


  type Props = {
    /**
     * URL de la boucle du toy. Deux formats sont acceptés, reconnus à la forme
     * du fichier et non à son extension :
     *
     * - le **dessin Glyph Museum** (`{ v, frames: [{ p, d }] }`, voir
     *   `design.ts`) — des consignes de LED, donc exactement ce que l'appareil
     *   reçoit. C'est le format à préférer : il pèse quelques kilo-octets, il se
     *   lit sans dépendance, et il ne peut pas se désaccorder de la grille
     *   puisqu'il en porte le compte exact de LEDs.
     * - le **Lottie**, hérité des premiers exports de toys. Ce ne sont pas des
     *   animations vectorielles libres mais les matrices elles-mêmes, une LED par
     *   rectangle ; `lottieFrame.ts` les rééchantillonne dans la grille de
     *   l'appareil au lieu de les jouer.
     *
     * Absente, la vignette reste un disque éteint.
     */
    src?: string;
    /**
     * Appareil dont on emprunte la géométrie.
     *
     * Repli, et non consigne : un dessin Glyph Museum porte sa résolution dans
     * la longueur de ses trames, et c'est elle qui gagne. Jouer un dessin de
     * (4a) Pro sur une grille de 25 décalerait la matrice d'un cran par rangée.
     */
    device?: Device;
    /**
     * Encombrement de la vignette, en px CSS.
     *
     * C'est un **plafond**, pas le diamètre obtenu : la cellule est un nombre
     * entier de pixels, donc le disque tombe un peu en dessous — 133 px pour 150
     * demandés sur un (3) en densité 1. Le mou reste dans la boîte, qui garde la
     * taille demandée : la tuile du sommaire ne change donc pas de hauteur selon
     * l'appareil ou la densité de l'écran.
     */
    size?: number;
    /**
     * Instant montré quand l'animation est gelée, en fraction de la boucle.
     *
     * Près de la fin plutôt qu'au milieu : une boucle de toy part en général
     * d'un écran vide et se termine sur son état abouti — le jackpot de
     * GlyphSlot, pas les rouleaux qui tournent encore.
     */
    poster?: number;
    /** Nom de ce qu'on regarde. Absent, la vignette est décorative. */
    label?: string;
  };

  let {
    src = "",
    device = DEFAULT_DEVICE,
    size = 150,
    poster = 0.98,
    label = "",
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  /* Le placement obtenu — diamètre du disque et coins du disque et du canvas —
     posé par l'effet et lu par le CSS. Écrit seulement, jamais relu ici : le
     relire ferait boucler l'effet. */
  let box = $state({ disc: 0, discAt: 0, canvasAt: 0 });

  $effect(() => {
    const cvs = canvas;
    if (!cvs) return;

    /* Lus une fois et gardés en local : l'effet se relance en entier si l'un
       d'eux change, et rien ne doit pouvoir bouger sous la boucle en marche. */
    const repli = device;
    const cote = size;
    const url = src;

    let alive = true;
    let sampler: MatrixSampler | null = null;
    let raf = 0;
    let t0 = 0;

    const ctx = cvs.getContext("2d")!;

    /* Le calage du canvas sur la grille, refait quand l'appareil change — ce qui
       n'arrive qu'une fois, à la lecture d'un dessin dont la résolution n'est pas
       celle du repli.

       Elle rend la grille au lieu de l'écrire dans la variable de l'effet : le
       compilateur ne sait pas qu'un appel de fermeture a bien affecté `g`, et
       tenait la grille pour possiblement non initialisée. */
    const cale = (d: Device): ThumbGrid => {
      const grid = thumbGrid(d, cote);
      cvs.width = cvs.height = grid.field;
      cvs.style.width = cvs.style.height = `${grid.fieldCss}px`;
      box = { disc: grid.discCss, discAt: grid.discCss0, canvasAt: grid.padCss };
      return grid;
    };

    /* Grille éteinte peinte tout de suite, avant même la requête. C'est déjà
       l'aspect final à ceci près qu'aucune LED n'est allumée : la vignette ne
       change donc pas de forme ni de taille en cours de chargement, et il n'y a
       aucun état d'attente à dessiner. C'est aussi ce qui reste si le fichier
       manque — un disque éteint, pas un trou — et ce que voit une entrée du
       sommaire dont la boucle n'a pas encore été exportée. */
    let g = cale(repli);
    paintThumb(ctx, emptyFrame(repli), g);

    if (!url) return () => { alive = false; };

    const gele = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loop = (now: number) => {
      if (!alive || !sampler) return;
      if (!t0) t0 = now;
      paintThumb(ctx, sampler.frameAt((now - t0) / 1000), g);
      raf = requestAnimationFrame(loop);
    };

    const start = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;

        let s: MatrixSampler;
        if (isDesign(data)) {
          /* Un dessin dont aucun appareil n'a le compte de LEDs n'est pas
             jouable : il n'y a pas de grille où poser ses valeurs. Le disque
             éteint reste, comme pour un fichier manquant. */
          const d = deviceForDesign(data);
          if (!d) return;
          g = cale(d);
          paintThumb(ctx, emptyFrame(d), g);
          s = designSampler(data, d);
        } else {
          s = await lottieSampler(repli, data);
        }
        if (!alive) {
          s.destroy();
          return;
        }
        sampler = s;

        if (gele) paintThumb(ctx, s.frameAt(s.duration * poster), g);
        else raf = requestAnimationFrame(loop);
      } catch {
        /* Le disque éteint peint plus haut fait office d'échec. Une vignette de
           sommaire n'a pas de quoi rendre compte d'une erreur, et la tuile reste
           cliquable — c'est la préview complète qui dira ce qui ne va pas. */
      }
    };

    /* Rien n'est téléchargé tant que la tuile n'approche pas de l'écran : un
       Lottie de toy pèse quelques centaines de kilo-octets, et le sommaire en
       aligne autant qu'il a d'entrées. La marge les fait partir juste avant
       d'être vus. `requestAnimationFrame` s'arrête tout seul quand l'onglet
       passe en arrière-plan, il n'y a donc rien à ajouter pour ce cas. */
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void start();
      },
      { rootMargin: "200px" },
    );
    io.observe(cvs);

    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      sampler?.destroy();
    };
  });
</script>

<!-- Boîte de la taille demandée, disque de la taille obtenue. Les deux sont
     séparés pour que la mise en page du sommaire ne dépende ni de l'appareil ni
     de la densité de l'écran : c'est la boîte qui tient la colonne, le disque
     n'a qu'à être rond au bon diamètre.

     Disque et canvas sont **posés**, pas centrés par le CSS : leurs coins
     viennent de la grille, arrondis au pixel physique, sans quoi le canvas se
     retrouve sur un demi-pixel et le navigateur le rééchantillonne. -->
<span
  class="box"
  style:width="{size}px"
  style:height="{size}px"
  role={label ? "img" : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : "true"}
>
  <span
    class="disc"
    style:left="{box.discAt}px"
    style:top="{box.discAt}px"
    style:width="{box.disc}px"
    style:height="{box.disc}px"
    style:--thumb-bg={THUMB_BG}
  ></span>
  <canvas bind:this={canvas} style:left="{box.canvasAt}px" style:top="{box.canvasAt}px"
  ></canvas>
</span>

<style>
  .box {
    flex: none;
    position: relative;
    display: block;
  }

  /* Le verre du hublot. Le disque est la surface d'un appareil, pas celle de la
     page : il ne suit pas le thème. Le dos d'un Nothing Phone est noir dans les
     deux. */
  .disc {
    position: absolute;
    border-radius: 50%;
    background: var(--thumb-bg, #08080a);
  }

  /**
   * Le biseau du verre — **relevé sur la photo du dos, pas inventé**.
   *
   * Il a d'abord été une découpe du hublot en WebP posée en fond. Elle rendait
   * bien, mais pour 3,5 Ko d'image binaire là où il n'y a, à l'intérieur du
   * cercle, strictement rien à montrer : le relevé donne une luminance plate à
   * 1/255 sur tout le disque, et **un seul liseré** à 97,4 % du rayon. Une photo
   * pour peindre un anneau de deux pixels.
   *
   * Deux dégradés suffisent, et ils disent chacun une moitié du relevé :
   *
   * - le `mask` radial place l'anneau et lui donne son épaisseur. Le profil
   *   mesuré monte de 0 à r 95,4 % du rayon, culmine à 97,4 % et retombe à
   *   99,5 % — les arrêts intermédiaires reprennent la courbe, qui n'est pas une
   *   bande franche mais une gaussienne.
   * - le `conic-gradient` porte la **brillance par direction**, une valeur tous
   *   les 15°, dans l'ordre de la photo. C'est le relevé brut : `0deg 0.47`
   *   signifie que le liseré atteint 47 % de blanc à midi. Le reflet n'est pas un
   *   simple éclairage directionnel — il a quatre lobes, un fort en haut à
   *   gauche (78 % à 300°), un secondaire à midi, deux faibles en bas à droite —
   *   ce qu'aucun dégradé linéaire ne rend, et ce qu'un SVG ne sait pas exprimer
   *   faute de dégradé conique.
   *
   * Blanc pur à opacité variable : le relevé donne du gris neutre à ±2 près sur
   * les trois canaux, rgb(199,199,197) au plus fort.
   */
  .disc::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(
      rgb(255 255 255 / 0.47) 0deg,
      rgb(255 255 255 / 0.18) 15deg,
      rgb(255 255 255 / 0.02) 30deg,
      rgb(255 255 255 / 0) 45deg,
      rgb(255 255 255 / 0.01) 60deg,
      rgb(255 255 255 / 0.06) 75deg,
      rgb(255 255 255 / 0.13) 90deg,
      rgb(255 255 255 / 0.19) 105deg,
      rgb(255 255 255 / 0.22) 120deg,
      rgb(255 255 255 / 0.12) 135deg,
      rgb(255 255 255 / 0) 150deg,
      rgb(255 255 255 / 0) 165deg,
      rgb(255 255 255 / 0.2) 180deg,
      rgb(255 255 255 / 0) 195deg,
      rgb(255 255 255 / 0) 210deg,
      rgb(255 255 255 / 0.01) 225deg,
      rgb(255 255 255 / 0.25) 240deg,
      rgb(255 255 255 / 0.41) 255deg,
      rgb(255 255 255 / 0.37) 270deg,
      rgb(255 255 255 / 0.61) 285deg,
      rgb(255 255 255 / 0.78) 300deg,
      rgb(255 255 255 / 0.52) 315deg,
      rgb(255 255 255 / 0.22) 330deg,
      rgb(255 255 255 / 0.21) 345deg,
      rgb(255 255 255 / 0.47) 360deg
    );
    -webkit-mask-image: radial-gradient(
      closest-side,
      transparent 95%,
      rgb(0 0 0 / 0.64) 96.4%,
      #000 97.4%,
      rgb(0 0 0 / 0.64) 98.5%,
      transparent 99.7%
    );
    mask-image: radial-gradient(
      closest-side,
      transparent 95%,
      rgb(0 0 0 / 0.64) 96.4%,
      #000 97.4%,
      rgb(0 0 0 / 0.64) 98.5%,
      transparent 99.7%
    );
  }

  /* `block` : en ligne, le canvas s'assied sur la ligne de base et laisse sous
     lui le jambage d'une police absente — quelques pixels qui décalent la
     matrice vers le haut de son disque. */
  canvas {
    position: absolute;
    display: block;
  }
</style>

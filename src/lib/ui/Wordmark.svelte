<script lang="ts">
  import { ledMetrics } from "../render";

  /* Wordmark : chaque capitale est une trame 7 × 7 dessinée à la main, et
     surtout une trame VALIDE — aucun point ne tombe hors du disque. Une lettre
     est donc théoriquement affichable telle quelle sur une Glyph Matrix 7 × 7,
     comme les 25 × 25 de l'appli le sont sur un Phone (3). C'est ce qui donne
     au wordmark le droit d'être là : ce n'est pas une évocation de matrice,
     c'en est une. */

  /** Côté de la matrice d'une capitale, et son masque — même convention que
      `matrix.ts` : centre au milieu, `d < r`, les coins n'existent pas.
      37 cellules sur 49. */
  const M = 7;
  const MC = (M - 1) / 2;
  const MR = M / 2;

  /* Ce que le disque ouvre réellement, rangée par rangée :

       0 et 6      colonnes 2-4      (3)
       1 et 5      colonnes 1-5      (5)
       2, 3, 4     colonnes 0-6      (7)

     Les rangées 0 et 6 ne donnent que 3 colonnes : rien à y mettre. Les lettres
     tiennent donc dans le carré 5 × 5 des rangées 1-5 × colonnes 1-5, le plus
     grand rectangle inscrit.

     Et c'est ici que le serif s'arrête. Un empattement, c'est un point qui
     dépasse du fût sur la rangée extrême. Or les rangées 1 et 5 n'ouvrent que
     les colonnes 1 à 5 — exactement l'écartement des deux fûts. Il ne reste
     aucune colonne où dépasser. Ce n'est pas un choix de dessin, c'est le
     disque qui refuse : à 7 × 7 la trame est linéale, point. */
  const GLYPHS: Record<string, string[]> = {
    " ": [".......", ".......", ".......", ".......", ".......", ".......", "......."],
    G: [".......", "..###..", ".#...#.", ".#.....", ".#..##.", "..###..", "......."],
    L: [".......", ".#.....", ".#.....", ".#.....", ".#.....", ".#####.", "......."],
    Y: [".......", ".#...#.", "..#.#..", "...#...", "...#...", "...#...", "......."],
    P: [".......", ".####..", ".#...#.", ".####..", ".#.....", ".#.....", "......."],
    H: [".......", ".#...#.", ".#...#.", ".#####.", ".#...#.", ".#...#.", "......."],
    C: [".......", "..###..", ".#...#.", ".#.....", ".#...#.", "..###..", "......."],
    A: [".......", "..###..", ".#...#.", ".#####.", ".#...#.", ".#...#.", "......."],
    S: [".......", "..####.", ".#.....", "..###..", ".....#.", ".####..", "......."],
    T: [".......", ".#####.", "...#...", "...#...", "...#...", "...#...", "......."],
  };

  /* L'invariant « ça tient sur une matrice » ne se voit pas à l'œil : un point
     hors disque rend exactement comme un point dedans. On le vérifie donc au
     chargement en dev, sinon la première lettre retouchée le casse en silence. */
  if (import.meta.env.DEV) {
    for (const [ch, g] of Object.entries(GLYPHS)) {
      if (g.length !== M) console.error(`Wordmark « ${ch} » : ${g.length} rangées au lieu de ${M}`);
      g.forEach((row, y) => {
        if (row.length !== M)
          console.error(`Wordmark « ${ch} » rangée ${y} : ${row.length} colonnes au lieu de ${M}`);
        for (let x = 0; x < row.length; x++)
          if (row[x] === "#" && Math.hypot(x - MC, y - MC) >= MR)
            console.error(`Wordmark « ${ch} » : la cellule (${x}, ${y}) est hors du disque`);
      });
    }
  }

  /* Approche optique, relevée rangée par rangée, et non une chasse fixe. Une
     chasse fixe cale les boîtes d'encre et ignore ce qu'il y a dedans : le L
     n'occupe sa dernière colonne qu'à la rangée du bas et le Y n'occupe la
     sienne qu'à celle du haut, si bien qu'un « LY » calé sur les boîtes creuse
     un trou en diagonale entre les deux.

     On cherche donc, sur chaque rangée où les deux lettres ont de l'encre, à
     quelle distance elles se frôlent, et on cale l'avance sur la rangée la plus
     serrée. Le Y se glisse alors de deux colonnes sous le bras du L, et les
     huit autres paires ne bougent pas d'un pixel — preuve que le problème était
     bien local et pas un réglage général de chasse. */
  const GAP = 1; // colonnes vides sur la rangée la plus serrée d'une paire
  const SPACE = 3; // chasse d'un blanc, qui n'a pas d'encre à mesurer

  /** `left` / `right` valent -1 sur une rangée sans encre. Coordonnées ramenées
      à la première colonne encrée de la lettre, comme `cells`. */
  type Glyph = { cells: number[][]; w: number; left: number[]; right: number[] };
  const INK: Record<string, Glyph> = {};
  for (const [ch, g] of Object.entries(GLYPHS)) {
    const cells: number[][] = [];
    const left = new Array<number>(M).fill(-1);
    const right = new Array<number>(M).fill(-1);
    let min = Infinity;
    let max = -Infinity;
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== "#") continue;
        cells.push([x, y]);
        if (left[y] < 0) left[y] = x;
        right[y] = x;
        if (x < min) min = x;
        if (x > max) max = x;
      }
    });
    INK[ch] = cells.length
      ? {
          cells: cells.map(([x, y]) => [x - min, y]),
          w: max - min + 1,
          left: left.map((v) => (v < 0 ? -1 : v - min)),
          right: right.map((v) => (v < 0 ? -1 : v - min)),
        }
      : { cells: [], w: SPACE, left, right };
  }

  /** De combien de colonnes avancer entre le début de `a` et celui de `b`. */
  function advance(a: Glyph, b: Glyph): number {
    let tight = -Infinity;
    for (let y = 0; y < M; y++)
      if (a.right[y] >= 0 && b.left[y] >= 0) tight = Math.max(tight, a.right[y] - b.left[y]);
    // deux lettres sans rangée commune n'ont rien à optimiser : chasse de boîte
    return tight === -Infinity ? a.w + GAP : Math.max(1, tight + 1 + GAP);
  }

  /** `cell` est le côté d'une cellule de trame, en px CSS. C'est le bon bouton,
      et il a un plancher : sous ~3 px la LED tombe sous le gap minimum d'un
      pixel de `ledMetrics` et la trame se referme en traits pleins, ce qui tue
      tout le propos. */
  type Props = { text?: string; cell?: number };
  let { text = "GLYPHCAST", cell = 5.7 }: Props = $props();

  let cvs = $state<HTMLCanvasElement>();

  function draw() {
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const word = [...text.toUpperCase()].map((ch) => INK[ch]).filter(Boolean);
    if (!word.length) return;

    /* Les rangées que le disque laisse vides seraient une marge morte : on
       cadre sur les points allumés, sinon le wordmark ne s'alignerait plus sur
       le texte posé dessous. En x le cadrage est acquis, la plume part de 0. */
    const pts: number[][] = [];
    let pen = 0;
    let prev: Glyph | null = null;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const g of word) {
      if (prev) pen += advance(prev, g);
      for (const [x, y] of g.cells) {
        pts.push([pen + x, y]);
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      prev = g;
    }
    if (!pts.length) return;

    const w = (pen + prev!.w) * cell;
    const h = (y1 - y0 + 1) * cell;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    cvs.style.width = w + "px";
    cvs.style.height = h + "px";

    /* Les points sont des LEDs `soft` : mêmes métriques que la préview, via la
       même fonction. Le wordmark n'est pas une trame décorative posée à côté du
       rendu, c'est le même objet peint en petit — si un jour la LED change de
       forme, il suit sans qu'on y pense. */
    const { led, pad } = ledMetrics(cell, "soft");
    const radius = led * 0.24;

    const ctx = cvs.getContext("2d")!;
    const rounded = radius > 0.5 && typeof ctx.roundRect === "function";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(cvs).color;
    for (const [x, y] of pts) {
      const px = x * cell + pad;
      const py = (y - y0) * cell + pad;
      if (rounded) {
        ctx.beginPath();
        ctx.roundRect(px, py, led, led, radius);
        ctx.fill();
      } else {
        ctx.fillRect(px, py, led, led);
      }
    }
  }

  $effect(() => {
    text;
    cell;
    draw();
    // la couleur du wordmark suit le thème : redessiner au changement d'attribut
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // un changement d'écran change le devicePixelRatio, donc la résolution du canvas
    window.addEventListener("resize", draw);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", draw);
    };
  });
</script>

<canvas bind:this={cvs} aria-label={text}>{text}</canvas>

<style>
  canvas {
    display: block;
    /* seule source de la couleur des points, lue par le script */
    color: var(--ink);
  }
</style>

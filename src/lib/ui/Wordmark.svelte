<script lang="ts">
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

  /* Chasse propre à chaque lettre, relevée sur ses points allumés, plutôt que
     l'avance fixe des matrices : caler toutes les lettres sur la même avance
     creuserait un trou après les étroites. L'approche est donc comptée entre
     les encres. Une seule colonne : à 5 colonnes de chasse, deux en écarterait
     les lettres de 40 % de leur largeur et le mot se déliterait. */
  const GAP = 1; // colonnes vides entre deux lettres
  const SPACE = 3; // chasse d'un blanc, qui n'a pas d'encre à mesurer

  type Glyph = { cells: number[][]; w: number };
  const INK: Record<string, Glyph> = {};
  for (const [ch, g] of Object.entries(GLYPHS)) {
    const cells: number[][] = [];
    let min = Infinity;
    let max = -Infinity;
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== "#") continue;
        cells.push([x, y]);
        if (x < min) min = x;
        if (x > max) max = x;
      }
    });
    INK[ch] = cells.length
      ? { cells: cells.map(([x, y]) => [x - min, y]), w: max - min + 1 }
      : { cells: [], w: SPACE };
  }

  /** `cell` est le côté d'une cellule de trame, en px CSS — le point en fait
      `1 / STEP`. C'est le bon bouton, et il a un plancher : sous ~2 px de
      diamètre les points se rejoignent, on ne voit plus que des traits et
      l'idée de matrice tombe, ce qui est tout le propos. */
  type Props = { text?: string; cell?: number };
  let { text = "GLYPHCAST", cell = 5.5 }: Props = $props();

  const STEP = 1.28; // pas de la trame, en multiples du diamètre du point

  let cvs = $state<HTMLCanvasElement>();

  function draw() {
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dot = cell / STEP;

    const word = [...text.toUpperCase()].map((ch) => INK[ch]).filter(Boolean);
    if (!word.length) return;

    /* Les rangées que le disque laisse vides seraient une marge morte : on
       cadre sur les points allumés, sinon le wordmark ne s'alignerait plus sur
       le texte posé dessous. En x le cadrage est acquis, la plume part de 0. */
    const pts: number[][] = [];
    let pen = 0;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const g of word) {
      for (const [x, y] of g.cells) {
        pts.push([pen + x, y]);
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      pen += g.w + GAP;
    }
    if (!pts.length) return;

    const w = (pen - GAP) * cell;
    const h = (y1 - y0 + 1) * cell;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    cvs.style.width = w + "px";
    cvs.style.height = h + "px";

    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(cvs).color;
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * cell + cell / 2, (y - y0) * cell + cell / 2, dot / 2, 0, Math.PI * 2);
      ctx.fill();
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

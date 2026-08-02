<script lang="ts">
  /* Wordmark : chaque capitale est une trame 13 × 13 dessinée à la main, et
     surtout une trame VALIDE — aucun point ne tombe hors du disque. Une lettre
     est donc théoriquement affichable telle quelle sur une Glyph Matrix 13 × 13,
     comme les 25 × 25 de l'appli le sont sur un Phone (3). C'est ce qui donne
     au wordmark le droit d'être là : ce n'est pas une évocation de matrice,
     c'en est une.

     La version précédente tramait une fonte serif rendue hors écran. À cette
     taille ça ne pardonne pas : un empattement n'encre qu'une fraction de sa
     cellule, il passe ou saute selon le sous-pixel où il est tombé, et deux
     lettres voisines ne reçoivent pas le même traitement — d'où des lettres
     inégales. Dessinées, elles sont régulières par construction : fûts d'un
     point, empattements d'un point de part et d'autre du fût. C'est le seul
     serif qu'un disque de 13 autorise. */

  /** Côté de la matrice d'une capitale, et son masque — même convention que
      `matrix.ts` : centre au milieu, `d < r`, les coins n'existent pas. */
  const M = 13;
  const MC = (M - 1) / 2;
  const MR = M / 2;

  /* Le disque n'ouvre que 5 colonnes sur les rangées 0 et 12 : inutilisable
     pour un empattement. Les lettres vivent donc sur les rangées 1 à 11, où
     le disque donne 9 colonnes aux extrêmes et 11 au milieu, et n'occupent
     jamais les colonnes 0 et 12 — ces deux-là sont l'approche, deux colonnes
     vides entre deux lettres voisines, sans crénage à gérer. */
  const GLYPHS: Record<string, string[]> = {
    " ": [
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
    ],
    G: [
      ".............",
      "....#####....",
      "..##.....##..",
      ".##.......##.",
      ".#.........#.",
      ".#...........",
      ".#....#####..",
      ".#........#..",
      ".#........#..",
      ".##.......#..",
      "..##.....##..",
      "....#####....",
      ".............",
    ],
    L: [
      ".............",
      "..###........",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#......#..",
      "...########..",
      ".............",
    ],
    Y: [
      ".............",
      "..###...###..",
      "...#.....#...",
      "....#...#....",
      ".....#.#.....",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "....#####....",
      ".............",
    ],
    P: [
      ".............",
      "..########...",
      "...#.....##..",
      "...#......#..",
      "...#......#..",
      "...#.....##..",
      "...######....",
      "...#.........",
      "...#.........",
      "...#.........",
      "...#.........",
      "..###........",
      ".............",
    ],
    H: [
      ".............",
      "..###...###..",
      "...#.....#...",
      "...#.....#...",
      "...#.....#...",
      "...#.....#...",
      "...#######...",
      "...#.....#...",
      "...#.....#...",
      "...#.....#...",
      "...#.....#...",
      "..###...###..",
      ".............",
    ],
    C: [
      ".............",
      "....#####....",
      "..##.....##..",
      ".##.......##.",
      ".#.........#.",
      ".#...........",
      ".#...........",
      ".#...........",
      ".#.........#.",
      ".##.......##.",
      "..##.....##..",
      "....#####....",
      ".............",
    ],
    A: [
      ".............",
      ".....###.....",
      ".....#.#.....",
      "....#...#....",
      "....#...#....",
      "...#.....#...",
      "...#######...",
      "...#.....#...",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      "..###...###..",
      ".............",
    ],
    S: [
      ".............",
      "...######....",
      "..##....##...",
      ".##......#...",
      ".##..........",
      "..##.........",
      "....##.......",
      "......##.....",
      "........##...",
      ".#........#..",
      "..##....##...",
      "...######....",
      ".............",
    ],
    T: [
      ".............",
      "..#########..",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "....#####....",
      ".............",
    ],
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

  /** `cell` est le côté d'une cellule de trame, en px CSS — le point en fait
      `1 / STEP`. C'est le bon bouton, et il a un plancher : sous ~2 px de
      diamètre les points se rejoignent, on ne voit plus que des traits et
      l'idée de matrice tombe, ce qui est tout le propos. */
  type Props = { text?: string; cell?: number };
  let { text = "GLYPHCAST", cell = 2.6 }: Props = $props();

  const STEP = 1.28; // pas de la trame, en multiples du diamètre du point

  let cvs = $state<HTMLCanvasElement>();

  function draw() {
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dot = cell / STEP;

    const word = [...text.toUpperCase()].map((ch) => GLYPHS[ch]).filter(Boolean);
    if (!word.length) return;

    /* On relève les points allumés et leur boîte : les rangées et colonnes que
       le disque laisse vides seraient sinon une marge morte, et le wordmark ne
       s'alignerait plus sur le texte posé dessous. */
    const pts: number[][] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    word.forEach((g, i) => {
      for (let y = 0; y < M; y++) {
        for (let x = 0; x < M; x++) {
          if (g[y][x] !== "#") continue;
          const gx = i * M + x;
          pts.push([gx, y]);
          if (gx < x0) x0 = gx;
          if (gx > x1) x1 = gx;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    });
    if (!pts.length) return;

    const w = (x1 - x0 + 1) * cell;
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
      ctx.arc((x - x0) * cell + cell / 2, (y - y0) * cell + cell / 2, dot / 2, 0, Math.PI * 2);
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

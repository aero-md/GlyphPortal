<script lang="ts">
  /* Wordmark : chaque capitale est une matrice 13 × 13 dessinée à la main, pas
     un texte tramé.

     La version précédente rendait la fonte serif hors écran et échantillonnait
     le résultat. À cette taille ça ne pardonne pas : un empattement n'encre
     qu'une fraction de sa cellule, il passe ou saute selon le sous-pixel où il
     est tombé, et deux lettres voisines ne reçoivent pas le même traitement.
     D'où des lettres inégales, « maladroitement dessinées ».

     Dessinées, elles sont régulières par construction : fûts d'un point,
     empattements d'un point de part et d'autre du fût. C'est le seul serif que
     13 rangées autorisent, et c'est aussi le plus juste ici — un empattement
     réduit à un point, c'est exactement la LED en trop qui distingue deux
     glyphes sur une matrice. */

  /** `cap` est la hauteur de capitale rendue, en px CSS. Les lettres occupent
      les 13 rangées, donc une cellule vaut `cap / 13` et le point s'en déduit.
      34 px, et pas moins : la trame doit rester lisible EN TANT QUE trame. En
      dessous d'environ 2 px de diamètre les points se rejoignent, on ne voit
      plus que des traits et l'idée de matrice tombe — c'est tout le propos du
      wordmark. La ligne éditoriale retirée de l'en-tête paie la hauteur. */
  type Props = { text?: string; cap?: number };
  let { text = "GLYPHCAST", cap = 34 }: Props = $props();

  const CELL = 13; // côté de la matrice d'une capitale
  const STEP = 1.28; // pas de la trame, en multiples du diamètre du point

  /* Les colonnes 0 et 12 sont l'approche : deux colonnes vides entre deux
     lettres voisines, sans avoir à gérer un crénage. L'avance est donc fixe —
     le mot se lit comme une grille, ce qui est le propos. */
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
      "....#####....",
      "..##.....##..",
      ".##.......##.",
      ".#.........#.",
      ".#...........",
      ".#...........",
      ".#....#####..",
      ".#........#..",
      ".#........#..",
      ".#........#..",
      ".##.......##.",
      "..##.....##..",
      "....#####....",
    ],
    L: [
      ".###.........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#.......#..",
      "..#########..",
    ],
    Y: [
      ".###.....###.",
      "..#.......#..",
      "...#.....#...",
      "....#...#....",
      ".....#.#.....",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "......#......",
      "....#####....",
    ],
    P: [
      ".########....",
      "..#.....##...",
      "..#......#...",
      "..#......#...",
      "..#......#...",
      "..#.....##...",
      "..#######....",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      "..#..........",
      ".###.........",
    ],
    H: [
      ".###.....###.",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      "..#########..",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      ".###.....###.",
    ],
    C: [
      "....#####....",
      "..##.....##..",
      ".##.......##.",
      ".#.........#.",
      ".#...........",
      ".#...........",
      ".#...........",
      ".#...........",
      ".#...........",
      ".#.........#.",
      ".##.......##.",
      "..##.....##..",
      "....#####....",
    ],
    A: [
      ".....###.....",
      ".....#.#.....",
      ".....#.#.....",
      "....#...#....",
      "....#...#....",
      "....#...#....",
      "...#######...",
      "...#.....#...",
      "...#.....#...",
      "..#.......#..",
      "..#.......#..",
      "..#.......#..",
      ".###.....###.",
    ],
    S: [
      "...######....",
      "..##....##...",
      ".##......#...",
      ".#...........",
      ".##..........",
      "..##.........",
      "....##.......",
      "......##.....",
      "........##...",
      "..........#..",
      ".#........#..",
      "..##....##...",
      "...######....",
    ],
    T: [
      ".###########.",
      "......#......",
      "......#......",
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
    ],
  };

  let cvs = $state<HTMLCanvasElement>();

  function draw() {
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cell = cap / CELL;
    const dot = cell / STEP;

    const word = [...text.toUpperCase()].map((ch) => GLYPHS[ch]).filter(Boolean);
    if (!word.length) return;

    /* On relève les points allumés et leur boîte : l'approche des lettres de
       bord serait sinon une marge morte, et le wordmark ne s'alignerait plus
       sur le texte posé dessous. */
    const pts: number[][] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    word.forEach((g, i) => {
      for (let r = 0; r < CELL; r++) {
        for (let c = 0; c < CELL; c++) {
          if (g[r][c] !== "#") continue;
          const x = i * CELL + c;
          pts.push([x, r]);
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (r < y0) y0 = r;
          if (r > y1) y1 = r;
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
    cap;
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

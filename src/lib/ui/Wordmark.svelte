<script lang="ts">
  /* Wordmark dot-matrix : le texte est rendu dans un canvas hors écran, on lit
     getImageData et on repeint chaque cellule encrée en cercle. Moment
     signature — c'est aussi la seule chose de la page qui parle le même langage
     que la matrice qu'on programme. */
  /** `cap` est la hauteur de capitale rendue, en px CSS — la taille du point
      s'en déduit. C'est le bon bouton : la lisibilité de la trame tient au
      nombre de rangées par capitale, pas au diamètre du point. */
  type Props = { text?: string; cap?: number };
  let { text = "GLYPHCAST", cap = 26 }: Props = $props();

  const STEP = 1.28; // pas de la trame, en multiples du diamètre du point

  /* Rangées de points sur la hauteur de capitale. C'est la commande de
     résolution, et 10 est un plancher mesuré, pas un réglage de confort : à 9
     et moins les deux fûts du H se rejoignent par leurs empattements et le mot
     se lit « GLYPIICAST ». Au-delà de 12 les points deviennent si fins que ce
     n'est plus une trame mais une similigravure. */
  const CAPS = 10;

  /* Seuil de couverture d'une cellule. Bas — 165 convenait à une grotesque
     grasse, il effacerait les empattements et les déliés d'un serif, qui
     n'encrent qu'une fraction de leur cellule. Les points orphelins que ce
     seuil retenait avant sont réglés autrement : la trame se pose sur la boîte
     d'encre, donc pile sur la ligne de base. */
  const INK = 118;

  /* Approche, en cadratins du corps rendu. Elle n'est pas lue depuis le CSS :
     une valeur en em s'y calculerait sur la taille de police de l'élément —
     14 px hérités du corps de page — et non sur celle du rendu, qui en fait
     près de trois fois plus. */
  const TRACK = 0.06;

  let cvs = $state<HTMLCanvasElement>();

  function draw() {
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    /* la fonte vient du CSS de l'élément : une seule source, et le wordmark
       suit la pile serif de la page sans la recopier ici */
    const cs = getComputedStyle(cvs);
    const stack = cs.fontFamily;
    const weight = cs.fontWeight;
    // la hauteur de capitale demandée fixe le pas, le pas fixe le point
    const step = cap / CAPS;
    const dot = step / STEP;

    const off = document.createElement("canvas");
    const octx = off.getContext("2d", { willReadFrequently: true })!;
    const setFont = (px: number) => {
      octx.font = `${weight} ${px}px ${stack}`;
      // Chrome uniquement ; ailleurs le crénage reste celui de la fonte
      if ("letterSpacing" in octx) octx.letterSpacing = `${TRACK * px}px`;
    };

    /* Première passe sur une taille arbitraire : on relève la hauteur d'encre
       réelle. Elle dépend de la fonte — une capitale de Georgia ne fait pas la
       même fraction du corps qu'une de Sitka — donc on ne peut pas la déduire
       du corps demandé, il faut la mesurer. */
    const PROBE = 200;
    setFont(PROBE);
    const pm = octx.measureText(text);
    const probeH = pm.actualBoundingBoxAscent + pm.actualBoundingBoxDescent;
    if (!probeH) return;
    const px = Math.max(8, Math.round((PROBE * cap) / probeH));

    setFont(px);
    const m = octx.measureText(text);
    const inkW = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
    const inkH = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    if (inkW <= 0 || inkH <= 0) return;

    const PAD = 2; // marge de sécurité, l'antialiasing déborde de la boîte
    off.width = inkW + PAD * 2;
    off.height = inkH + PAD * 2;
    // redimensionner un canvas remet son contexte à zéro : la fonte se repose
    // APRÈS avoir fixé width/height, sinon on dessine en 10px sans-serif
    setFont(px);
    octx.textBaseline = "alphabetic";
    octx.fillStyle = "#fff";
    octx.fillText(text, PAD + m.actualBoundingBoxLeft, PAD + m.actualBoundingBoxAscent);

    const src = octx.getImageData(0, 0, off.width, off.height).data;

    /* La trame se pose sur la boîte d'encre, pas sur le canvas : le haut des
       capitales et la ligne de base tombent ainsi sur des bords de cellule.
       Sans ça la rangée qui chevauche la ligne de base ne récupère qu'une
       moitié de fût et s'allume en points orphelins sous les lettres. */
    const cols = Math.max(1, Math.round(inkW / step));
    const rows = Math.max(1, Math.round(inkH / step));
    const cw = inkW / cols;
    const ch = inkH / rows;

    const outW = cols * step;
    const outH = rows * step;
    cvs.width = Math.round(outW * dpr);
    cvs.height = Math.round(outH * dpr);
    cvs.style.width = outW + "px";
    cvs.style.height = outH + "px";

    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, outW, outH);
    ctx.fillStyle = cs.color;

    // moyenne de zone plutôt qu'un pixel central : à cette taille un seul
    // échantillon rate les traits fins et les lettres partent en bouillie
    for (let r = 0; r < rows; r++) {
      const y0 = Math.floor(PAD + r * ch);
      const y1 = Math.max(y0 + 1, Math.ceil(PAD + (r + 1) * ch));
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(PAD + c * cw);
        const x1 = Math.max(x0 + 1, Math.ceil(PAD + (c + 1) * cw));
        let acc = 0;
        let n = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++, n++) acc += src[(sy * off.width + sx) * 4 + 3];
        }
        if (!n || acc / n < INK) continue;
        ctx.beginPath();
        ctx.arc(c * step + step / 2, r * step + step / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  $effect(() => {
    text;
    cap;
    draw();
    // la couleur du wordmark suit le thème : redessiner au changement d'attribut
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", draw);
    // les points sortent dans la fonte de repli tant que la serif n'est pas prête
    document.fonts?.ready.then(draw);
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
    color: var(--ink);
    /* la trame lit sa fonte ici : une seule source, elle suit la pile serif de
       la page sans la recopier dans le script */
    font-family: var(--serif);
    font-weight: 400;
  }
</style>

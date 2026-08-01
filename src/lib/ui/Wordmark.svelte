<script lang="ts">
  /* Wordmark dot-matrix : le texte est rendu dans un canvas hors écran, on lit
     getImageData et on repeint chaque pixel opaque en cercle. Moment signature —
     c'est aussi la seule chose de la page qui parle le même langage que la
     matrice qu'on programme. */
  type Props = { text?: string; dot?: number };
  let { text = "GLYPHCAST", dot = 4 }: Props = $props();

  const STEP = 1.28; // pas de la trame, en multiples du diamètre du point
  /* Hauteur de la source en pas de trame. En dessous de ~11 les capitales
     tiennent sur moins de 6 rangées de points et les fûts fusionnent : le
     wordmark devient une bouillie. */
  const ROWS = 11;
  let cvs = $state<HTMLCanvasElement>();

  function draw() {
    if (!cvs) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(dot * STEP * ROWS); // hauteur de rendu de la source
    const off = document.createElement("canvas");
    const octx = off.getContext("2d", { willReadFrequently: true })!;

    const font = `600 ${px}px "Geist Mono", ui-monospace, Consolas, monospace`;
    octx.font = font;
    const w = Math.ceil(octx.measureText(text).width) + 4;
    const h = Math.ceil(px * 1.35);
    off.width = w;
    off.height = h;
    // redimensionner un canvas remet son contexte à zéro : la fonte se repose
    // APRÈS avoir fixé width/height, sinon on mesure en 10px sans-serif
    octx.font = font;
    octx.textBaseline = "middle";
    octx.fillStyle = "#fff";
    octx.fillText(text, 2, h / 2);

    const src = octx.getImageData(0, 0, w, h).data;
    const step = dot * STEP;
    const cols = Math.floor(w / step);
    const rows = Math.floor(h / step);

    const outW = Math.ceil(cols * step);
    const outH = Math.ceil(rows * step);
    cvs.width = Math.round(outW * dpr);
    cvs.height = Math.round(outH * dpr);
    cvs.style.width = outW + "px";
    cvs.style.height = outH + "px";

    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, outW, outH);
    ctx.fillStyle = getComputedStyle(cvs).color;

    // moyenne de zone plutôt qu'un pixel central : à cette taille un seul
    // échantillon rate les fûts fins et les lettres partent en bouillie
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(c * step);
        const y0 = Math.floor(r * step);
        const x1 = Math.min(w, Math.ceil((c + 1) * step));
        const y1 = Math.min(h, Math.ceil((r + 1) * step));
        let acc = 0;
        let n = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++, n++) acc += src[(sy * w + sx) * 4 + 3];
        }
        // 165 et pas 128 : la rangée qui chevauche la ligne de base d'un C ou
        // d'un T récupère la moitié du fût et s'allumait en points orphelins
        if (!n || acc / n < 165) continue;
        ctx.beginPath();
        ctx.arc(c * step + step / 2, r * step + step / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  $effect(() => {
    text;
    dot;
    draw();
    // la couleur du wordmark suit le thème : redessiner au changement d'attribut
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", draw);
    // les points sortent en Arial tant que Geist Mono n'est pas chargée
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
  }
</style>

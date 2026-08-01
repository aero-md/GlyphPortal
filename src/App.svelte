<script lang="ts">
  import { LED_COUNT, SIZE } from "./lib/matrix";
  import { CHANNEL_PRESETS, DEFAULTS, convert, type DitherMode, type Params } from "./lib/pipeline";
  import {
    VERSION,
    copy,
    downloadJson,
    downloadKotlin,
    exportPng,
    parseSession,
    toKotlin,
  } from "./lib/export";
  import type { LedStyle } from "./lib/render";
  import Card from "./lib/ui/Card.svelte";
  import Preview, { type PreviewMode } from "./lib/ui/Preview.svelte";
  import Seg from "./lib/ui/Seg.svelte";
  import Slider from "./lib/ui/Slider.svelte";
  import ThemeToggle from "./lib/ui/ThemeToggle.svelte";
  import Wordmark from "./lib/ui/Wordmark.svelte";

  /* --- source --- */
  let img = $state<HTMLImageElement | null>(null);
  let srcW = $state(0);
  let srcH = $state(0);
  let fileName = $state("");
  let dragging = $state(false);
  let notice = $state("");
  let objectUrl: string | null = null;

  /* --- réglages --- */
  let params = $state<Params>({ ...DEFAULTS });
  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");

  /* Hauteur réelle de l'en-tête collant, bordure comprise (offsetHeight, pas
     clientHeight qui l'exclut). La préview se colle exactement là où elle se
     trouve au repos : sur une valeur approchée elle remonte de quelques pixels
     avant d'accrocher, ce qui donne un scroll janky. */
  let headH = $state(0);
  /* Largeur de la colonne, pour que le mode « grand » occupe exactement la
     place du téléphone. */
  let colW = $state(576);

  /* Deux canvas de travail distincts : le rendu courant et le rendu de
     comparaison sont recalculés dans la même passe réactive, partager le
     scratch ferait lire l'un les pixels de l'autre. */
  const scratchA = document.createElement("canvas");
  const scratchB = document.createElement("canvas");

  const frame = $derived(convert(img, srcW, srcH, params, scratchA));

  /* Rendu « brut » : même cadrage, tonalité au repos, sans dither. Ce que
     donnerait l'image sans aucun réglage — la référence de l'A/B. */
  const rawParams = $derived<Params>({
    ...DEFAULTS,
    zoom: params.zoom,
    offsetX: params.offsetX,
    offsetY: params.offsetY,
    rotation: params.rotation,
  });
  const rawFrame = $derived(convert(img, srcW, srcH, rawParams, scratchB));

  const kotlin = $derived(toKotlin(frame));
  const hasImg = $derived(!!img);

  /* --- chargement --- */
  function load(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      flash("Fichier ignoré — image attendue");
      return;
    }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = url;
      img = im;
      srcW = im.naturalWidth;
      srcH = im.naturalHeight;
      fileName = file.name;
      flash("");
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      flash("Décodage impossible");
    };
    im.src = url;
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: string) {
    notice = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (notice = ""), 2600);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    load(e.dataTransfer?.files?.[0]);
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
    if (item) load(item.getAsFile());
  }

  function pickFile(e: Event) {
    load((e.currentTarget as HTMLInputElement).files?.[0]);
    (e.currentTarget as HTMLInputElement).value = "";
  }

  /* --- actions --- */
  function mix(name: keyof typeof CHANNEL_PRESETS) {
    const [r, g, b] = CHANNEL_PRESETS[name];
    params.wR = r;
    params.wG = g;
    params.wB = b;
  }

  function resetAll() {
    params = { ...DEFAULTS };
    flash("Réglages au repos");
  }

  /** Étale l'histogramme sur toute la plage : les gates se posent sur les
      extrêmes réellement présents dans l'image, pas sur 0 et 1 théoriques. */
  function autoLevels() {
    if (!img) return;
    const probe = convert(
      img,
      srcW,
      srcH,
      { ...params, black: 0, white: 1, contrast: 0, gamma: 1, levels: 256, dither: "none" },
      scratchB,
    );
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < probe.values.length; i++) {
      const v = probe.values[i];
      if (v === 0 && !probe.lit) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo < 0.02) {
      flash("Plage trop plate pour un étalement");
      return;
    }
    params.black = Math.max(0, lo - 0.01);
    params.white = Math.min(1, hi + 0.01);
    flash(`Gates posées sur ${Math.round(lo * 100)} – ${Math.round(hi * 100)} %`);
  }

  async function copyKotlin() {
    flash((await copy(kotlin)) ? "IntArray copié" : "Copie refusée par le navigateur");
  }

  async function importJson(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      params = parseSession(await file.text());
      flash("Session rechargée");
    } catch {
      flash("JSON illisible");
    }
  }

  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const signed = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
</script>

<svelte:window
  onpaste={onPaste}
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
/>

<div class="dots"></div>
<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page" class:dragging>
  <header bind:offsetHeight={headH}>
    <div class="brand">
      <Wordmark text="GLYPHCAST" dot={3} />
      <span class="model">(1a)</span>
    </div>
    <p class="lede serif">Une image, {LED_COUNT} diodes.</p>
    <p class="sub meta">
      Glyph Matrix {SIZE}×{SIZE} — Nothing Phone (3) · monochrome · {LED_COUNT} LEDs dans le disque
    </p>
  </header>

  <main>
    <div class="col-preview" style="--head-h:{headH}px" bind:clientWidth={colW}>
      <div class="scale">
        <Seg
          label="Échelle de préview"
          bind:value={mode}
          options={[
            { v: "phone" as PreviewMode, t: "Téléphone" },
            { v: "large" as PreviewMode, t: "Grand" },
          ]}
        />
        <Seg
          label="Rendu des LED"
          bind:value={ledStyle}
          options={[
            { v: "sharp" as LedStyle, t: "Sharp" },
            { v: "soft" as LedStyle, t: "Soft" },
          ]}
        />
      </div>
      <Preview
        {frame}
        {mode}
        style={ledStyle}
        width={colW}
        compare={hasImg ? rawFrame : null}
      />
      {#if !hasImg}
        <p class="empty meta">
          Matrice éteinte — déposez une image n'importe où sur la page, collez-en une
          (Ctrl+V) ou passez par <b>[01] Source</b>.
        </p>
      {/if}
    </div>

    <div class="rack">
      <Card ref="01" title="Source" stat={hasImg ? `${srcW}×${srcH}` : "aucune"}>
        <label class="drop" class:armed={dragging}>
          <input type="file" accept="image/*" onchange={pickFile} />
          <span class="drop-t">{hasImg ? fileName : "Choisir une image"}</span>
          <span class="drop-s label">Glisser-déposer · Coller · Parcourir</span>
        </label>
        <p class="note">
          L'image est traitée en local, dans le navigateur. Rien n'est envoyé nulle part.
        </p>
      </Card>

      <Card ref="02" title="Cadrage" stat="{Math.round(params.zoom * 100)} %">
        <Slider label="Zoom" bind:value={params.zoom} min={0.2} max={6} reset={DEFAULTS.zoom} format={pct} />
        <Slider label="Décalage X" bind:value={params.offsetX} min={-1} max={1} reset={0} format={signed} />
        <Slider label="Décalage Y" bind:value={params.offsetY} min={-1} max={1} reset={0} format={signed} />
        <Slider
          label="Rotation"
          bind:value={params.rotation}
          min={-180}
          max={180}
          step={1}
          reset={0}
          format={(v) => v.toFixed(0)}
          unit="°"
        />
        <div class="btns">
          <button type="button" onclick={() => (params.rotation = ((params.rotation - 90 + 540) % 360) - 180)}>
            ↺ 90°
          </button>
          <button type="button" onclick={() => (params.rotation = ((params.rotation + 90 + 540) % 360) - 180)}>
            ↻ 90°
          </button>
          <button
            type="button"
            onclick={() => {
              params.zoom = 1;
              params.offsetX = 0;
              params.offsetY = 0;
              params.rotation = 0;
            }}
          >
            Recadrer
          </button>
        </div>
      </Card>

      <Card ref="03" title="Mixeur de canaux" stat="monochrome">
        <p class="note">
          La matrice n'a pas de couleur : ces poids décident de la part de chaque canal dans la
          luminance. C'est un filtre coloré de photo noir et blanc — monter le rouge éclaircit les
          peaux et noircit un ciel bleu.
        </p>
        <Slider label="Rouge" bind:value={params.wR} min={-1} max={2} reset={DEFAULTS.wR} />
        <Slider label="Vert" bind:value={params.wG} min={-1} max={2} reset={DEFAULTS.wG} />
        <Slider label="Bleu" bind:value={params.wB} min={-1} max={2} reset={DEFAULTS.wB} />
        <div class="btns">
          {#each Object.keys(CHANNEL_PRESETS) as name (name)}
            <button type="button" onclick={() => mix(name)}>{name}</button>
          {/each}
        </div>
      </Card>

      <Card ref="04" title="Tonalité" stat={params.invert ? "inversé" : "direct"}>
        <Slider
          label="Exposition"
          bind:value={params.exposure}
          min={-3}
          max={3}
          reset={0}
          format={signed}
          unit=" IL"
        />
        <Slider label="Gate — point noir" bind:value={params.black} min={0} max={1} reset={0} format={pct} />
        <Slider label="Gate — point blanc" bind:value={params.white} min={0} max={1} reset={1} format={pct} />
        <Slider label="Contraste" bind:value={params.contrast} min={-0.9} max={3} reset={0} format={signed} />
        <Slider label="Gamma" bind:value={params.gamma} min={0.2} max={3} reset={1} />
        <Slider label="Netteté" bind:value={params.sharpen} min={0} max={2} reset={DEFAULTS.sharpen} />
        <div class="btns">
          <button type="button" class:on={params.invert} onclick={() => (params.invert = !params.invert)}>
            Inverser
          </button>
          <button type="button" onclick={autoLevels} disabled={!hasImg}>Auto-gates</button>
        </div>
      </Card>

      <Card ref="05" title="Sortie LED" stat="{params.levels} paliers">
        <Slider
          label="Paliers de luminosité"
          bind:value={params.levels}
          min={2}
          max={64}
          step={1}
          reset={DEFAULTS.levels}
          format={(v) => v.toFixed(0)}
        />
        <Slider
          label="Plafond de luminosité"
          bind:value={params.ceiling}
          min={0.05}
          max={1}
          reset={1}
          format={pct}
        />
        <Seg
          label="Dithering"
          bind:value={params.dither}
          options={[
            { v: "none" as DitherMode, t: "Aucun" },
            { v: "floyd" as DitherMode, t: "Floyd-Steinberg" },
            { v: "bayer" as DitherMode, t: "Bayer 4×4" },
          ]}
        />
        {#if params.dither !== "none"}
          <Slider label="Force du dither" bind:value={params.ditherAmount} min={0} max={1} reset={1} format={pct} />
        {/if}
        <p class="note">
          À 2 paliers le rendu devient binaire et le dithering fait tout le travail. Au-delà de
          ~16 paliers la matrice restitue de vrais niveaux de gris et le dither ne sert plus qu'à
          casser les bandes dans les dégradés.
        </p>
      </Card>

      <Card ref="06" title="Export" stat="{LED_COUNT} / {SIZE * SIZE}">
        <div class="btns">
          <button type="button" onclick={() => exportPng(frame, ledStyle)} disabled={!hasImg}>
            PNG · {ledStyle}
          </button>
          <button type="button" onclick={copyKotlin} disabled={!hasImg}>Copier IntArray</button>
          <button type="button" onclick={() => downloadKotlin(frame)} disabled={!hasImg}>.kt</button>
          <button type="button" onclick={() => downloadJson(frame, params)} disabled={!hasImg}>.json</button>
          <label class="filebtn">
            <input type="file" accept="application/json,.json" onchange={importJson} />
            Recharger .json
          </label>
          <button type="button" onclick={resetAll}>Repos</button>
        </div>
        <pre class="code" aria-label="IntArray Kotlin">{kotlin}</pre>
      </Card>
    </div>
  </main>

  <footer>
    <div class="f-row">
      <span class="ref">[{VERSION}]</span>
      <span class="meta">
        Row-major {SIZE}×{SIZE}, valeurs 0-255, masque circulaire r = 12,5 → {LED_COUNT} LEDs.
        Géométrie relevée sur les repos GlyphLapse / GlyphSlot.
      </span>
      <ThemeToggle />
    </div>
    {#if notice}<p class="notice accent">{notice}</p>{/if}
  </footer>
</div>

<style>
  .page {
    position: relative;
    z-index: 2;
    max-width: 1180px;
    margin: 0 auto;
    padding: 3rem 2.4rem 3rem;
  }

  .page.dragging {
    outline: 1px solid var(--accent);
    outline-offset: -12px;
  }

  /* --- en-tête --- */
  /* Collant, et opaque : la trame de points passe dessous, elle ne doit pas
     transparaître à travers. Un fond dépoli serait l'inverse de la DA. */
  header {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    padding: 1.4rem 0 1rem;
    margin: -3rem 0 1.6rem;
  }

  .brand {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
  }

  .model {
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--faint);
    padding-bottom: 2px;
  }

  .lede {
    margin: 0.7rem 0 0.25rem;
    font-size: 26px;
    line-height: 1.2;
  }

  .sub {
    margin: 0;
  }

  /* --- corps --- */
  main {
    display: grid;
    grid-template-columns: minmax(0, 576px) minmax(300px, 1fr);
    gap: 1.6rem;
    align-items: start;
  }

  .col-preview {
    position: sticky;
    /* exactement la position au repos : hauteur de l'en-tête collant + sa
       marge basse. Un seuil plus haut et la colonne remonte de la différence
       avant d'accrocher. */
    top: calc(var(--head-h, 140px) + 1.6rem);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .scale {
    display: flex;
    justify-content: center;
    gap: 1.4rem;
    flex-wrap: wrap;
  }

  .empty {
    margin: 0;
    border: 1px solid var(--line);
    padding: 0.7rem 0.75rem;
    line-height: 1.7;
    text-transform: none;
    letter-spacing: 0.04em;
  }

  .empty b {
    color: var(--ink);
    font-weight: 500;
  }

  .rack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  /* --- dépôt de fichier --- */
  .drop {
    display: block;
    border: 1px solid var(--line-strong);
    padding: 0.9rem 0.75rem;
    cursor: pointer;
    transition: background 0.12s;
  }

  .drop:hover,
  .drop.armed {
    background: var(--hover);
    border-color: var(--accent);
  }

  .drop input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .drop-t {
    display: block;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .drop-s {
    display: block;
    margin-top: 0.35rem;
  }

  .drop:has(input:focus-visible) {
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }

  /* --- boutons --- */
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .btns button,
  .filebtn {
    border: 1px solid var(--line-strong);
    background: transparent;
    color: var(--dim);
    border-radius: 0;
    padding: 0.34rem 0.6rem;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }

  .btns button:not(:disabled):hover,
  .filebtn:hover {
    color: var(--ink);
    border-color: var(--ink);
  }

  .btns button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btns button.on {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
  }

  .filebtn input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .filebtn:has(input:focus-visible) {
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }

  /* --- notes et code --- */
  .note {
    margin: 0;
    font-size: 11px;
    line-height: 1.65;
    color: var(--dim);
  }

  .code {
    margin: 0;
    border: 1px solid var(--line);
    padding: 0.6rem;
    font-size: 10px;
    line-height: 1.5;
    color: var(--dim);
    max-height: 190px;
    overflow: auto;
    white-space: pre;
  }

  /* --- pied --- */
  footer {
    margin-top: 2.2rem;
    border-top: 1px solid var(--line);
    padding-top: 1rem;
  }

  .f-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .f-row .meta {
    flex: 1 1 320px;
    text-transform: none;
    letter-spacing: 0.04em;
    line-height: 1.6;
  }

  .notice {
    margin: 0.7rem 0 0;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  @media (max-width: 980px) {
    main {
      grid-template-columns: minmax(0, 1fr);
    }

    .col-preview {
      position: static;
    }

    header {
      margin-top: -2rem;
    }

    .page {
      padding: 2rem 1.2rem 2.5rem;
    }
  }
</style>

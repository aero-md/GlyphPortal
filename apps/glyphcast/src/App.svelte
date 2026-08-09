<script lang="ts">
  import {
    DEFAULT_DEVICE,
    type Device,
    type Frame,
    type LedStyle,
  } from "@glyph/kit";
  import Card from "@glyph/kit/Card.svelte";
  import PreviewPane from "@glyph/kit/PreviewPane.svelte";
  import type { PreviewMode } from "@glyph/kit/Preview.svelte";
  import Seg from "@glyph/kit/Seg.svelte";
  import Shell from "@glyph/kit/Shell.svelte";
  import Slider from "@glyph/kit/Slider.svelte";
  import { CHANNEL_PRESETS, DEFAULTS, convert, type DitherMode, type Params } from "./lib/pipeline";
  import {
    RANGES as R,
    VERSION,
    copy,
    downloadJson,
    downloadKotlin,
    exportPng,
    parseSession,
    toKotlin,
  } from "./lib/export";

  /* --- source --- */
  let img = $state<HTMLImageElement | null>(null);
  let srcW = $state(0);
  let srcH = $state(0);
  let fileName = $state("");
  let dragging = $state(false);
  let notice = $state("");
  let objectUrl: string | null = null;

  /* --- réglages --- */
  /* L'appareil ne fait que changer la grille sous l'image : aucun réglage n'est
     exprimé en LEDs, ils sont tous photographiques. Basculer préserve donc la
     source, le cadrage et toute la tonalité — c'est ce qui rend la comparaison
     entre les deux matrices utile plutôt que théorique. */
  let device = $state<Device>(DEFAULT_DEVICE);
  let params = $state<Params>({ ...DEFAULTS });
  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");

  /* Deux canvas de travail distincts : le rendu courant et le rendu de
     comparaison sont recalculés dans la même passe réactive, partager le
     scratch ferait lire l'un les pixels de l'autre. */
  const scratchA = document.createElement("canvas");
  const scratchB = document.createElement("canvas");

  const frame = $derived<Frame>(convert(device, img, srcW, srcH, params, scratchA));

  /* Rendu « brut » : même cadrage, tonalité au repos, sans dither. Ce que
     donnerait l'image sans aucun réglage — la référence de l'A/B. */
  const rawParams = $derived<Params>({
    ...DEFAULTS,
    zoom: params.zoom,
    offsetX: params.offsetX,
    offsetY: params.offsetY,
    rotation: params.rotation,
  });
  const rawFrame = $derived<Frame>(convert(device, img, srcW, srcH, rawParams, scratchB));

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

  /** Étale l'histogramme sur toute la plage : les gates se posent sur les
      extrêmes réellement présents dans l'image, pas sur 0 et 1 théoriques. */
  function autoLevels() {
    if (!img) return;
    const probe = convert(
      device,
      img,
      srcW,
      srcH,
      { ...params, black: 0, white: 1, contrast: 0, gamma: 1, levels: 256, dither: "none" },
      scratchB,
    );
    // uniquement les cellules du disque : celles hors masque valent toujours 0
    // et clouaient le point noir à 0 quelle que soit l'image
    let lo = 1;
    let hi = 0;
    for (const i of device.inside) {
      const v = probe.values[i];
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
      // un fichier porte l'appareil sur lequel il a été calculé : le relire
      // sur l'autre grille redonnerait d'autres valeurs sous les mêmes réglages
      const s = parseSession(await file.text());
      device = s.device;
      params = s.params;
      flash(`Session rechargée — ${s.device.name}`);
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

<Shell
  title="Glyphcast"
  sub="Stylisez une image en la projetant sur la Glyph Matrix"
  stamp={VERSION}
  {device}
  repo="https://github.com/aero-md/glyph-portal"
  {notice}
  {dragging}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      bind:device
      bind:mode
      bind:style={ledStyle}
      compare={hasImg ? rawFrame : null}
    >
      {#snippet note()}
        {#if !hasImg}
          <p class="empty meta">
            Matrice éteinte — déposez une image n'importe où sur la page, collez-en une
            (Ctrl+V) ou passez par <b>[01] Source</b>.
          </p>
        {/if}
      {/snippet}
    </PreviewPane>
  {/snippet}

  {#snippet rack()}
    <!-- tant qu'il n'y a rien à convertir, c'est la seule carte qui ait
         quelque chose à faire : elle porte le jaune, tout le reste est éteint -->
    <Card ref="01" title="Source" stat={hasImg ? `${srcW}×${srcH}` : "aucune"} cta={!hasImg}>
      <label class="drop" class:armed={dragging}>
        <input type="file" accept="image/*" onchange={pickFile} />
        <span class="drop-t">{hasImg ? fileName : "Importer une image"}</span>
        <span class="drop-s label">Glisser-déposer · Coller · Parcourir</span>
      </label>
      <div class="btns">
        <!-- une session n'apporte que des réglages : sa place est ici, à
             l'entrée, et pas dans la carte qui produit les fichiers -->
        <label class="filebtn">
          <input type="file" accept="application/json,.json" onchange={importJson} />
          Importer un .json
        </label>
      </div>
      <p class="note">
        L'image est traitée en local, dans le navigateur. Rien n'est envoyé nulle part.
      </p>
    </Card>

    <Card ref="02" title="Cadrage" stat="{Math.round(params.zoom * 100)} %" locked={!hasImg}>
      <Slider label="Zoom" bind:value={params.zoom} range={R.zoom} reset={DEFAULTS.zoom} format={pct} />
      <Slider label="Décalage X" bind:value={params.offsetX} range={R.offsetX} reset={0} format={signed} />
      <Slider label="Décalage Y" bind:value={params.offsetY} range={R.offsetY} reset={0} format={signed} />
      <Slider
        label="Rotation"
        bind:value={params.rotation}
        range={R.rotation}
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

    <Card ref="03" title="Mixeur de canaux" stat="monochrome" locked={!hasImg}>
      <p class="note">
        La matrice n'a pas de couleur : ces poids décident de la part de chaque canal dans la
        luminance. C'est un filtre coloré de photo noir et blanc — monter le rouge éclaircit les
        peaux et noircit un ciel bleu.
      </p>
      <Slider label="Rouge" bind:value={params.wR} range={R.wR} reset={DEFAULTS.wR} />
      <Slider label="Vert" bind:value={params.wG} range={R.wG} reset={DEFAULTS.wG} />
      <Slider label="Bleu" bind:value={params.wB} range={R.wB} reset={DEFAULTS.wB} />
      <div class="btns">
        {#each Object.keys(CHANNEL_PRESETS) as name (name)}
          <button type="button" onclick={() => mix(name)}>{name}</button>
        {/each}
      </div>
    </Card>

    <Card ref="04" title="Tonalité" stat={params.invert ? "inversé" : "direct"} locked={!hasImg}>
      <Slider
        label="Exposition"
        bind:value={params.exposure}
        range={R.exposure}
        reset={0}
        format={signed}
        unit=" IL"
      />
      <Slider label="Gate — point noir" bind:value={params.black} range={R.black} reset={0} format={pct} />
      <Slider label="Gate — point blanc" bind:value={params.white} range={R.white} reset={1} format={pct} />
      <Slider label="Contraste" bind:value={params.contrast} range={R.contrast} reset={0} format={signed} />
      <Slider label="Gamma" bind:value={params.gamma} range={R.gamma} reset={1} />
      <Slider label="Netteté" bind:value={params.sharpen} range={R.sharpen} reset={DEFAULTS.sharpen} />
      <div class="btns">
        <button type="button" class:on={params.invert} onclick={() => (params.invert = !params.invert)}>
          Inverser
        </button>
        <button type="button" onclick={autoLevels} disabled={!hasImg}>Auto-gates</button>
      </div>
    </Card>

    <Card ref="05" title="Sortie LED" stat="{params.levels} paliers" locked={!hasImg}>
      <Slider
        label="Paliers de luminosité"
        bind:value={params.levels}
        range={R.levels}
        step={1}
        reset={DEFAULTS.levels}
        format={(v) => v.toFixed(0)}
      />
      <Slider
        label="Plafond de luminosité"
        bind:value={params.ceiling}
        range={R.ceiling}
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
        <Slider
          label="Force du dither"
          bind:value={params.ditherAmount}
          range={R.ditherAmount}
          reset={1}
          format={pct}
        />
      {/if}
      <p class="note">
        À 2 paliers le rendu devient binaire et le dithering fait tout le travail. Au-delà de
        ~16 paliers la matrice restitue de vrais niveaux de gris et le dither ne sert plus qu'à
        casser les bandes dans les dégradés.
      </p>
    </Card>

    <Card ref="06" title="Export" stat="{device.ledCount} / {device.cells}">
      <div class="btns">
        <button type="button" onclick={() => exportPng(frame, ledStyle)} disabled={!hasImg}>
          PNG · {ledStyle}
        </button>
        <button type="button" onclick={copyKotlin} disabled={!hasImg}>Copier IntArray</button>
        <button type="button" onclick={() => downloadKotlin(frame)} disabled={!hasImg}>.kt</button>
        <button type="button" onclick={() => downloadJson(frame, params)} disabled={!hasImg}>.json</button>
      </div>
      <p class="note">
        Le <b>.json</b> est un dessin au format du <a
          href="https://glyphmuseum.com/developers"
          target="_blank"
          rel="noopener noreferrer">Glyph Museum</a
        > — une trame, {device.ledCount} consignes de LED. Il porte en plus les réglages de cette
        page, sous une clé que les autres lecteurs ignorent : le même fichier s'ouvre là-bas et se
        recharge ici avec tous ses curseurs.
      </p>
      <pre class="code" aria-label="IntArray Kotlin">{kotlin}</pre>
    </Card>
  {/snippet}
</Shell>

<style>
  /* Ce qui reste ici est propre à GlyphCast : la zone de dépôt de fichier et
     l'état vide. Le reste — page, en-tête, rack, pied, boutons, notes — vient
     de @glyph/kit. */

  .empty {
    flex: none;
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

  /* --- dépôt de fichier --- */
  /* `relative` obligatoire : l'input caché est en absolu, et sans bloc
     conteneur ici il se cale sur `.page`. Voir la note sur `.filebtn input`. */
  .drop {
    position: relative;
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
    inset: 0;
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

  /* L'input reste focusable — c'est ce qui rend le label utilisable au clavier
     — donc il doit rester DANS le label. Sans `position: relative` sur celui-ci
     il se calait sur `.page`, à sa position statique, c'est-à-dire sans tenir
     compte du défilement interne du rack : à mi-course il atterrissait mille
     pixels sous son libellé. Cliquer le label le focalisait, le navigateur
     faisait défiler `.page` pour l'amener à l'écran — et `.page` est en
     `overflow: hidden`, donc sans ascenseur pour revenir. L'en-tête partait à
     −665 px et la mise en page ne se remettait jamais droite. */
  .filebtn {
    position: relative;
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
      color 0.12s,
      border-color 0.12s;
  }

  .filebtn:hover {
    color: var(--ink);
    border-color: var(--ink);
  }

  .filebtn input {
    position: absolute;
    inset: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .filebtn:has(input:focus-visible) {
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }
</style>

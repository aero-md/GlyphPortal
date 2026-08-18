<script lang="ts">
  import {
    DEFAULT_DEVICE,
    emptyFrame,
    type Device,
    type Frame,
    type LedStyle,
  } from "$lib";
  import { _, number } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import Slider from "$lib/ui/Slider.svelte";
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
  let objectUrl: string | null = null;

  /* Le message éphémère est gardé sous forme de **fonction**, pas de texte : un
     texte serait figé dans la langue qui avait cours à l'instant où il a été
     posé, et changer de langue laisserait une phrase orpheline au pied de page. */
  let noticeFn = $state<(() => string) | null>(null);
  const notice = $derived(noticeFn ? noticeFn() : "");

  /* --- réglages --- */
  /* L'appareil ne fait que changer la grille sous l'image : aucun réglage n'est
     exprimé en LEDs, ils sont tous photographiques. Basculer préserve donc la
     source, le cadrage et toute la tonalité — c'est ce qui rend la comparaison
     entre les deux matrices utile plutôt que théorique. */
  let device = $state<Device>(DEFAULT_DEVICE);
  let params = $state<Params>({ ...DEFAULTS });
  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");

  /**
   * La trame relue d'un `.json`, affichée tant qu'aucune image n'est chargée.
   *
   * Un fichier de session ne contient pas l'image source — il ne peut pas, c'est
   * un tableau de LEDs. L'import reposait donc les curseurs sur une matrice
   * éteinte : les valeurs étaient bien reprises, mais le rack est verrouillé
   * faute d'image et la préview restait noire, si bien que rien à l'écran ne
   * disait qu'il s'était passé quoi que ce soit.
   *
   * Le fichier porte le **résultat**, lui. On le montre donc tel quel, et les
   * curseurs à côté disent ce qui l'a produit. Déposer une image rend la main au
   * pipeline.
   */
  let imported = $state<Frame | null>(null);

  /* Deux canvas de travail distincts : le rendu courant et le rendu de
     comparaison sont recalculés dans la même passe réactive, partager le
     scratch ferait lire l'un les pixels de l'autre. */
  const scratchA = document.createElement("canvas");
  const scratchB = document.createElement("canvas");

  /* L'image d'abord, la trame importée sinon, le disque éteint en dernier.
     La trame importée n'est retenue que si elle est **de l'appareil courant** :
     ce sont des consignes de LED, elles n'ont pas de source à reprojeter sur
     l'autre grille. Basculer d'appareil la fait donc disparaître, ce qui est la
     seule chose honnête à faire — et se dit sans effet ni état à remettre à
     zéro, d'où le test ici plutôt qu'un `$effect` qui l'effacerait. */
  const frame = $derived<Frame>(
    img
      ? convert(device, img, srcW, srcH, params, scratchA)
      : imported && imported.device.id === device.id
        ? imported
        : emptyFrame(device),
  );

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

  const hasImg = $derived(!!img);

  /* --- chargement --- */
  function load(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      flash(() => $_("glyphcast.notice.notAnImage"));
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
      /* Le pipeline reprend la main : garder la trame importée derrière ne
         servirait qu'à la voir réapparaître si l'image est retirée, alors
         qu'elle ne décrit plus ce qui est à l'écran. */
      imported = null;
      flash(null);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      flash(() => $_("glyphcast.notice.decodeFailed"));
    };
    im.src = url;
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: (() => string) | null) {
    noticeFn = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (noticeFn = null), 2600);
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
  /* Les identifiants des préréglages, dans l'ordre de déclaration. `Object.keys`
     rend des `string` nus ; le forçage est ce qui laisse indexer le dictionnaire
     avec, donc ce qui fait échouer la compilation si un préréglage arrive sans
     son libellé traduit. */
  const PRESET_NAMES = Object.keys(CHANNEL_PRESETS) as (keyof typeof CHANNEL_PRESETS)[];

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
      flash(() => $_("glyphcast.notice.tooFlat"));
      return;
    }
    params.black = Math.max(0, lo - 0.01);
    params.white = Math.min(1, hi + 0.01);
    const [pLo, pHi] = [Math.round(lo * 100), Math.round(hi * 100)];
    flash(() => $_("glyphcast.notice.gates", { values: { lo: pLo, hi: pHi } }));
  }

  /* L'IntArray est monté **au clic** et non tenu dans un `$derived`. Il l'était
     du temps où la carte l'affichait ; maintenant que plus personne ne le
     regarde, le garder à jour revenait à formater 625 nombres en chaîne à
     chaque cran de curseur, pour un texte demandé une fois de temps en temps. */
  async function copyKotlin() {
    const ok = await copy(toKotlin(frame));
    flash(() => (ok ? $_("glyphcast.notice.copied") : $_("glyphcast.notice.copyRefused")));
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
      imported = s.frame;
      /* Le message dit **ce qui manque**, et non seulement ce qui est arrivé.
         « Session rechargée » tout court promettait une restauration complète
         alors que le rack reste verrouillé faute de source : on le lisait comme
         un import qui n'avait rien fait. */
      const loaded = !!img;
      const name = s.device.name;
      flash(() =>
        loaded
          ? $_("glyphcast.notice.settingsReloaded", { values: { device: name } })
          : $_("glyphcast.notice.frameReloaded"),
      );
    } catch {
      flash(() => $_("glyphcast.notice.badJson"));
    }
  }

  /* Le zoom, en tête de carte : même mise en forme que le curseur qu'elle
     contient, donc la même que celle du reste de la page. */
  const zoomText = $derived(
    $number(params.zoom, { style: "percent", maximumFractionDigits: 0 }),
  );
</script>

<svelte:head>
  <title>GLYPHCAST</title>
  <meta name="description" content={$_("glyphcast.description")} />
</svelte:head>

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
  sub={$_("glyphcast.sub")}
  stamp={VERSION}
  {device}
  repo="https://github.com/aero-md/GlyphPortal"
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
      <!-- Trois états, pas deux : sans source la matrice peut porter une trame
           relue d'un fichier, et lui coller « matrice éteinte » sous le nez
           serait faux — ce qu'on regarde est bien le rendu exporté, il n'y a
           simplement rien à en refaire tant que l'image manque. -->
      {#snippet note()}
        {#if !hasImg}
          <p class="empty meta">
            {#if frame === imported}
              {$_("glyphcast.empty.imported")}
            {:else}
              {@html $_("glyphcast.empty.none")}
            {/if}
          </p>
        {/if}
      {/snippet}
    </PreviewPane>
  {/snippet}

  {#snippet rack()}
    <!-- tant qu'il n'y a rien à convertir, c'est la seule carte qui ait
         quelque chose à faire : elle porte le jaune, tout le reste est éteint -->
    <Card
      ref="01"
      title={$_("glyphcast.source.title")}
      stat={hasImg ? `${srcW}×${srcH}` : $_("glyphcast.source.none")}
      cta={!hasImg}
    >
      <label class="drop" class:armed={dragging}>
        <input type="file" accept="image/*" onchange={pickFile} />
        <span class="drop-t">{hasImg ? fileName : $_("glyphcast.source.pick")}</span>
        <span class="drop-s label">{$_("glyphcast.source.hint")}</span>
      </label>
      <div class="btns">
        <!-- une session n'apporte que des réglages : sa place est ici, à
             l'entrée, et pas dans la carte qui produit les fichiers -->
        <label class="filebtn">
          <input type="file" accept="application/json,.json" onchange={importJson} />
          {$_("glyphcast.source.json")}
        </label>
      </div>
      <p class="note">{$_("glyphcast.source.note")}</p>
    </Card>

    <Card
      ref="02"
      title={$_("glyphcast.crop.title")}
      stat={zoomText}
      locked={!hasImg}
    >
      <Slider
        label={$_("glyphcast.crop.zoom")}
        bind:value={params.zoom}
        range={R.zoom}
        reset={DEFAULTS.zoom}
        format="percent"
      />
      <Slider
        label={$_("glyphcast.crop.offsetX")}
        bind:value={params.offsetX}
        range={R.offsetX}
        reset={0}
        format="signed"
      />
      <Slider
        label={$_("glyphcast.crop.offsetY")}
        bind:value={params.offsetY}
        range={R.offsetY}
        reset={0}
        format="signed"
      />
      <Slider
        label={$_("glyphcast.crop.rotation")}
        bind:value={params.rotation}
        range={R.rotation}
        step={1}
        reset={0}
        digits={0}
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
          {$_("glyphcast.crop.reset")}
        </button>
      </div>
    </Card>

    <Card
      ref="03"
      title={$_("glyphcast.mixer.title")}
      stat={$_("glyphcast.mixer.stat")}
      locked={!hasImg}
    >
      <p class="note">{$_("glyphcast.mixer.note")}</p>
      <Slider
        label={$_("glyphcast.mixer.red")}
        bind:value={params.wR}
        range={R.wR}
        reset={DEFAULTS.wR}
      />
      <Slider
        label={$_("glyphcast.mixer.green")}
        bind:value={params.wG}
        range={R.wG}
        reset={DEFAULTS.wG}
      />
      <Slider
        label={$_("glyphcast.mixer.blue")}
        bind:value={params.wB}
        range={R.wB}
        reset={DEFAULTS.wB}
      />
      <div class="btns">
        {#each PRESET_NAMES as name (name)}
          <button type="button" onclick={() => mix(name)}>
            {$_(`glyphcast.mixer.presets.${name}`)}
          </button>
        {/each}
      </div>
    </Card>

    <Card
      ref="04"
      title={$_("glyphcast.tone.title")}
      stat={params.invert ? $_("glyphcast.tone.inverted") : $_("glyphcast.tone.direct")}
      locked={!hasImg}
    >
      <Slider
        label={$_("glyphcast.tone.exposure")}
        bind:value={params.exposure}
        range={R.exposure}
        reset={0}
        format="signed"
        unit={$_("glyphcast.tone.ev")}
      />
      <Slider
        label={$_("glyphcast.tone.black")}
        bind:value={params.black}
        range={R.black}
        reset={0}
        format="percent"
      />
      <Slider
        label={$_("glyphcast.tone.white")}
        bind:value={params.white}
        range={R.white}
        reset={1}
        format="percent"
      />
      <Slider
        label={$_("glyphcast.tone.contrast")}
        bind:value={params.contrast}
        range={R.contrast}
        reset={0}
        format="signed"
      />
      <Slider label={$_("glyphcast.tone.gamma")} bind:value={params.gamma} range={R.gamma} reset={1} />
      <Slider
        label={$_("glyphcast.tone.sharpen")}
        bind:value={params.sharpen}
        range={R.sharpen}
        reset={DEFAULTS.sharpen}
      />
      <div class="btns">
        <button type="button" class:on={params.invert} onclick={() => (params.invert = !params.invert)}>
          {$_("glyphcast.tone.invert")}
        </button>
        <button type="button" onclick={autoLevels} disabled={!hasImg}>
          {$_("glyphcast.tone.auto")}
        </button>
      </div>
    </Card>

    <Card
      ref="05"
      title={$_("glyphcast.led.title")}
      stat={$_("glyphcast.led.stat", { values: { levels: params.levels } })}
      locked={!hasImg}
    >
      <Slider
        label={$_("glyphcast.led.levels")}
        bind:value={params.levels}
        range={R.levels}
        step={1}
        reset={DEFAULTS.levels}
        digits={0}
      />
      <Slider
        label={$_("glyphcast.led.ceiling")}
        bind:value={params.ceiling}
        range={R.ceiling}
        reset={1}
        format="percent"
      />
      <Seg
        label={$_("glyphcast.led.dither")}
        bind:value={params.dither}
        options={[
          { v: "none" as DitherMode, t: $_("glyphcast.led.none") },
          { v: "floyd" as DitherMode, t: "Floyd-Steinberg" },
          { v: "bayer" as DitherMode, t: "Bayer 4×4" },
        ]}
      />
      {#if params.dither !== "none"}
        <Slider
          label={$_("glyphcast.led.amount")}
          bind:value={params.ditherAmount}
          range={R.ditherAmount}
          reset={1}
          format="percent"
        />
      {/if}
      <p class="note">{$_("glyphcast.led.note")}</p>
    </Card>

    <Card ref="06" title={$_("glyphcast.exportCard.title")} stat="{device.ledCount} / {device.cells}">
      <div class="btns">
        <button type="button" onclick={() => exportPng(frame, ledStyle)} disabled={!hasImg}>
          PNG · {ledStyle}
        </button>
        <button type="button" onclick={() => downloadJson(frame, params)} disabled={!hasImg}>.json</button>
        <button type="button" onclick={() => downloadKotlin(frame)} disabled={!hasImg}>.kt</button>
        <button type="button" onclick={copyKotlin} disabled={!hasImg}>
          {$_("glyphcast.exportCard.copy")}
        </button>
      </div>
      <p class="note">
        {@html $_("glyphcast.exportCard.note1")}
        <a href="https://glyphmuseum.com/developers" target="_blank" rel="noopener noreferrer"
          >{$_("glyphcast.exportCard.noteLink")}</a
        >
        {$_("glyphcast.exportCard.note2", { values: { leds: device.ledCount } })}
      </p>
      <!-- Pas d'aperçu de l'IntArray. Il en occupait le bas : 625 nombres dans
           un cadre défilant, qu'on ne lit pas — on les copie. Ce que la carte
           doit dire de la matrice tient déjà dans son compteur de LEDs et dans
           le pied de page. -->
    </Card>
  {/snippet}
</Shell>

<style>
  /* Ce qui reste ici est propre à GlyphCast : la zone de dépôt de fichier et
     l'état vide. Le reste — page, en-tête, rack, pied, boutons, notes — vient
     de `$lib`. */

  .empty {
    flex: none;
    margin: 0;
    border: 1px solid var(--line);
    padding: 0.7rem 0.75rem;
    line-height: 1.7;
    text-transform: none;
    letter-spacing: 0.04em;
  }

  /* `:global` obligatoire : le texte de l'état vide vient du dictionnaire de
     langue et est rendu par `{@html}`, donc son `<b>` ne passe pas par le
     compilateur et ne porte aucune classe de portée. Même point que les mises
     en relief des notes, passées en règles globales dans `app.css`. */
  .empty :global(b) {
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

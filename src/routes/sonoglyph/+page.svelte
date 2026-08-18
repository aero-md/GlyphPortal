<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, type Frame, type LedStyle } from "$lib";
  import type { Dict } from "$lib/i18n";
  import { _, json, number } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import Slider from "$lib/ui/Slider.svelte";
  import { DEFAULT_K, MAX_DB, MIN_DB, MeterEngine } from "./lib/engine";
  import {
    DEFAULT_SIM,
    FS,
    MicSource,
    SimSource,
    TIMBRE_IDS,
    type SimParams,
    type Timbre,
  } from "./lib/source";
  import { NeedleRenderer, TICKS } from "./lib/toys/needle";
  import { STYLE_IDS, VisualizerRenderer, type Style } from "./lib/toys/visualizer";

  const VERSION = "01";

  /* Les deux toys sont dessinés pour une matrice 25 × 25 : le (4a) Pro et ses
     13 × 13 n'afficheraient ni les graduations du cadran ni un chiffre lisible,
     et le spectre y tomberait à treize colonnes. L'appareil est donc figé, et
     `PreviewPane` retire le sélecteur de lui-même quand il n'y a qu'un choix.
     C'est l'app qui tranche, pas les renderers : eux tournent sur n'importe
     quelle géométrie. */
  const device = DEFAULT_DEVICE;

  /* --- ce qui est affiché --- */
  type Toy = "spectre" | "aiguille";
  let toy = $state<Toy>("aiguille");
  let style = $state<Style>("mirror");
  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");

  /* --- ce qui alimente la mesure --- */
  type SourceKind = "sim" | "mic";
  let source = $state<SourceKind>("sim");
  let sim = $state<SimParams>({ ...DEFAULT_SIM });
  let calibrationK = $state(DEFAULT_K);

  /* Gardé en fonction et non en texte : un message figé dans la langue qui avait
     cours quand il a été posé y resterait après un changement de langue. */
  let noticeFn = $state<(() => string) | null>(null);
  const notice = $derived(noticeFn ? noticeFn() : "");

  /* Le moteur est celui du toy, porté ligne à ligne. Il n'est jamais recréé :
     le recréer à chaque changement de réglage remettrait à zéro le Leq et les
     crêtes, et on ne verrait plus jamais l'effet d'une intégration longue. */
  const engine = new MeterEngine(FS, DEFAULT_K);
  const simSource = new SimSource(sim);
  const mic = new MicSource();
  const visualizer = new VisualizerRenderer(device);
  const needle = new NeedleRenderer(device);

  const block = new Float32Array(4096);
  let frame = $state<Frame>(frameOf(device, new Float32Array(device.cells)));
  let snap = $state(engine.snapshot(0));

  $effect(() => {
    simSource.setParams(sim);
  });
  $effect(() => {
    engine.calibrationK = calibrationK;
  });

  /* Boucle d'affichage. Elle fait deux choses dans cet ordre : produire les
     échantillons du temps écoulé, puis rendre une image — comme le service, où
     le thread audio remplit et le handler à 30 fps dessine. */
  $effect(() => {
    let raf = 0;
    let last = performance.now() / 1000;
    let t = 0;

    const step = () => {
      const now = performance.now() / 1000;
      // borné : revenir sur un onglet laissé de côté ne doit pas déclencher la
      // synthèse de dix minutes de signal d'un coup
      const dt = Math.min(0.1, now - last);
      last = now;
      t += dt;

      if (source === "sim") {
        engine.status = "ok";
        let remaining = Math.round(dt * FS);
        while (remaining > 0) {
          const n = Math.min(remaining, block.length);
          simSource.fill(block, n, calibrationK);
          engine.feed(block, n, t);
          remaining -= n;
        }
      } else {
        for (const b of mic.drain()) engine.feed(b, b.length, t);
      }

      snap = engine.snapshot(t);
      /* Copie obligatoire : les renderers réécrivent leur propre grille à chaque
         image, et la préview la lirait au milieu de la passe suivante. */
      const values = (toy === "spectre" ? visualizer.render(snap, style) : needle.render(snap)).slice();
      frame = frameOf(device, values);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  async function useMic() {
    try {
      await mic.start();
      engine.clear();
      engine.status = "ok";
      source = "mic";
      flash(() => $_("sonoglyph.notice.micOpen"));
    } catch (e) {
      engine.status = "no-mic";
      const reason = e instanceof Error ? e.message : String(e);
      flash(() => $_("sonoglyph.notice.micRefused", { values: { reason } }));
    }
  }

  function useSim() {
    mic.stop();
    engine.clear();
    source = "sim";
  }

  /** L'appui long, tel que le système l'enverrait au toy affiché. */
  function longPress() {
    if (toy === "spectre") {
      const i = STYLE_IDS.indexOf(style);
      style = STYLE_IDS[(i + 1) % STYLE_IDS.length];
      const next = style;
      flash(() =>
        $_("sonoglyph.notice.style", { values: { name: $_(`sonoglyph.styles.${next}`) } }),
      );
    } else {
      engine.reset();
      flash(() => $_("sonoglyph.notice.engineReset"));
    }
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: (() => string) | null) {
    noticeFn = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (noticeFn = null), 2600);
  }

  const action = $derived(toy === "spectre" ? $_("sonoglyph.action.style") : $_("sonoglyph.action.reset"));
  /* `$json` et non `$_` : l'entrée porte un nom **et** une note, et les deux
     sont lues séparément par la carte. */
  const timbre = $derived(
    $json(`sonoglyph.timbres.${sim.timbre}`) as Dict["sonoglyph"]["timbres"][Timbre],
  );
  const statusText = $derived(
    snap.status === "ok"
      ? $_("sonoglyph.status.ok")
      : snap.status === "muted"
        ? $_("sonoglyph.status.muted")
        : $_("sonoglyph.status.noSource"),
  );

  /* Les niveaux s'écrivent à décimales imposées. Le formateur est **lu dans la
     dérivation**, et non dans la fonction rendue : c'est cette lecture qui
     abonne le composant, et qui refait passer « 61.4 dB » à « 61,4 dB » au
     changement de langue. */
  const num = $derived.by(() => {
    const fmt = $number;
    return (v: number, digits = 2) =>
      fmt(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  });

  const db = $derived.by(() => {
    const fmt = num;
    return (v: number) => `${fmt(v, 1)} dB`;
  });
</script>

<svelte:head>
  <title>SONOGLYPH</title>
  <meta name="description" content={$_("sonoglyph.description")} />
</svelte:head>

<Shell
  title="Sonoglyph"
  sub={$_("sonoglyph.sub")}
  stamp={VERSION}
  {device}
  repo="https://github.com/aero-md/sonoglyph"
  {notice}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      {device}
      devices={[device]}
      bind:mode
      bind:style={ledStyle}
      {action}
      onlongpress={longPress}
    >
      {#snippet controls()}
        <!-- Le toy vient en premier : c'est le seul réglage de cette rangée qui
             change ce qui tourne sur l'appareil. -->
        <Seg
          label={$_("sonoglyph.toySeg")}
          bind:value={toy}
          options={[
            { v: "aiguille" as Toy, t: $_("sonoglyph.toys.needle") },
            { v: "spectre" as Toy, t: $_("sonoglyph.toys.spectrum") },
          ]}
        />
      {/snippet}
    </PreviewPane>
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, le toy est un APK qui s'installe sur le téléphone. Ici il n'y
         a rien à télécharger — le dire vaut mieux que de laisser chercher. -->
    <Card ref="00" title={$_("common.kind.toy")} stat={$_("sonoglyph.toyCard.archived")}>
      <!-- Pas de « se télécharge en APK » ici, contrairement aux deux autres
           toys : il n'y a rien à télécharger, et le paragraphe suivant dit
           pourquoi. Promettre un APK au-dessus d'une carte marquée « archivé »
           enverrait chercher une release qui n'existe pas. -->
      <p class="note">
        <b>SONOGLYPH</b>
        {$_("common.toyCard.plain", { values: { device: device.name } })}
      </p>
      <p class="note">
        {$_("sonoglyph.toyCard.note1")}
        <a href="https://github.com/aero-md/sonoglyph" target="_blank" rel="noopener noreferrer">
          {$_("sonoglyph.toyCard.noteLink")}</a
        >.
      </p>
    </Card>

    <Card
      ref="01"
      title={$_("sonoglyph.shown.title")}
      stat={toy === "spectre" ? $_("sonoglyph.toys.spectrum") : $_("sonoglyph.toys.needle")}
    >
      {#if toy === "spectre"}
        <Seg
          label={$_("sonoglyph.shown.styleSeg")}
          bind:value={style}
          options={STYLE_IDS.map((v) => ({ v, t: $_(`sonoglyph.styles.${v}`) }))}
        />
        <p class="note">{@html $_("sonoglyph.shown.spectrum1")}</p>
        <p class="note">{$_("sonoglyph.shown.spectrum2")}</p>
      {:else}
        <p class="note">
          {$_("sonoglyph.shown.needle", { values: { ticks: TICKS.join(" · ") } })}
        </p>
      {/if}
    </Card>

    <Card
      ref="02"
      title={$_("sonoglyph.source.title")}
      stat={source === "mic" ? $_("sonoglyph.source.mic") : $_("sonoglyph.source.sim")}
      cta={source === "mic" && snap.status !== "ok"}
    >
      <Seg
        label={$_("sonoglyph.source.seg")}
        value={source}
        options={[
          { v: "sim" as SourceKind, t: $_("sonoglyph.source.simulation") },
          { v: "mic" as SourceKind, t: $_("sonoglyph.source.micLabel") },
        ]}
        onchange={(v) => (v === "mic" ? useMic() : useSim())}
      />
      <p class="note">{$_("sonoglyph.source.note")}</p>
    </Card>

    <Card ref="03" title={$_("sonoglyph.sim.title")} stat={timbre.name} locked={source !== "sim"}>
      <Slider
        label={$_("sonoglyph.sim.target")}
        bind:value={sim.targetDb}
        range={[MIN_DB, MAX_DB]}
        reset={DEFAULT_SIM.targetDb}
        digits={0}
        unit=" dB(A)"
      />
      <Seg
        label={$_("sonoglyph.sim.timbreSeg")}
        bind:value={sim.timbre}
        options={TIMBRE_IDS.map((v) => ({ v: v as Timbre, t: $_(`sonoglyph.timbres.${v}.name`) }))}
      />
      <p class="note">{timbre.note}</p>
      <Slider
        label={$_("sonoglyph.sim.dynamics")}
        bind:value={sim.dynamics}
        range={[0, 1]}
        reset={1}
        format="percent"
      />
      <div class="btns">
        <button type="button" class:on={sim.overdrive} onclick={() => (sim.overdrive = !sim.overdrive)}>
          {$_("sonoglyph.sim.overdrive")}
        </button>
        <button type="button" onclick={() => (sim.targetDb = 42)}>{$_("sonoglyph.sim.quiet")}</button>
        <button type="button" onclick={() => (sim.targetDb = 68)}>
          {$_("sonoglyph.sim.conversation")}
        </button>
        <button type="button" onclick={() => (sim.targetDb = 88)}>{$_("sonoglyph.sim.street")}</button>
        <button type="button" onclick={() => (sim.targetDb = 104)}>{$_("sonoglyph.sim.concert")}</button>
      </div>
      <p class="note">{$_("sonoglyph.sim.note")}</p>
    </Card>

    <Card
      ref="04"
      title={$_("sonoglyph.calibration.title")}
      stat={$_("sonoglyph.calibration.stat", { values: { k: calibrationK.toFixed(0) } })}
    >
      <Slider
        label={$_("sonoglyph.calibration.slider")}
        bind:value={calibrationK}
        range={[100, 140]}
        reset={DEFAULT_K}
        digits={0}
        unit=" dB"
      />
      <p class="note">{@html $_("sonoglyph.calibration.note")}</p>
    </Card>

    <Card ref="05" title={$_("sonoglyph.meter.title")} stat={statusText}>
      <dl class="readout">
        <dt>{$_("sonoglyph.meter.fast")}</dt>
        <dd>{db(snap.laf)}</dd>
        <dt>{$_("sonoglyph.meter.slow")}</dt>
        <dd>{db(snap.las)}</dd>
        <dt>{$_("sonoglyph.meter.leq")}</dt>
        <dd>{db(snap.laeq)}</dd>
        <dt>{$_("sonoglyph.meter.max")}</dt>
        <dd>{db(snap.lafmax)}</dd>
        <dt>{$_("sonoglyph.meter.peak")}</dt>
        <dd>{db(snap.peak)}</dd>
        <dt>{$_("sonoglyph.meter.integration")}</dt>
        <dd>{num(snap.elapsed, 1)} s</dd>
        <dt>{$_("sonoglyph.meter.overload")}</dt>
        <dd class:accent={snap.overload}>
          {snap.overload ? $_("sonoglyph.meter.yes") : $_("sonoglyph.meter.no")}
        </dd>
      </dl>
      <div class="btns">
        <button
          type="button"
          onclick={() => {
            engine.reset();
            flash(() => $_("sonoglyph.notice.reset"));
          }}
        >
          {$_("sonoglyph.meter.reset")}
        </button>
      </div>
    </Card>
  {/snippet}
</Shell>

<style>
  /* Ce qui reste ici est propre à Sonoglyph : le relevé de mesure. Le reste —
     page, en-tête, rack, pied, boutons, notes — vient de `$lib`. */

  /* Deux colonnes, libellé à gauche et valeur à droite, alignées sur une grille
     et non sur des tabulations : les valeurs sont en chiffres à chasse fixe,
     elles doivent tomber les unes sous les autres. */
  .readout {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.28rem 1rem;
    font-size: 11px;
  }

  .readout dt {
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .readout dd {
    margin: 0;
    text-align: right;
    color: var(--ink);
  }
</style>

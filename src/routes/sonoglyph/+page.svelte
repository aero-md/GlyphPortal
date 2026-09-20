<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, resolveDevice, type Device, type Frame, type LedStyle } from "$lib";
  import type { Dict } from "$lib/i18n";
  import { _, json } from "svelte-i18n";
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
  import { SonoRenderer, type SonoToy } from "./lib/render";

  const VERSION = "01";

  /* Le spectre et l'onde tournent sur n'importe quelle géométrie sans y
     changer une ligne. L'aiguille, elle, a deux rendus — voir `compact` dans
     `render.ts` — parce que treize colonnes ne portent ni graduations ni
     aiguille fine (voir `draw.ts`) : sur le (4a) Pro elle devient un dôme
     plein, chiffré sur deux colonnes au lieu de trois. */
  /* `resolveDevice()` et non `DEFAULT_DEVICE` : Sonoglyph dessine les deux
     appareils, donc c'est le réglage global (thème, langue, appareil) qui
     pilote l'appareil d'ouverture — voir `devicePref.ts`. */
  let device = $state<Device>(resolveDevice());

  /* --- ce qui est affiché --- */
  /* Trois modes d'un seul toy, comme sur l'appareil depuis que Sonoglyph a
     rejoint Haloglyph : Spectre, Aiguille et Onde y étaient deux Glyph Toys
     séparés, ils partagent maintenant la même mesure et l'appui long les fait
     tourner l'un dans l'autre — il n'y a plus de style à choisir à part. */
  type Toy = SonoToy;
  let toy = $state<Toy>("aiguille");
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
  /* `DEFAULT_DEVICE` et non `device` : l'initial d'un `$state` ne se lit pas
     hors passe réactive, et `device` ne vaut de toute façon rien d'autre au
     montage — l'`$effect` ci-dessous reconstruit tout de suite après. */
  let sono = new SonoRenderer(DEFAULT_DEVICE);

  const block = new Float32Array(4096);
  let frame = $state<Frame>(frameOf(DEFAULT_DEVICE, new Float32Array(DEFAULT_DEVICE.cells)));
  let snap = $state(engine.snapshot(0));

  /* Le renderer porte l'histoire propre à une géométrie (bandFloor, waveform)
     et ne peut donc pas changer d'appareil sous lui — il est reconstruit à
     neuf. `engine`, lui, ne connaît que du son : aucune géométrie à y refléter,
     donc aucune raison de perdre le Leq en cours en changeant d'appareil. */
  $effect(() => {
    sono = new SonoRenderer(device);
    frame = frameOf(device, new Float32Array(device.cells));
  });

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
      const values = sono.render(snap, toy).slice();
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
      sono.clearHistory();
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
    sono.clearHistory();
    source = "sim";
  }

  /* L'ordre de la rotation, celui du toy : Spectre, Aiguille, Onde — voir
     `SonoMode.kt`. Sonoglyph en faisait deux Glyph Toys, réunis depuis dans
     Haloglyph sous un seul appui long qui fait tourner les trois modes. */
  const ORDER: Toy[] = ["spectre", "aiguille", "onde"];

  /** L'appui long, tel que le système l'enverrait au toy affiché : le mode suivant. */
  function longPress() {
    toy = ORDER[(ORDER.indexOf(toy) + 1) % ORDER.length];
    flash(() => $_("sonoglyph.notice.mode", { values: { name: $_(`sonoglyph.toys.${toyKey(toy)}`) } }));
  }

  /** La clé de dictionnaire d'un mode : `toys.needle` / `toys.spectrum` / `toys.wave`. */
  function toyKey(t: Toy): "needle" | "spectrum" | "wave" {
    return t === "aiguille" ? "needle" : t === "spectre" ? "spectrum" : "wave";
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: (() => string) | null) {
    noticeFn = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (noticeFn = null), 2600);
  }

  const action = $derived($_("sonoglyph.action.next"));
  /* `$json` et non `$_` : l'entrée porte un nom **et** une note, et les deux
     sont lues séparément par la carte. */
  const timbre = $derived(
    $json(`sonoglyph.timbres.${sim.timbre}`) as Dict["sonoglyph"]["timbres"][Timbre],
  );
</script>

<svelte:head>
  <title>SONOGLYPH</title>
  <meta name="description" content={$_("sonoglyph.description")} />
</svelte:head>

<Shell
  title="Sonoglyph"
  sub={$_("sonoglyph.sub")}
  stamp={VERSION}
  bind:device
  repo="https://github.com/aero-md/sonoglyph"
  {notice}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      bind:device
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
            { v: "spectre" as Toy, t: $_("sonoglyph.toys.spectrum") },
            { v: "aiguille" as Toy, t: $_("sonoglyph.toys.needle") },
            { v: "onde" as Toy, t: $_("sonoglyph.toys.wave") },
          ]}
        />
      {/snippet}
    </PreviewPane>
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, le toy est un APK qui s'installe sur le téléphone. Le dépôt
         `sonoglyph` d'origine reste archivé — c'est celui-là qui l'a fait
         figurer longtemps « abandonné » ici — mais le code n'a pas fini sa vie
         avec lui : il tourne aujourd'hui dans Haloglyph, sous le nom Sono. -->
    <Card ref="00" title={$_("common.kind.toy")} stat="Haloglyph">
      <p class="note">
        <b>SONOGLYPH</b>
        {$_("sonoglyph.toyCard.note1", { values: { app: "Haloglyph" } })}
      </p>
      <div class="btns">
        <a href="https://github.com/aero-md/haloglyph" target="_blank" rel="noopener noreferrer">
          {$_("common.toyCard.download")}
        </a>
      </div>
    </Card>

    <Card
      ref="01"
      title={$_("sonoglyph.source.title")}
      stat={source === "mic" ? $_("sonoglyph.source.mic") : $_("sonoglyph.source.sim")}
      cta={source === "mic"}
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

    <Card
      ref="02"
      title={$_("sonoglyph.sim.title")}
      stat={timbre.name}
      locked={source !== "sim"}
      cta={source !== "mic"}
    >
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
  {/snippet}
</Shell>

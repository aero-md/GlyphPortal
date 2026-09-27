<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, resolveDevice, type Device, type Frame, type LedStyle } from "$lib";
  import { _ } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import RenderSeg from "$lib/ui/RenderSeg.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import TiltPad from "$lib/ui/TiltPad.svelte";
  import { GForceEngine, nextGForceMode, type GForceMode, type GForceReading } from "./lib/engine";
  import { GForceRenderer } from "./lib/render";

  const VERSION = "01";

  /* Comme Lapse et Just a dice, le toy écrit du texte — les pics tiennent sur
     quatre valeurs de deux chiffres, calées pour les 25 × 25 du (3). Sur le
     (4a) Pro treize colonnes ne portent qu'un pic à la fois : voir `compact`
     dans `render.ts`, qui les fait défiler un par un, flèche et valeur,
     plutôt que de les caser dans les quatre coins. */
  /* `resolveDevice()` et non `DEFAULT_DEVICE` : G-Meter dessine les deux
     appareils, donc c'est le réglage global (thème, langue, appareil) qui
     pilote l'appareil d'ouverture — voir `devicePref.ts`. */
  let device = $state<Device>(resolveDevice());
  const engine = new GForceEngine();
  /* `DEFAULT_DEVICE` et non `device` : l'initial d'un `$state` ne se lit pas
     hors passe réactive, et `device` ne vaut de toute façon rien d'autre au
     montage — l'`$effect` ci-dessous reconstruit tout de suite après. */
  let renderer = new GForceRenderer(DEFAULT_DEVICE);

  /** Le pavé simule une poussée : ce qu'on subirait dans un virage ou un freinage. */
  const MAX_G = 2;

  let mode = $state<GForceMode>("vif");
  let padX = $state(0);
  let padY = $state(0);

  function onPad(nx: number, ny: number): void {
    engine.setTarget(-ny * MAX_G, nx * MAX_G);
  }

  function longPress(): void {
    mode = nextGForceMode(mode);
  }

  function clearPeaks(): void {
    engine.clearPeaks();
  }

  let previewMode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");
  let buttonReachable = $state(true);

  let frame = $state<Frame>(frameOf(DEFAULT_DEVICE, new Float32Array(DEFAULT_DEVICE.cells)));
  let reading = $state<GForceReading>(engine.snapshot());

  $effect(() => {
    renderer = new GForceRenderer(device);
    frame = frameOf(device, new Float32Array(device.cells));
  });

  $effect(() => {
    let raf = 0;
    let last = performance.now();
    let t = 0;

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      engine.step(dt);
      reading = engine.snapshot();
      const values = mode === "vif" ? renderer.renderLive(reading) : renderer.renderPeaks(reading, t);
      frame = frameOf(device, values.slice());
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<svelte:head>
  <title>G-METER</title>
  <meta name="description" content={$_("gforce.description")} />
</svelte:head>

<Shell
  title="G-Meter"
  sub={$_("gforce.sub")}
  stamp={VERSION}
  bind:device
  repo="https://github.com/aero-md/haloglyph"
  home={true}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      bind:device
      mode={previewMode}
      style={ledStyle}
      action={$_("gforce.action")}
      onlongpress={longPress}
      bind:buttonReachable
    />
  {/snippet}

  {#snippet rack()}
    <Card ref="00" title={$_("common.kind.app")} stat="Haloglyph">
      <p class="note">
        <b>G-FORCES</b>
        {$_("common.toyCard.onlyPack", { values: { app: "Haloglyph" } })}
      </p>
      <RenderSeg bind:mode={previewMode} bind:style={ledStyle} />
      <Seg
        label={$_("gforce.pad.seg")}
        value={mode}
        options={[
          { v: "vif" as GForceMode, t: $_("gforce.modes.vif") },
          { v: "pics" as GForceMode, t: $_("gforce.modes.pics") },
        ]}
        onchange={(m) => (mode = m)}
      />
    </Card>

    <Card ref="01" title={$_("gforce.pad.title")} stat={$_(`gforce.modes.${mode}`)}>
      <TiltPad
        label={$_("gforce.pad.label")}
        bind:x={padX}
        bind:y={padY}
        springBack
        onchange={onPad}
      />
      <p class="note">{@html $_("gforce.pad.note1")}</p>
    </Card>

    <Card ref="02" title={$_("gforce.peaks.title")} stat={$_("gforce.peaks.stat", { values: { front: reading.front.toFixed(1), rear: reading.rear.toFixed(1) } })}>
      <div class="btns">
        <button type="button" onclick={clearPeaks}>{$_("gforce.peaks.reset")}</button>
      </div>
      <p class="note">{@html $_("gforce.peaks.note1")}</p>
    </Card>
  {/snippet}
</Shell>

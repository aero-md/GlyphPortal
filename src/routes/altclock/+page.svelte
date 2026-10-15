<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, resolveDevice, type Device, type Frame, type LedStyle } from "$lib";
  import { _ } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import RenderSeg from "$lib/ui/RenderSeg.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import { AltClockRenderer, FORMATS, STYLES, type AltClockStyle, type HourFormat } from "./lib/render";

  const VERSION = "01";

  /* `resolveDevice()` et non `DEFAULT_DEVICE` : Alt Clock dessine les deux
     appareils, donc c'est le réglage global (thème, langue, appareil) qui
     pilote l'appareil d'ouverture — voir `devicePref.ts`. Sur le (4a) Pro, les
     trois styles s'écrivent avec la même police compacte : voir `render.ts`. */
  let device = $state<Device>(resolveDevice());
  /* `DEFAULT_DEVICE` et non `device` : l'initial d'un `$state` ne se lit pas
     hors passe réactive, et l'`$effect` ci-dessous reconstruit tout de suite
     après. */
  let renderer = new AltClockRenderer(DEFAULT_DEVICE);

  let style = $state<AltClockStyle>("elegant");
  let format = $state<HourFormat>("h24");

  let previewMode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");

  let frame = $state<Frame>(frameOf(DEFAULT_DEVICE, new Float32Array(DEFAULT_DEVICE.cells)));

  /* L'heure du visiteur, relue à chaque seconde : le toy ne redessine qu'à la
     minute, mais la page n'a pas à deviner à quel moment de la minute on est
     tombé dessus. Rien ne change à l'écran entre deux minutes. */
  let now = $state(new Date());
  $effect(() => {
    const tick = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(tick);
  });

  $effect(() => {
    renderer = new AltClockRenderer(device);
    frame = frameOf(device, renderer.render(now.getHours(), now.getMinutes(), format, style).slice());
  });
</script>

<svelte:head>
  <title>ALT CLOCK</title>
  <meta name="description" content={$_("altclock.description")} />
</svelte:head>

<Shell
  title="Alt Clock"
  sub={$_("altclock.sub")}
  stamp={VERSION}
  bind:device
  repo="https://github.com/aero-md/haloglyph"
  home={true}
>
  {#snippet preview()}
    <PreviewPane {frame} bind:device mode={previewMode} style={ledStyle} />
  {/snippet}

  {#snippet rack()}
    <Card ref="00" title={$_("common.kind.app")} stat="Haloglyph">
      <p class="note">
        <b>ALT CLOCK</b>
        {$_("common.toyCard.onlyPack", { values: { app: "Haloglyph" } })}
      </p>
      <RenderSeg bind:mode={previewMode} bind:style={ledStyle} />
      <Seg
        label={$_("altclock.style.seg")}
        value={style}
        options={STYLES.map((v) => ({ v, t: $_(`altclock.style.${v}`) }))}
        onchange={(v) => (style = v)}
      />
      <Seg
        label={$_("altclock.format.seg")}
        value={format}
        options={FORMATS.map((v) => ({ v, t: v === "h24" ? "24 h" : "12 h" }))}
        onchange={(v) => (format = v)}
      />
    </Card>
  {/snippet}
</Shell>

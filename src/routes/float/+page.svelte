<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, resolveDevice, type Device, type Frame, type LedStyle } from "$lib";
  import { _ } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import TiltPad from "$lib/ui/TiltPad.svelte";
  import { PlumbEngine, PlumbScale, nextPlumbMode, type PlumbMode, type PlumbReading } from "./lib/engine";
  import { PlumbRenderer } from "./lib/render";

  const VERSION = "01";

  /* Niveau et onde tournent sur n'importe quelle géométrie sans y changer une
     ligne. La boussole, elle, a deux rendus — voir `compact` dans
     `render.ts` — parce que treize colonnes ne portent ni rose de lettres ni
     aiguille fine : sur le (4a) Pro les répères deviennent des points (un
     losange pour le nord), et la lettre courante s'affiche au centre. */
  /* `resolveDevice()` et non `DEFAULT_DEVICE` : Float dessine les deux
     appareils, donc c'est le réglage global (thème, langue, appareil) qui
     pilote l'appareil d'ouverture — voir `devicePref.ts`. */
  let device = $state<Device>(resolveDevice());
  const engine = new PlumbEngine();
  /* `DEFAULT_DEVICE` et non `device` : l'initial d'un `$state` ne se lit pas
     hors passe réactive, et `device` ne vaut de toute façon rien d'autre au
     montage — l'`$effect` ci-dessous reconstruit tout de suite après. */
  let renderer = new PlumbRenderer(DEFAULT_DEVICE);

  /* La portée n'a plus de réglage côté app (Haloglyph, 2026-09-16) : un fil à
     plomb sans réglage de portée reste un fil à plomb. `engine.range` garde
     donc sa valeur par défaut (`DEFAULT_RANGE`, 15°) pour toute la vie de la
     page — plus de carte "02" ni de sélecteur pour la changer. */
  let mode = $state<PlumbMode>("niveau");

  /* Le pavé donne une pose et non une poussée : relâcher ne le ramène pas au
     centre, comme un téléphone qu'on continue de tenir penché. Le bord du
     pavé correspond à une inclinaison de 90° — plaquer le point sur le cerne
     bascule donc le moteur en régime vertical, exactement comme coucher le
     téléphone sur la tranche. */
  let padX = $state(0);
  let padY = $state(0);
  /* Avant tout contact, le pavé n'a rien à donner : comme le vrai capteur
     avant sa première mesure, l'instrument reste en état « pas de fix »
     plutôt que d'annoncer une pose neutre choisie par défaut. */
  let padTouched = $state(false);

  /* Poussée continue plutôt qu'un envoi par geste : un accéléromètre réel
     livre ses échantillons en continu, même téléphone immobile, ce qui est
     ce qui laisse le filtre adaptatif du moteur converger. Un pavé qui ne
     parlait qu'au mouvement du pointeur figeait le filtre à mi-course dès
     qu'on relâchait — voir la boucle d'animation plus bas, qui rappelle ces
     deux fonctions à chaque image tant que le pavé a été touché. */
  /* `mag` en degrés directement (0 à 90° linéaire) rendait le centre du pavé
     quasi impossible à viser : le rendu suit `PlumbScale`, une échelle
     logarithmique où le degré vaut une quinzaine de cellules près de zéro —
     un pixel de pavé y valait plusieurs dixièmes de degré, bien plus que la
     tolérance du niveau (voir `PlumbScale.tolerance`). En passant le pavé par
     la même courbe (`tiltAt`, son inverse), la position du doigt colle à ce
     que la bulle affiche : beaucoup de course près du centre, peu au bord —
     et le bord du pavé tombe toujours pile sur 90°, comme avant. */
  function feedLevel(nx: number, ny: number): void {
    const mag = Math.min(1, Math.hypot(nx, ny));
    const theta = Math.atan2(ny, nx);
    const angle = (PlumbScale.tiltAt(mag, 90, 1) * Math.PI) / 180;
    engine.onGravity(Math.sin(angle) * Math.cos(theta), Math.sin(angle) * Math.sin(theta), Math.cos(angle));
  }

  /* En boussole, seul l'angle du pavé compte — au centre, aucun cap n'est connu,
     comme un magnétomètre qui n'a encore rien reçu. */
  function feedHeading(nx: number, ny: number): void {
    const mag = Math.hypot(nx, ny);
    if (mag < 0.08) {
      engine.onHeading(null);
      return;
    }
    const deg = ((Math.atan2(nx, -ny) * 180) / Math.PI + 360) % 360;
    engine.onHeading(deg);
  }

  function onPad(): void {
    padTouched = true;
  }

  function longPress(): void {
    mode = nextPlumbMode(mode);
  }

  let previewMode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");
  let buttonReachable = $state(true);

  let frame = $state<Frame>(frameOf(DEFAULT_DEVICE, new Float32Array(DEFAULT_DEVICE.cells)));
  let reading = $state<PlumbReading>(engine.snapshot());

  $effect(() => {
    renderer = new PlumbRenderer(device);
    frame = frameOf(device, new Float32Array(device.cells));
  });

  $effect(() => {
    let raf = 0;

    const step = () => {
      if (padTouched) {
        if (mode === "niveau") feedLevel(padX, padY);
        else feedHeading(padX, padY);
      }
      reading = engine.snapshot();
      const values = renderer.render(reading, mode, engine.range);
      frame = frameOf(device, values.slice());
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<svelte:head>
  <title>FLOAT</title>
  <meta name="description" content={$_("float.description")} />
</svelte:head>

<Shell
  title="Float"
  sub={$_("float.sub")}
  stamp={VERSION}
  bind:device
  repo="https://github.com/aero-md/haloglyph"
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      bind:device
      bind:mode={previewMode}
      bind:style={ledStyle}
      action={$_("float.action")}
      onlongpress={longPress}
      bind:buttonReachable
    />
  {/snippet}

  {#snippet rack()}
    <Card ref="00" title={$_("common.kind.app")} stat="Haloglyph">
      <p class="note">
        <b>FLOAT</b>
        {$_("common.toyCard.onlyPack", { values: { app: "Haloglyph" } })}
      </p>
    </Card>

    <Card ref="01" title={$_("float.instrument.title")} stat={$_(`float.modes.${mode}`)}>
      <Seg
        label={$_("float.instrument.seg")}
        value={mode}
        options={[
          { v: "niveau" as PlumbMode, t: $_("float.modes.niveau") },
          { v: "boussole" as PlumbMode, t: $_("float.modes.boussole") },
        ]}
        onchange={(m) => (mode = m)}
      />
      {#if mode === "niveau"}
        <TiltPad label={$_("float.instrument.tilt")} bind:x={padX} bind:y={padY} onchange={onPad} />
      {:else}
        <TiltPad label={$_("float.instrument.heading")} bind:x={padX} bind:y={padY} onchange={onPad} />
      {/if}
      {#if !buttonReachable}
        <div class="btns">
          <button type="button" onclick={longPress}>{$_("float.instrument.simulate")}</button>
        </div>
      {/if}
      {#if mode === "niveau"}
        <p class="note">{@html $_("float.instrument.note1")}</p>
      {/if}
    </Card>
  {/snippet}
</Shell>

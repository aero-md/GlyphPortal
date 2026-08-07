<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, type Frame, type LedStyle } from "@glyph/kit";
  import Card from "@glyph/kit/Card.svelte";
  import PreviewPane from "@glyph/kit/PreviewPane.svelte";
  import type { PreviewMode } from "@glyph/kit/Preview.svelte";
  import Seg from "@glyph/kit/Seg.svelte";
  import Shell from "@glyph/kit/Shell.svelte";
  import Slider from "@glyph/kit/Slider.svelte";
  import { DEFAULT_K, MAX_DB, MIN_DB, MeterEngine } from "./lib/engine";
  import {
    DEFAULT_SIM,
    FS,
    MicSource,
    SimSource,
    TIMBRES,
    type SimParams,
    type Timbre,
  } from "./lib/source";
  import { NeedleRenderer, TICKS } from "./lib/toys/needle";
  import { STYLES, VisualizerRenderer, type Style } from "./lib/toys/visualizer";

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
  let notice = $state("");

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
      flash("Micro ouvert — traitements du navigateur désactivés");
    } catch (e) {
      engine.status = "no-mic";
      flash(`Micro refusé : ${e instanceof Error ? e.message : e}`);
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
      const i = STYLES.findIndex((s) => s.v === style);
      style = STYLES[(i + 1) % STYLES.length].v;
      flash(`Style : ${STYLES.find((s) => s.v === style)!.t}`);
    } else {
      engine.reset();
      flash("Crête, maximum et Leq remis à zéro");
    }
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: string) {
    notice = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (notice = ""), 2600);
  }

  const action = $derived(toy === "spectre" ? "Style suivant" : "Reset crête");
  const timbre = $derived(TIMBRES.find((x) => x.v === sim.timbre)!);
  const statusText = $derived(
    snap.status === "ok" ? "mesure" : snap.status === "muted" ? "flux muet" : "pas de source",
  );

  const db = (v: number) => `${v.toFixed(1)} dB`;
</script>

<Shell
  title="SONOGLYPH"
  sub="{device.name} • Deux Glyph Toys qui lisent le niveau sonore"
  stamp={VERSION}
  note="Row-major {device.size}×{device.size}, valeurs 0-255, masque circulaire r = {String(
    device.radius,
  ).replace('.', ',')} → {device.ledCount} LEDs. Échelle {MIN_DB}–{MAX_DB} dB(A)."
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
          label="Toy"
          bind:value={toy}
          options={[
            { v: "aiguille" as Toy, t: "Aiguille" },
            { v: "spectre" as Toy, t: "Spectre" },
          ]}
        />
      {/snippet}
    </PreviewPane>
  {/snippet}

  {#snippet rack()}
    <Card ref="01" title="Toy affiché" stat={toy === "spectre" ? "spectre" : "aiguille"}>
      {#if toy === "spectre"}
        <Seg label="Style" bind:value={style} options={STYLES} />
        <p class="note">
          Une bande par colonne, 40 Hz à 16 kHz en pas de tiers d'octave, déjà pondérée A —
          sans quoi le grave écrase les vingt-deux colonnes du haut. Rendu en
          <b>tout ou rien</b> : une LED est allumée ou éteinte, aucune nuance.
        </p>
        <p class="note">
          La hauteur porte seule le niveau. L'axe médian reste allumé en permanence, c'est
          la ligne de base — et à bas niveau la seule chose visible.
        </p>
      {:else}
        <p class="note">
          Le cadran est le contour du disque sur ± 90°, donc toute la moitié haute ; le
          pivot est au centre exact. Graduations majeures : {TICKS.join(" · ")} dB(A).
          Une seule aiguille, sur le niveau Fast. Le chiffre en dessous est en 5×7, arrondi
          à l'entier.
        </p>
      {/if}
      <div class="btns">
        <button type="button" onclick={longPress}>Appui long — {action}</button>
      </div>
      <p class="note">
        L'appui long est la seule commande qu'un Glyph Toy reçoit. Sur la photo, maintenir
        le Glyph Button pendant 450 ms fait la même chose.
      </p>
    </Card>

    <Card
      ref="02"
      title="Source"
      stat={source === "mic" ? "micro" : "simulation"}
      cta={source === "mic" && snap.status !== "ok"}
    >
      <Seg
        label="Échantillons"
        value={source}
        options={[
          { v: "sim" as SourceKind, t: "Simulation" },
          { v: "mic" as SourceKind, t: "Micro" },
        ]}
        onchange={(v) => (v === "mic" ? useMic() : useSim())}
      />
      <p class="note">
        Ni l'une ni l'autre ne calcule de niveau : elles produisent des échantillons, et
        c'est la chaîne du toy — pondération A, détecteur Fast, banc de bandes — qui en
        tire un dB. Le micro passe par un AudioWorklet, avec AGC, réduction de bruit et
        annulation d'écho coupés. Rien ne sort du navigateur.
      </p>
    </Card>

    <Card ref="03" title="Signal simulé" stat={timbre.t} locked={source !== "sim"}>
      <Slider
        label="Niveau visé"
        bind:value={sim.targetDb}
        range={[MIN_DB, MAX_DB]}
        reset={DEFAULT_SIM.targetDb}
        format={(v) => v.toFixed(0)}
        unit=" dB(A)"
      />
      <Seg
        label="Timbre"
        bind:value={sim.timbre}
        options={TIMBRES.map((x) => ({ v: x.v as Timbre, t: x.t }))}
      />
      <p class="note">{timbre.note}</p>
      <Slider
        label="Dynamique"
        bind:value={sim.dynamics}
        range={[0, 1]}
        reset={1}
        format={(v) => `${Math.round(v * 100)} %`}
      />
      <div class="btns">
        <button type="button" class:on={sim.overdrive} onclick={() => (sim.overdrive = !sim.overdrive)}>
          Surcharge
        </button>
        <button type="button" onclick={() => (sim.targetDb = 42)}>Pièce calme</button>
        <button type="button" onclick={() => (sim.targetDb = 68)}>Conversation</button>
        <button type="button" onclick={() => (sim.targetDb = 88)}>Rue</button>
        <button type="button" onclick={() => (sim.targetDb = 104)}>Concert</button>
      </div>
      <p class="note">
        La consigne est en dB(A) et non en dBFS : le gain compense ce que la pondération
        retirera au timbre choisi, mesuré au changement de timbre. Sans cette compensation
        le curseur mentirait de 9 dB entre le sinus et le trafic.
      </p>
    </Card>

    <Card ref="04" title="Calibration" stat="K = {calibrationK.toFixed(0)} dB">
      <Slider
        label="dBFS → dB SPL"
        bind:value={calibrationK}
        range={[100, 140]}
        reset={DEFAULT_K}
        format={(v) => v.toFixed(0)}
        unit=" dB"
      />
      <p class="note">
        <b>Ce chiffre n'est pas mesuré.</b> 120 dB est l'ordre de grandeur d'un MEMS de
        téléphone, dont la pleine échelle tombe par là. Tant que l'exemplaire n'est pas
        caractérisé, le niveau affiché est juste à ±5 dB près — les toys sont des
        indicateurs, pas des sonomètres. Le curseur est ici pour voir ce que la
        calibration déplace ; sur l'appareil c'est une constante.
      </p>
    </Card>

    <Card ref="05" title="Mesure" stat={statusText}>
      <dl class="readout">
        <dt>Fast (LAF)</dt>
        <dd>{db(snap.laf)}</dd>
        <dt>Slow (LAS)</dt>
        <dd>{db(snap.las)}</dd>
        <dt>Équivalent (LAeq)</dt>
        <dd>{db(snap.laeq)}</dd>
        <dt>Maximum</dt>
        <dd>{db(snap.lafmax)}</dd>
        <dt>Crête affichée</dt>
        <dd>{db(snap.peak)}</dd>
        <dt>Intégration</dt>
        <dd>{snap.elapsed.toFixed(1)} s</dd>
        <dt>Surcharge</dt>
        <dd class:accent={snap.overload}>{snap.overload ? "oui" : "non"}</dd>
      </dl>
      <div class="btns">
        <button
          type="button"
          onclick={() => {
            engine.reset();
            flash("Remis à zéro");
          }}
        >
          Reset
        </button>
      </div>
    </Card>
  {/snippet}
</Shell>

<style>
  /* Ce qui reste ici est propre à Sonoglyph : le relevé de mesure. Le reste —
     page, en-tête, rack, pied, boutons, notes — vient de @glyph/kit. */

  .note b {
    color: var(--ink);
    font-weight: 500;
  }

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

<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, type Frame, type LedStyle } from "$lib";
  import { _ } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import { SlotRenderer, type JackpotFx } from "./lib/render";
  import {
    RESULT_DUR,
    STOPS,
    draw,
    idleTargets,
    makePlan,
    offsetAt,
    resultOf,
    targetOffset,
    type Mode,
    type Plan,
    type ResultType,
  } from "./lib/slot";

  const VERSION = "01";

  /* Trois rouleaux de sept colonnes plus deux gouttières font vingt-trois
     colonnes : la machine est dessinée pour les 25 × 25 du (3) et ne se réduit
     pas. L'appareil est donc figé. */
  const device = DEFAULT_DEVICE;
  const renderer = new SlotRenderer(device);

  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");

  /* Le message éphémère est gardé sous forme de **fonction**, pas de texte.
     Un texte y serait figé dans la langue qui avait cours à l'instant où il a
     été posé, et un changement de langue laisserait une phrase orpheline au
     pied de page. La fonction relit le dictionnaire courant à chaque rendu. */
  let noticeFn = $state<(() => string) | null>(null);
  const notice = $derived(noticeFn ? noticeFn() : "");

  let frame = $state<Frame>(frameOf(device, new Float32Array(device.cells)));

  /* --- état de la machine ---
     Hors du système réactif : la boucle le lit et l'écrit soixante fois par
     seconde, et rien dans la page n'en dépend directement. Ce qui doit remonter
     à l'interface — le statut, la progression, le verrou — passe par les trois
     `$state` ci-dessous, écrits seulement quand ils changent. */
  let machineMode: Mode = "idle";
  let offsets: number[] = idleTargets().map((k, i) => targetOffset(i, k));
  let plans: Plan[] | null = null;
  let targets: [number, number, number] | null = null;
  let t0 = 0;
  let resultStart = 0;
  let resultType: ResultType | null = null;
  let fx: JackpotFx | null = null;
  let announced = -1;

  /* La ligne d'état, gardée en **clé** et non en phrase, pour la même raison
     que la note ci-dessus — elle, en plus, reste à l'écran indéfiniment. */
  type StatusKey = "idle" | "spinning" | "reel" | "jackpot" | "win" | "lose";
  let statusKey = $state<StatusKey>("idle");
  let statusReel = $state(0);
  const status = $derived(
    statusKey === "reel"
      ? $_("glyphslot.status.reel", { values: { n: statusReel } })
      : $_(`glyphslot.status.${statusKey}`),
  );

  let busy = $state(false);
  let progress = $state(0);
  /** Le dernier tirage, pour la carte de relevé. */
  let lastRoll = $state<{ syms: [number, number, number]; type: ResultType } | null>(null);

  function spin(force?: "win" | "jackpot") {
    if (machineMode !== "idle") return;
    targets = draw(force);
    plans = offsets.map((o, i) => makePlan(i, o, targets![i], STOPS[i]));
    t0 = performance.now() / 1000;
    machineMode = "spin";
    announced = -1;
    busy = true;
    statusKey = "spinning";
  }

  $effect(() => {
    let raf = 0;

    const step = () => {
      const now = performance.now() / 1000;

      if (machineMode === "spin" && plans && targets) {
        const t = now - t0;
        offsets = plans.map((p) => offsetAt(p, t));
        progress = Math.min(t / 5, 1);

        // « Rouleau 1 arrêté… » : le suspense du toy tient à ce que les trois
        // ne se posent pas ensemble, autant le dire.
        const stopped = STOPS.filter((s) => t >= s).length;
        if (stopped !== announced && stopped > 0 && stopped < 3) {
          announced = stopped;
          statusReel = stopped;
          statusKey = "reel";
        }

        if (t >= STOPS[2] + 0.15) {
          machineMode = "result";
          resultStart = now;
          resultType = resultOf(targets);
          offsets = targets.map((k, i) => targetOffset(i, k));
          lastRoll = { syms: targets, type: resultType };
          fx = resultType === "jackpot" ? renderer.makeFx() : null;
          statusKey = resultType;
        }
      } else if (machineMode === "idle") {
        progress = 0;
      }

      if (machineMode === "result" && resultType) {
        if (now - resultStart > RESULT_DUR[resultType]) {
          machineMode = "idle";
          resultType = null;
          fx = null;
          busy = false;
          statusKey = "idle";
        }
      }

      const result =
        machineMode === "result" && resultType
          ? { type: resultType, elapsed: now - resultStart, fx }
          : null;

      frame = frameOf(device, renderer.render(offsets, result).slice());
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  function longPress() {
    if (machineMode !== "idle") {
      flash(() => $_("glyphslot.stillSpinning"));
      return;
    }
    spin();
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: (() => string) | null) {
    noticeFn = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (noticeFn = null), 2600);
  }

  const rollText = $derived(
    lastRoll ? lastRoll.syms.map((k) => $_(`glyphslot.symbols.${k}`)).join(" · ") : "—",
  );
  const resultText = $derived(
    lastRoll ? $_(`glyphslot.result.${lastRoll.type}`) : "—",
  );
</script>

<svelte:head>
  <title>GLYPHSLOT</title>
  <meta name="description" content={$_("glyphslot.description")} />
</svelte:head>

<Shell
  title="Glyphslot"
  sub={$_("glyphslot.sub")}
  stamp={VERSION}
  {device}
  repo="https://github.com/aero-md/glyphslot"
  {notice}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      {device}
      devices={[device]}
      bind:mode
      bind:style={ledStyle}
      action={busy ? $_("glyphslot.spinCard.busy") : $_("glyphslot.spinCard.spin")}
      onlongpress={longPress}
    />
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, le toy est un APK qui s'installe sur le téléphone. Sans cette
         carte, rien ne dit où il se récupère. -->
    <Card ref="00" title={$_("common.kind.toy")} stat={device.name}>
      <p class="note">
        <b>GLYPHSLOT</b>
        {$_("common.toyCard.apk", { values: { device: device.name } })}
      </p>
      <div class="btns">
        <a
          href="https://github.com/aero-md/glyphslot/releases"
          target="_blank"
          rel="noopener noreferrer">{$_("common.toyCard.download")}</a
        >
      </div>
    </Card>

    <Card
      ref="01"
      title={$_("glyphslot.spinCard.title")}
      stat={busy ? $_("glyphslot.spinCard.running") : $_("glyphslot.spinCard.idle")}
      cta={!busy}
    >
      <div class="bar" aria-hidden="true"><span style="width:{progress * 100}%"></span></div>
      <p class="status" class:accent={statusKey === "jackpot"}>{status}</p>
      <div class="btns">
        <button type="button" onclick={() => spin()} disabled={busy}>
          {$_("glyphslot.spinCard.spin")}
        </button>
        <button type="button" onclick={() => spin("win")} disabled={busy}>
          {$_("glyphslot.spinCard.forceWin")}
        </button>
        <button type="button" onclick={() => spin("jackpot")} disabled={busy}>
          {$_("glyphslot.spinCard.forceJackpot")}
        </button>
      </div>
      <p class="note">{@html $_("glyphslot.spinCard.note1")}</p>
      <p class="note">{$_("glyphslot.spinCard.note2")}</p>
    </Card>

    <Card ref="02" title={$_("glyphslot.roll.title")} stat={resultText}>
      <dl class="readout">
        <dt>{$_("glyphslot.roll.symbols")}</dt>
        <dd>{rollText}</dd>
        <dt>{$_("glyphslot.roll.result")}</dt>
        <dd class:accent={lastRoll?.type === "jackpot"}>{resultText}</dd>
      </dl>
      <p class="note">{$_("glyphslot.roll.note")}</p>
    </Card>

    <Card ref="03" title={$_("glyphslot.reels.title")} stat={$_("glyphslot.reels.stat")}>
      <p class="note">{@html $_("glyphslot.reels.note1")}</p>
      <p class="note">{@html $_("glyphslot.reels.note2")}</p>
      <p class="note">{$_("glyphslot.reels.note3")}</p>
      <p class="note">{$_("glyphslot.reels.note4")}</p>
    </Card>

    <Card ref="04" title={$_("glyphslot.fx.title")} stat={$_("glyphslot.fx.stat")}>
      <p class="note">{@html $_("glyphslot.fx.note1")}</p>
      <p class="note">{@html $_("glyphslot.fx.note2")}</p>
    </Card>
  {/snippet}
</Shell>

<style>
  .status {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--dim);
  }

  /* Progression du lancement : un filet, pas une barre à coins arrondis. Elle
     n'a pas de graduation — elle dit « ça tourne encore », pas « il reste tant ». */
  .bar {
    height: 2px;
    background: var(--line);
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .readout {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
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

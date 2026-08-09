<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, type Frame, type LedStyle } from "$lib";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import { SlotRenderer, type JackpotFx } from "./lib/render";
  import {
    RESULT_DUR,
    STOPS,
    SYMBOL_NAMES,
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
  let notice = $state("");

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

  let status = $state("Appui long sur le Glyph Button pour lancer");
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
    status = "Lancement — les rouleaux défilent…";
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
          status = `Rouleau ${stopped} arrêté…`;
        }

        if (t >= STOPS[2] + 0.15) {
          machineMode = "result";
          resultStart = now;
          resultType = resultOf(targets);
          offsets = targets.map((k, i) => targetOffset(i, k));
          lastRoll = { syms: targets, type: resultType };
          fx = resultType === "jackpot" ? renderer.makeFx() : null;
          status =
            resultType === "jackpot"
              ? "JACKPOT 777"
              : resultType === "win"
                ? "Trois symboles identiques"
                : "Pas de combinaison. Relance !";
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
          status = "Appui long sur le Glyph Button pour lancer";
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
      flash("La machine tourne encore");
      return;
    }
    spin();
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: string) {
    notice = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (notice = ""), 2600);
  }

  const rollText = $derived(
    lastRoll ? lastRoll.syms.map((k) => SYMBOL_NAMES[k]).join(" · ") : "—",
  );
  const RESULT_FR: Record<ResultType, string> = {
    lose: "Perdu",
    win: "Gagné",
    jackpot: "Jackpot",
  };
</script>

<svelte:head>
  <title>GLYPHSLOT</title>
  <meta name="description" content="Préview du Glyph Toy GlyphSlot : une machine à sous sur la Glyph Matrix du Nothing Phone (3)." />
</svelte:head>

<Shell
  title="Glyphslot"
  sub="Une machine à sous pixélisée"
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
      action={busy ? "En cours…" : "Lancer"}
      onlongpress={longPress}
    />
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, le toy est un APK qui s'installe sur le téléphone. Sans cette
         carte, rien ne dit où il se récupère. -->
    <Card ref="00" title="Glyph toy" stat={device.name}>
      <p class="note">
        <b>GLYPHSLOT</b> est une application Android pour {device.name}. Cette page en reproduit
        le fonctionnement dans le navigateur — le toy lui-même se télécharge en APK sur GitHub.
      </p>
      <div class="btns">
        <a
          href="https://github.com/aero-md/glyphslot/releases"
          target="_blank"
          rel="noopener noreferrer">Télécharger</a
        >
      </div>
    </Card>

    <Card ref="01" title="Lancer" stat={busy ? "en cours" : "au repos"} cta={!busy}>
      <div class="bar" aria-hidden="true"><span style="width:{progress * 100}%"></span></div>
      <p class="status" class:accent={status.includes("JACKPOT")}>{status}</p>
      <div class="btns">
        <button type="button" onclick={() => spin()} disabled={busy}>Lancer</button>
        <button type="button" onclick={() => spin("win")} disabled={busy}>Forcer un gain</button>
        <button type="button" onclick={() => spin("jackpot")} disabled={busy}>Forcer le 777</button>
      </div>
      <p class="note">
        Les deux boutons de forçage n'existent pas côté toy : ils sont là pour voir les effets
        sans attendre. Un jackpot tombe à <b>5 %</b>, un gain simple à <b>15 %</b> — vérifier
        que l'animation de sept secondes rend bien en la tirant au sort n'est pas une façon de
        travailler.
      </p>
      <p class="note">
        Sur l'appareil, la seule commande est l'appui long sur le Glyph Button. Maintenir celui
        de la photo pendant 450 ms fait la même chose.
      </p>
    </Card>

    <Card ref="02" title="Dernier tirage" stat={lastRoll ? RESULT_FR[lastRoll.type] : "—"}>
      <dl class="readout">
        <dt>Symboles</dt>
        <dd>{rollText}</dd>
        <dt>Résultat</dt>
        <dd class:accent={lastRoll?.type === "jackpot"}>
          {lastRoll ? RESULT_FR[lastRoll.type] : "—"}
        </dd>
      </dl>
      <p class="note">
        La payline est la fenêtre centrale de sept lignes. Les symboles voisins restent
        affichés au cinquième de l'intensité : c'est ce qui fait lire une fenêtre sur une bande
        qui tourne, et non trois cases indépendantes.
      </p>
    </Card>

    <Card ref="03" title="Rouleaux" stat="3 × 7 colonnes">
      <p class="note">
        Un rouleau n'est pas un symbole tiré au sort à l'arrivée : c'est une bande continue de
        cinq symboles qui tourne, et l'arrêt consiste à choisir <b>où</b> la freiner. On voit
        donc passer les voisins du symbole gagnant avant qu'il ne se pose.
      </p>
      <p class="note">
        L'ordre des symboles diffère d'un rouleau à l'autre — le rouleau <i>i</i> avance de
        <i>i</i>+1 modulo 5. Les voisins d'un symbole aligné ne sont pas les mêmes sur les
        trois, et un alignement ne se lit pas d'avance en regardant ce qui passe au-dessus.
      </p>
      <p class="note">
        Au lancement, le rouleau recule d'abord lentement — un ressort qu'on arme — puis se
        détend. Sans ce recul, le départ est un glissement uniforme qui ne dit pas qu'on vient
        de tirer sur quelque chose.
      </p>
      <p class="note">
        La distance de freinage est tirée dans une plage plutôt que calculée au plus court :
        freiner sur la distance minimale ferait s'arrêter le rouleau presque tout de suite
        quand la cible est déjà proche, et on verrait la machine viser.
      </p>
    </Card>

    <Card ref="04" title="Effets" stat="5 phases">
      <p class="note">
        Un gain simple fait pulser l'anneau du bord. Le jackpot prend l'écran pendant sept
        secondes et demie : triple strobe, ondes de choc concentriques, bandeau
        <b>JACKPOT</b> qui défile, feux d'artifice avec gravité, puis un 7 qui zoome.
      </p>
      <p class="note">
        La secousse décale la trame d'une <b>cellule entière</b>. La préview d'origine secouait
        le canvas : une Glyph Matrix a ses LEDs soudées, elle ne peut pas bouger d'un
        demi-pixel — et un canvas transformé sortirait de la grille de pixels physiques sur
        laquelle repose tout le calage de la préview.
      </p>
    </Card>
  {/snippet}
</Shell>

<style>
  .note b {
    color: var(--ink);
    font-weight: 500;
  }

  .note i {
    font-style: normal;
    color: var(--ink);
  }

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

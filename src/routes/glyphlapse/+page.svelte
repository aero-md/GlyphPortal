<script lang="ts">
  import { DEFAULT_DEVICE, frameOf, type Frame, type LedStyle } from "$lib";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import {
    FORMATS,
    LAPSE_COUNT,
    ROMAN,
    SECONDS_MODES,
    breakdown,
    defaultLapses,
    type Breakdown,
    type Format,
    type Lapse,
    type SecondsMode,
  } from "./lib/lapse";
  import { FMT_SLIDE, LAPSE_SLIDE, LapseRenderer } from "./lib/render";

  const VERSION = "01";

  /* Le toy écrit du texte dans le disque : trois lignes de 3×5, ou deux de 5×7.
     Sur les 13 × 13 du (4a) Pro il ne reste pas de quoi poser un chiffre à deux
     caractères, encore moins une étiquette. L'appareil est donc figé. */
  const device = DEFAULT_DEVICE;
  const renderer = new LapseRenderer(device);

  /* Une préférence système, pas un réglage : quelqu'un qui a demandé moins
     d'animations n'a pas à retrouver un glissement à chaque changement d'onglet.
     L'arrivée est coupée pour la même raison — c'est la plus agitée des trois. */
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- les trois lapses --- */
  /* Le lapse sélectionné **est** le lapse affiché, comme dans l'app de réglages :
     choisir un onglet bascule le toy. Il n'y a pas de « prévisualiser sans
     appliquer », parce que le toy n'a pas cette notion. */
  let lapses = $state<Lapse[]>(defaultLapses());
  let active = $state(0);

  const current = $derived(lapses[active]);

  /* --- animation --- */
  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");
  let notice = $state("");

  /* Le Glyph Button de la photo passe sous la coupe dès que le cadre est rogné
     — colonne unique, ou fenêtre trop courte pour montrer le bas du dos. Comme
     l'appui long est la seule commande du toy, le rack en offre alors un repli.
     La valeur vient de la préview, qui mesure : un seuil de largeur écrit ici se
     tromperait au premier changement de photo. */
  let buttonReachable = $state(true);

  let frame = $state<Frame>(frameOf(device, new Float32Array(device.cells)));
  let readout = $state<Breakdown>(breakdown(lapses[0].ref, Date.now()));

  /* Glissement et arrivée sont hors de l'état réactif : ils sont lus et écrits
     soixante fois par seconde par la boucle, et les passer en `$state` ferait
     invalider la page à chaque image pour un état que personne d'autre ne lit. */
  let slide: { from: Float32Array; start: number; dur: number } | null = null;
  let arrivalStart: number | null = null;
  let lastDir: string | null = null;
  const t0 = performance.now() / 1000;

  /** Le rendu courant, hors transitions — la source d'un glissement. */
  function snapshot(): Float32Array {
    const now = performance.now() / 1000;
    return renderer
      .render(breakdown(current.ref, Date.now()), current.format, current.sec, now - t0, null, null)
      .slice();
  }

  function startSlide(dur: number) {
    if (reduced) return;
    slide = { from: snapshot(), start: performance.now() / 1000, dur };
  }

  $effect(() => {
    let raf = 0;

    const step = () => {
      const tNow = performance.now() / 1000;
      const d = breakdown(current.ref, Date.now());

      // le franchissement de l'échéance, saisi au passage : c'est le seul
      // événement du toy qu'aucun réglage ne déclenche
      if (lastDir === "until" && d.dir === "since" && !reduced) arrivalStart = tNow;
      lastDir = d.dir;

      let slideArg: { from: Float32Array; progress: number } | null = null;
      if (slide) {
        const u = Math.min(1, (tNow - slide.start) / slide.dur);
        if (u >= 1) slide = null;
        else slideArg = { from: slide.from, progress: u };
      }

      let arrivalT: number | null = null;
      if (arrivalStart !== null) {
        const ta = tNow - arrivalStart;
        if (ta > 4) arrivalStart = null;
        else arrivalT = ta;
      }

      const values = renderer
        .render(d, current.format, current.sec, tNow - t0, slideArg, arrivalT)
        .slice();
      frame = frameOf(device, values);
      readout = d;
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  /* --- commandes --- */
  function setFormat(f: Format) {
    if (f === current.format) return;
    startSlide(FMT_SLIDE);
    lapses[active].format = f;
  }

  function setSec(s: SecondsMode) {
    lapses[active].sec = s;
  }

  function setRef(ms: number) {
    lapses[active].ref = ms;
    lastDir = null;
    arrivalStart = null;
  }

  function switchLapse(i: number) {
    if (i === active) return;
    startSlide(LAPSE_SLIDE);
    active = i;
    lastDir = null;
    arrivalStart = null;
  }

  /** Le lapse activé suivant, en rotation, ou l'actif s'il est le seul. */
  function nextEnabledIndex(): number {
    for (let k = 1; k < LAPSE_COUNT; k++) {
      const c = (active + k) % LAPSE_COUNT;
      if (lapses[c].enabled) return c;
    }
    return active;
  }

  function longPress() {
    const next = nextEnabledIndex();
    // un seul lapse activé : le toy ne ferait rien. On le dit, plutôt que de
    // laisser croire à une panne.
    if (next === active) flash("Un seul lapse activé — le toy ne bascule nulle part");
    else switchLapse(next);
  }

  function toggleEnabled() {
    if (active === 0) return; // le lapse I est toujours dans la rotation
    lapses[active].enabled = !lapses[active].enabled;
  }

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: string) {
    notice = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (notice = ""), 2600);
  }

  /* --- champ de date --- */
  /* `datetime-local` veut une heure **locale** sans fuseau ; `toISOString` rend
     de l'UTC. D'où le décalage appliqué avant la découpe, sinon le champ affiche
     une heure différente de celle qu'on vient d'y taper. */
  const toLocalInput = (ms: number) =>
    new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19);

  const refInput = $derived(toLocalInput(current.ref));

  function onRefInput(e: Event) {
    const v = new Date((e.currentTarget as HTMLInputElement).value).getTime();
    if (!isNaN(v)) setRef(v);
  }

  const PRESETS: { t: string; ms: () => number }[] = [
    { t: "Début d'année", ms: () => new Date(new Date().getFullYear(), 0, 1).getTime() },
    { t: "Il y a 5 jours", ms: () => Date.now() - 5 * 86400000 - 3 * 3600000 - 1000 * 60 * 7 },
    {
      t: "Noël",
      ms: () => {
        const now = new Date();
        let noel = new Date(now.getFullYear(), 11, 25);
        if (noel < now) noel = new Date(now.getFullYear() + 1, 11, 25);
        return noel.getTime();
      },
    },
    { t: "An 2000", ms: () => new Date(2000, 0, 1).getTime() },
    { t: "Dans 10 s", ms: () => Date.now() + 10000 },
  ];

  /* --- relevé --- */
  const UNIT_FR = [
    ["an", "ans"],
    ["mois", "mois"],
    ["jour", "jours"],
    ["h", "h"],
    ["min", "min"],
  ];

  const readoutText = $derived.by(() => {
    const d = readout;
    const parts = [d.years, d.months, d.days, d.hours, d.minutes]
      .map((v, i) => (v > 0 ? `${v} ${UNIT_FR[i][v > 1 ? 1 : 0]}` : null))
      .filter(Boolean);
    parts.push(`${d.seconds} s`);
    return parts.join(" · ");
  });

  const refText = $derived(
    new Date(current.ref).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }),
  );

  const enabledCount = $derived(lapses.filter((l) => l.enabled).length);
</script>

<svelte:head>
  <title>GLYPHLAPSE</title>
  <meta name="description" content="Préview du Glyph Toy GlyphLapse : le temps qui passe, décomposé sur la Glyph Matrix du Nothing Phone (3)." />
</svelte:head>

<Shell
  title="Glyphlapse"
  sub="Une visualisation du temps qui passe"
  stamp={VERSION}
  {device}
  repo="https://github.com/aero-md/glyphlapse"
  {notice}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      {device}
      devices={[device]}
      bind:mode
      bind:style={ledStyle}
      action="Lapse suivant"
      onlongpress={longPress}
      bind:buttonReachable
    />
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, le toy est un APK qui s'installe sur le téléphone. Sans cette
         carte, rien ne dit où il se récupère. -->
    <Card ref="00" title="Glyph toy" stat={device.name}>
      <p class="note">
        <b>GLYPHLAPSE</b> est une application Android pour {device.name}. Cette page en reproduit
        le fonctionnement dans le navigateur — le toy lui-même se télécharge en APK sur GitHub.
      </p>
      <div class="btns">
        <a
          href="https://github.com/aero-md/glyphlapse/releases"
          target="_blank"
          rel="noopener noreferrer">Télécharger</a
        >
      </div>
    </Card>

    <Card ref="01" title="Lapse affiché" stat="{ROMAN[active]} · {enabledCount} / {LAPSE_COUNT} activés">
      <Seg
        label="Lapse"
        value={active}
        options={ROMAN.map((r, i) => ({ v: i, t: r }))}
        onchange={switchLapse}
      />
      <div class="btns">
        <button type="button" class:on={current.enabled} disabled={active === 0} onclick={toggleEnabled}>
          {current.enabled ? "Activé — dans la rotation" : "Désactivé"}
        </button>
        <!-- Repli : le Glyph Button de la photo est hors champ, et l'appui long
             est la seule commande du toy. Il n'apparaît pas quand le bouton est
             là — un doublon permanent apprendrait la mauvaise interaction. -->
        {#if !buttonReachable}
          <button type="button" onclick={longPress}>Simuler l'appui long</button>
        {/if}
      </div>
      <p class="note">
        L'appui long sur le Glyph Button passe au lapse activé suivant. Le lapse <b>I</b> ne se
        désactive pas : un toy sans aucun lapse actif n'aurait rien à afficher.
      </p>
      <p class="note">
        L'onglet sélectionné <b>est</b> celui que le toy affiche : il n'y a pas d'un côté le
        lapse qu'on règle et de l'autre celui qui tourne. C'est le comportement de l'app de
        réglages, où choisir un onglet bascule le toy.
      </p>
    </Card>

    <Card ref="02" title="Échéance" stat={readout.dir === "since" ? "depuis" : "jusqu'au"}>
      <label class="field">
        <span class="label">Instant de référence</span>
        <input type="datetime-local" step="1" value={refInput} onchange={onRefInput} />
      </label>
      <div class="btns">
        {#each PRESETS as p (p.t)}
          <button type="button" onclick={() => setRef(p.ms())}>{p.t}</button>
        {/each}
      </div>
      <p class="note">
        Une échéance à venir bascule le toy en compte à rebours. Au franchissement, il joue une
        arrivée de quatre secondes — <b>Dans 10 s</b> est là pour la voir sans attendre.
      </p>
    </Card>

    <Card ref="03" title="Format" stat={FORMATS[current.format]}>
      <Seg
        label="Mise en page"
        value={current.format}
        options={FORMATS.map((t, i) => ({ v: i as Format, t }))}
        onchange={setFormat}
      />
      <p class="note">
        <b>Dense</b> écrit toute la granularité, deux unités par ligne quand il le faut.
        <b>Compact</b> ne garde que les deux unités de tête, en 5×7. <b>Cycle</b> les fait
        défiler une par une. <b>Jours</b> ne dit que le total.
      </p>
      <p class="note">
        Les unités de tête à zéro sont coupées : « 0A 0M 3J » gâcherait deux lignes de disque
        pour dire qu'il ne s'est rien passé.
      </p>
    </Card>

    <Card ref="04" title="Secondes" stat={SECONDS_MODES[current.sec]}>
      <Seg
        label="Rendu de la minute"
        value={current.sec}
        options={SECONDS_MODES.map((t, i) => ({ v: i as SecondsMode, t }))}
        onchange={setSec}
      />
      <p class="note">
        <b>Anneau</b> remplit le bord depuis midi — horaire quand le temps s'accumule,
        antihoraire quand il se consomme. <b>Sablier</b> monte ou descend un niveau de sable
        dont la surface est un cône : pointe au centre en « depuis », entonnoir en « jusqu'à ».
      </p>
      <p class="note">
        La hauteur du sable est trouvée par dichotomie et non calculée : la surface de disque
        au-dessus d'une ligne n'a pas d'expression simple, et quatorze itérations suffisent à
        retomber sur la bonne quantité à la cellule près.
      </p>
    </Card>

    <Card ref="05" title="Relevé" stat="{readout.totalDays} j">
      <dl class="readout">
        <dt>Référence</dt>
        <dd>{refText}</dd>
        <dt>Direction</dt>
        <dd>{readout.dir === "since" ? "Depuis" : "Jusqu'au"}</dd>
        <dt>Décomposition</dt>
        <dd>{readoutText}</dd>
        <dt>Total en jours</dt>
        <dd>{readout.totalDays}</dd>
      </dl>
      <p class="note">
        La décomposition suit le calendrier, pas une division : deux mois font 59, 60 ou 62
        jours selon lesquels. C'est le même comptage que <code>Period.between</code> côté toy.
      </p>
    </Card>
  {/snippet}
</Shell>

<style>
  .note b {
    color: var(--ink);
    font-weight: 500;
  }

  .note code {
    color: var(--ink);
    font-size: 10px;
  }

  /* Le seul champ de saisie du portail. Même filet et même rembourrage que les
     boutons : il doit se lire comme une commande de la même famille. */
  .field {
    display: block;
  }

  .field .label {
    display: block;
    margin-bottom: 0.35rem;
  }

  .field input {
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 0;
    background: transparent;
    color: var(--ink);
    padding: 0.4rem 0.5rem;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .field input:hover {
    border-color: var(--ink);
  }

  /* L'icône de calendrier de Chrome est noire en dur : elle disparaît sur fond
     sombre. On l'inverse avec le thème plutôt que de masquer le sélecteur, qui
     est la façon la plus simple de saisir une date. */
  :global(:root[data-theme="dark"]) .field input::-webkit-calendar-picker-indicator {
    filter: invert(1);
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

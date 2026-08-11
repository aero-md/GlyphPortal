<script lang="ts">
  import { DEVICES, DEFAULT_DEVICE, emptyFrame, frameOf, type Device, type Frame, type LedStyle } from "$lib";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import { DiceRenderer } from "./lib/render";
  import {
    DEAD_HEAD,
    DEAD_TAIL,
    T_BRAKE,
    T_END,
    T_LAND,
    T_TOSS,
    drawValue,
    makeThrow,
    orientationAt,
    restQuat,
    restingView,
    stageAt,
    verdict,
    viewAt,
    type Quat,
    type Stage,
    type Throw,
    type Verdict,
  } from "./lib/dice";
  import { DEFAULT_DIE, DICE, dieById, type Die, type DieId } from "./lib/solids";

  /* `01` depuis que l'APK existe : la page a cessé d'être un concept en cours
     d'essai pour devenir la référence d'un toy embarqué. */
  const VERSION = "01";

  /* Les deux appareils, et c'est le seul toy du portail qui puisse se le
     permettre : le dé est un solide lancé de rayons, pas un dessin de dé. Rien
     dans le rendu ne connaît la taille de la grille — voir `render.ts`. Sur les
     13 × 13 du (4a) Pro la culbute est grossière et illisible, et le gros plan
     final reste net : c'est exactement le compromis que le noyau du portail
     annonce, à chaque toy de dire s'il le tient. */
  let device = $state<Device>(DEFAULT_DEVICE);
  /* La constante et non `device` : le rendu est reconstruit par la boucle quand
     l'appareil change, et lire l'état ici n'en capturerait de toute façon que la
     valeur initiale. */
  let renderer = new DiceRenderer(DEFAULT_DEVICE);

  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");
  let notice = $state("");
  let buttonReachable = $state(true);

  let frame = $state<Frame>(emptyFrame(DEFAULT_DEVICE));

  /* --- l'état du dé ---
     Hors du système réactif : la boucle le lit et l'écrit soixante fois par
     seconde. Ce qui doit remonter à l'interface passe par les `$state` plus bas,
     écrits seulement quand ils changent.

     `die` est la seule exception : il change au geste, pas à l'image, et le rack
     comme le sélecteur de la préview doivent le voir. */
  let die = $state<Die>(DEFAULT_DIE);

  /** Le dé démarre **posé sur sa plus haute face** — un 6 sur le d6. */
  let rest: Quat = restQuat(DEFAULT_DIE, DEFAULT_DIE.faces, 0);
  let th: Throw | null = null;
  let t0 = 0;
  /** Secondes depuis le jet, `null` quand le dé est posé. */
  let elapsed: number | null = null;
  /** Le résultat de ce jet a-t-il déjà été relevé ? */
  let landed = false;

  let stage = $state<Stage>("rest");
  let listening = $state(true);
  let progress = $state(0);
  /** Face lue au dernier jet **posé**, et nombre de jets, par dé. */
  let last = $state<Record<DieId, number>>({ d6: 0, d10: 0, d12: 0, d20: 0 });
  /* Un tableau par dé : mêler les jets d'un d6 et d'un d20 dans le même
     histogramme ne compterait rien du tout. Construit depuis `DICE`, pour qu'un
     solide de plus n'oblige pas à penser à cette ligne-ci. */
  let counts = $state<Record<DieId, number[]>>(
    Object.fromEntries(DICE.map((d) => [d.id, Array(d.faces).fill(0)])) as Record<
      DieId,
      number[]
    >,
  );

  const REJECT: Record<Verdict, string> = {
    ok: "",
    "too-early": "Le dé vient de partir",
    "too-late": "Le dé se pose — laissez-le se poser",
    reading: "On lit la face",
  };

  function roll(force?: number) {
    const v = verdict(elapsed);
    if (v !== "ok") {
      refuse(REJECT[v]);
      return;
    }
    /* Le jet part de l'orientation **courante** : relancer un dé encore en l'air
       ne le téléporte pas dans sa pose de repos, il repart d'où il en était. */
    const from = th && elapsed !== null ? orientationAt(th, elapsed) : rest;
    th = makeThrow(die, from, force ?? drawValue(die));
    t0 = performance.now() / 1000;
    landed = false;
  }

  /**
   * Changer de solide — ce que fait l'appui long.
   *
   * Refusé tant que le dé n'est pas posé : échanger le solide en pleine culbute
   * ferait disparaître un résultat au profit d'un dé qui n'a pas été jeté, et
   * l'animation en cours ne veut plus rien dire pour la forme qui arrive.
   */
  function pick(id: DieId) {
    if (elapsed !== null) {
      refuse("Le dé est en l'air");
      return;
    }
    if (id === die.id) return;
    die = dieById(id);
    rest = restQuat(die, die.faces, 0);
    flash(`${die.id} — ${die.solid}`);
  }

  /** L'appui long fait défiler les quatre solides, dans l'ordre du sélecteur. */
  function nextDie() {
    pick(DICE[(DICE.findIndex((d) => d.id === die.id) + 1) % DICE.length].id);
  }

  $effect(() => {
    let raf = 0;

    const step = () => {
      // L'appareil a changé : la grille sous le dé n'est plus la même.
      if (renderer.device !== device) renderer = new DiceRenderer(device);

      const now = performance.now() / 1000;

      if (th) {
        const t = now - t0;

        /* Le relevé attend la pose, et pas le tirage — qui est connu dès le
           départ. Un jet relancé en vol n'a donc jamais eu lieu : il ne compte
           pas dans le tableau, ce qui est la seule façon honnête de compter des
           dés. */
        if (t >= T_LAND && !landed) {
          landed = true;
          last[die.id] = th.value;
          counts[die.id][th.value - 1] += 1;
        }

        if (t >= T_END) {
          rest = th.qEnd;
          th = null;
          elapsed = null;
        } else elapsed = t;
      }

      /* La vue est calculée **après** la mise à jour de l'état, et il y a une
         raison. Quand elle était prise en tête de boucle, l'image où le jet
         s'achevait était rendue avec la pose de repos d'avant — le dé montrait
         le résultat précédent pendant exactement une image, juste avant de
         montrer le bon. Un scintillement d'une image se voit très bien et ne se
         retrouve pas en le cherchant : il ne pouvait sortir que de l'ordre des
         deux lignes. */
      const view = th && elapsed !== null ? viewAt(die, th, elapsed) : restingView(die, rest);

      const st = stageAt(elapsed);
      if (st !== stage) stage = st;
      const li = verdict(elapsed) === "ok";
      if (li !== listening) listening = li;
      progress = elapsed === null ? 0 : Math.min(elapsed / T_END, 1);

      frame = frameOf(device, renderer.render(die, view).slice());
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: string) {
    notice = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (notice = ""), 2200);
  }

  /* Deux canaux et pas un seul, parce qu'ils n'ont pas le même destinataire.
     `notice` confirme au pied de page qu'on a changé de solide — une nouvelle,
     pas une réponse. `reject` dit **dans la carte**, sur la ligne d'état que
     l'œil lit déjà, pourquoi le clic qu'on vient de faire n'a rien produit. Un
     refus annoncé six cents pixels plus bas en corps 10 n'est pas un refus,
     c'est un bouton qui ne marche pas. */
  let reject = $state("");
  let rejectTimer: ReturnType<typeof setTimeout>;
  function refuse(msg: string) {
    reject = msg;
    clearTimeout(rejectTimer);
    if (msg) rejectTimer = setTimeout(() => (reject = ""), 2200);
  }

  /* Repliée par défaut, et pour tous les dés. Ouverte, la rangée passe de six à
     vingt boutons selon le solide : la carte changeait de hauteur à chaque
     changement de dé et poussait tout le rack sous les yeux du lecteur. */
  let showForce = $state(false);

  /** Virgule décimale — la page est en français, et son pied de page l'écrit déjà. */
  const fr = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

  const status = $derived(
    stage === "rest"
      ? "Le dé est posé — secouez pour jeter"
      : stage === "toss"
        ? "Le dé quitte la main"
        : stage === "tumble"
          ? "Il culbute — une secousse le relance"
          : stage === "brake"
            ? listening
              ? "Il ralentit"
              : "Il se pose"
            : "Gros plan sur la face",
  );

  /** Position d'un instant sur la frise, en pour-cent. */
  const pc = (t: number) => (t / T_END) * 100;

  const tally = $derived(counts[die.id]);
  const maxCount = $derived(Math.max(1, ...tally));
  const landedCount = $derived(tally.reduce((a, b) => a + b, 0));
  const expected = $derived(landedCount / die.faces);
  const value = $derived(last[die.id]);

  /* L'espérance ne dit rien avant qu'on ait jeté : à un jet sur un d20 elle
     annonce 0,1 par face, ce qui est exact et parfaitement inutile. Deux tours
     de dé complets, et la phrase comme le trait pointillé ont un sens. */
  const enough = $derived(landedCount >= die.faces * 2);
  /** Hauteur du trait d'espérance dans la colonne, en fraction de la plus haute. */
  const expRatio = $derived(Math.min(1, expected / maxCount));
</script>

<svelte:head>
  <title>JUST A DICE</title>
  <meta
    name="description"
    content="Préview du Glyph Toy Just a dice : un dé jeté d'une secousse sur la Glyph Matrix d'un Nothing Phone."
  />
</svelte:head>

<Shell
  title="Just a dice"
  sub="Un dé, et rien d'autre"
  stamp={VERSION}
  {device}
  repo="https://github.com/aero-md/justadice"
  {notice}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      bind:device
      devices={DEVICES}
      bind:mode
      bind:style={ledStyle}
      bind:buttonReachable
      action="Dé suivant"
      onlongpress={nextDie}
    >
      {#snippet controls()}
        <!-- En tête de rangée, avant l'appareil : c'est le seul réglage ici qui
             change ce qui tourne sur le téléphone, les trois autres ne changent
             que la façon de le regarder. -->
        <Seg
          label="Dé"
          value={die.id}
          options={DICE.map((d) => ({ v: d.id, t: d.id }))}
          onchange={pick}
        />
      {/snippet}
    </PreviewPane>
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, le toy est un APK qui s'installe sur le téléphone. Sans cette
         carte, rien ne dit où il se récupère. -->
    <Card ref="00" title="Glyph toy" stat={device.name}>
      <p class="note">
        <b>JUST A DICE</b> est une application Android pour {device.name}. Cette page en reproduit
        le fonctionnement dans le navigateur — le toy lui-même se télécharge en APK sur GitHub.
      </p>
      <div class="btns">
        <a
          href="https://github.com/aero-md/justadice/releases"
          target="_blank"
          rel="noopener noreferrer">Télécharger</a
        >
      </div>
    </Card>

    <!-- Jeter et lire le résultat sont le même geste, et c'était deux cartes
         séparées par une troisième : on secouait, et le chiffre sortait deux
         cartes plus bas, hors de l'écran. Une seule carte, coupée d'un filet :
         au-dessus ce qu'on fait, en dessous ce que ça donne. -->
    <Card
      ref="01"
      title="Jeter"
      stat={listening ? "à l'écoute" : "verrouillé"}
      cta={stage === "rest"}
    >
      <div class="bar" class:idle={progress === 0} aria-hidden="true">
        <span style="width:{progress * 100}%"></span>
      </div>
      <!-- La ligne d'état porte aussi les refus : c'est la seule ligne de la
           carte que l'œil suit déjà pendant un jet. -->
      <p class="status" class:accent={!!reject}>{reject || status}</p>
      <div class="btns">
        <button type="button" onclick={() => roll()} disabled={!listening}>Secouer</button>
        <button type="button" onclick={nextDie} disabled={stage !== "rest"}>Dé suivant</button>
        <button
          type="button"
          class:on={showForce}
          aria-pressed={showForce}
          onclick={() => (showForce = !showForce)}>Forcer une face</button
        >
      </div>
      {#if showForce}
        <div class="btns force">
          {#each die.face.map((f) => f.value).sort((a, b) => a - b) as v (v)}
            <button type="button" onclick={() => roll(v)} disabled={!listening}>{v}</button>
          {/each}
        </div>
        <p class="note">
          Ces boutons n'existent pas côté toy : ils sont là pour voir une face précise sans
          l'attendre. La valeur est de toute façon <b>tirée au départ</b> — l'animation ne la
          découvre pas, elle y conduit.
        </p>
      {/if}
      <p class="note">
        Sur l'appareil : <b>secouer le téléphone</b> jette le dé, un <b>appui long sur le Glyph
        Button</b> change de solide — ce que refont les deux premiers boutons ci-dessus.
      </p>

      <div class="split"></div>

      <dl class="readout">
        <dt>Face</dt>
        <dd class="big">{landedCount ? value : "—"}</dd>
        <dt>Jets posés</dt>
        <dd>{landedCount}</dd>
      </dl>
      <div class="hist" style="grid-template-columns:repeat({die.faces}, 1fr)">
        {#each tally as c, i (i)}
          <div class="col">
            <!-- Rien pour une face jamais tombée : un filet d'une cellule sur
                 toutes les colonnes vides se lit comme une ligne de séparation,
                 pas comme un histogramme à zéro. Et pas de zéro écrit dessous
                 non plus : sur un d20 c'était une rangée de vingt zéros, une
                 bande de bruit sous un tableau vide. La colonne absente dit
                 déjà zéro. -->
            <div class="stack">
              {#if c > 0}<span class="val" style="height:{(c / maxCount) * 100}%"></span>{/if}
            </div>
            <span class="lab">{i + 1}</span>
            <span class="num" class:zero={c === 0}>{c}</span>
          </div>
        {/each}
        <!-- Hors flux, donc hors grille, et en dernier pour passer au-dessus des
             barres. La note donnait déjà l'espérance en chiffre ; le trait est
             la seule façon de voir l'écart sans compter. -->
        {#if enough}
          <span class="exp" style="top:calc(var(--stack) * {1 - expRatio})" aria-hidden="true"
          ></span>
        {/if}
      </div>
      <p class="note">
        Un tableau par dé.
        {#if enough}
          À {landedCount} jets, chaque face en attend {fr(expected, 1)} — le trait pointillé.
        {/if}
      </p>
    </Card>

    <Card ref="02" title="Minutage" stat="{fr(T_END)} s">
      <div class="tl" aria-hidden="true">
        <span
          class="live"
          style="left:{pc(DEAD_HEAD)}%;width:{pc(T_LAND - DEAD_TAIL - DEAD_HEAD)}%"
        ></span>
        <span class="mark" style="left:{pc(T_TOSS)}%"></span>
        <span class="mark" style="left:{pc(T_BRAKE)}%"></span>
        <span class="mark land" style="left:{pc(T_LAND)}%"></span>
        {#if progress > 0}<span class="head" style="left:{progress * 100}%"></span>{/if}
      </div>
      <!-- La légende, en toutes lettres et collée à la frise. Sans elle, quatre
           zones, trois traits et une bande rouge dont personne ne peut deviner
           qu'elle est la fenêtre d'écoute. -->
      <p class="note">
        La bande rouge est la fenêtre où une secousse <b>relance le dé</b> — avant, c'est la fin du
        geste précédent ; après, le dé choisit sa face.
      </p>
      <dl class="readout">
        <dt>Impulsion</dt>
        <dd>0 → {fr(T_TOSS)} s</dd>
        <dt>Culbute</dt>
        <dd>{fr(T_TOSS)} → {fr(T_BRAKE)} s</dd>
        <dt>Mise en place</dt>
        <dd>{fr(T_BRAKE)} → {fr(T_LAND)} s</dd>
        <dt>Gros plan</dt>
        <dd>{fr(T_LAND)} → {fr(T_END)} s</dd>
      </dl>
      <p class="note">
        Six rebonds, puis la caméra se rapproche pour révéler la face du dessus.
      </p>
    </Card>

    <Card ref="03" title="Le rendu" stat={die.faces === 6 ? "pips 3 × 3" : "chiffre"}>
      <p class="note">
        Sur vingt-cinq LEDs de côté, un dé vu de trois quarts ne se lit pas : la pose de repos est le
        gros plan à l'aplomb, les trois quarts n'existent qu'en vol.
      </p>
      <p class="note">
        Un pip fait 3 × 3 cellules, un nombre est un glyphe dilaté, et la marque ne s'imprime
        qu'<b>au gros plan</b> — en vol elle serait rognée par une arête et changerait à chaque
        rebond.
      </p>
    </Card>
  {/snippet}
</Shell>

<style>
  .note b {
    color: var(--ink);
    font-weight: 500;
  }

  .status {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--dim);
  }

  /* Un filet, pas une barre à coins arrondis : il dit « ça tourne encore ». */
  .bar {
    height: 2px;
    background: var(--line);
  }

  /* Au repos la piste n'a rien à dire, et un filet gris permanent sous l'en-tête
     se lit comme une seconde bordure de carte. Elle s'efface sans se retirer :
     retirée, la carte se réajusterait de deux pixels à chaque jet. */
  .bar.idle {
    background: transparent;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  /* La carte [01] fait deux choses — on jette, puis on lit. Le filet dit où la
     première s'arrête, sans avoir à ouvrir un second en-tête pour ça. */
  .split {
    border-top: 1px solid var(--line);
  }

  /* La frise du jet : fond sourd, la fenêtre à l'écoute posée dessus.
     C'est le seul sens qui marche — la fenêtre est d'un seul morceau là où les
     zones mortes sont deux, et surtout `--line` est translucide : posée sur du
     rouge elle donnait du rouge à peine plus sombre, et la frise entière se
     lisait comme une barre pleine. */
  .tl {
    position: relative;
    height: 10px;
    background: var(--line);
  }

  .tl .live {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--accent);
  }

  .tl .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--bg);
  }

  .tl .mark.land {
    width: 2px;
  }

  .tl .head {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 1px;
    background: var(--ink);
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

  .readout dd.big {
    font-size: 15px;
    line-height: 1;
  }

  .force button {
    min-width: 2.1rem;
  }

  /* Le tableau des faces. Six colonnes de largeur égale : un histogramme de six
     entrées dont les barres bougeraient de largeur ne dirait plus rien. */
  .hist {
    --stack: 34px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    align-items: end;
  }

  /* Le trait d'espérance traverse les gouttières : une ligne par colonne
     donnerait vingt tirets alignés qu'on lirait comme vingt marques, et pas
     comme un niveau. Le calage vertical vient de `--stack` — la hauteur de
     colonne est écrite une fois, ici. */
  .hist .exp {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--faint);
    pointer-events: none;
  }

  .hist .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .hist .stack {
    width: 100%;
    height: var(--stack);
    display: flex;
    align-items: flex-end;
    border-bottom: 1px solid var(--line);
  }

  .hist .val {
    width: 100%;
    background: var(--accent);
    min-height: 1px;
  }

  .hist .lab {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--faint);
  }

  .hist .num {
    font-size: 10px;
    color: var(--ink);
  }

  /* Masqué, pas retiré : le zéro garde sa boîte, sinon les colonnes vides
     seraient plus courtes que les autres et la ligne de base de l'histogramme
     monterait et descendrait au fil des jets. */
  .hist .num.zero {
    visibility: hidden;
  }
</style>

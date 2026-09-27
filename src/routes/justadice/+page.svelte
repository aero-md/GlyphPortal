<script lang="ts">
  import {
    DEFAULT_DEVICE,
    emptyFrame,
    frameOf,
    resolveDevice,
    type Device,
    type Frame,
    type LedStyle,
  } from "$lib";
  import type { Dict } from "$lib/i18n";
  import { _, number } from "svelte-i18n";
  import Card from "$lib/ui/Card.svelte";
  import PreviewPane from "$lib/matrix/PreviewPane.svelte";
  import type { PreviewMode } from "$lib/matrix/Preview.svelte";
  import Shell from "$lib/ui/Shell.svelte";
  import Seg from "$lib/ui/Seg.svelte";
  import RenderSeg from "$lib/ui/RenderSeg.svelte";
  import { DIE_ICON } from "./lib/icons";
  import { DiceRenderer } from "./lib/render";
  import {
    DEAD_HEAD,
    DEAD_TAIL,
    REVEAL_OFF,
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

  /* Port compact (4a) Pro — voir `render()` dans `render.ts`. Rien n'y raytrace
     plus le vrai solide en vol : sur treize colonnes, la culbute d'un
     dodécaèdre ou d'un icosaèdre est grossière et illisible, quand celle d'un
     cube reste lisible. On y fait donc toujours tourner un cube générique
     (`DEFAULT_DIE`, celui du d6) quel que soit le dé choisi — `kin()` — et on
     lui fait porter la vraie valeur tirée sur le dé réel plutôt que la
     sienne. Au repos, ni l'un ni l'autre : voir `DIE_ICON`. */
  let device = $state<Device>(resolveDevice());
  /* `DEFAULT_DEVICE` et non `device` : l'initial d'un `$state` ne se lit pas
     hors passe réactive, et `device` ne vaut de toute façon rien d'autre au
     montage — l'`$effect` plus bas reconstruit tout de suite après. */
  let renderer = new DiceRenderer(DEFAULT_DEVICE);
  const compact = $derived(device.id === "phone4apro");

  let mode = $state<PreviewMode>("phone");
  let ledStyle = $state<LedStyle>("sharp");
  let buttonReachable = $state(true);

  /* Gardés en fonctions et non en textes : un message figé dans la langue qui
     avait cours quand il a été posé y resterait après un changement de langue. */
  let noticeFn = $state<(() => string) | null>(null);
  const notice = $derived(noticeFn ? noticeFn() : "");

  let frame = $state<Frame>(emptyFrame(DEFAULT_DEVICE));

  /* --- l'état du dé ---
     Hors du système réactif : la boucle le lit et l'écrit soixante fois par
     seconde. Ce qui doit remonter à l'interface passe par les `$state` plus bas,
     écrits seulement quand ils changent.

     `die` est la seule exception : il change au geste, pas à l'image, et le rack
     comme le sélecteur de la préview doivent le voir. */
  let die = $state<Die>(DEFAULT_DIE);

  /**
   * Le solide qui pilote la cinématique — orientation, jet, caméra.
   *
   * Le vrai dé partout sauf en port compact, où c'est toujours le cube du d6 :
   * voir la note sur `device` plus haut. `die` garde son rôle propre, la plage
   * de valeurs et le libellé affichés au rack, quel que soit `kin()`.
   */
  function kin(): Die {
    return compact ? DEFAULT_DIE : die;
  }

  /** Le dé démarre **posé sur sa plus haute face** — un 6 sur le d6. */
  let rest: Quat = restQuat(DEFAULT_DIE, DEFAULT_DIE.faces, 0);
  let th: Throw | null = null;
  let t0 = 0;
  /** Secondes depuis le jet, `null` quand le dé est posé. */
  let elapsed: number | null = null;
  /** Le résultat de ce jet a-t-il déjà été relevé ? */
  let landed = false;
  /** La vraie valeur en cours de lecture — celle de `die`, pas celle de `kin()`. */
  let trueValue = DEFAULT_DIE.faces;
  /**
   * En port compact, `die` a-t-il déjà été jeté depuis qu'il est sélectionné ?
   *
   * Faux à l'affichage initial et juste après un changement de solide — l'icône
   * de `die` est alors ce qu'il y a à montrer, personne n'a encore rien jeté.
   * Vrai dès la pose d'un jet, et **jusqu'au prochain** — pas juste le temps
   * d'un gros plan : voir la note sur `frame` dans la boucle plus bas.
   */
  let hasResult = false;

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

  /** Le motif du refus, par verdict. Une clé du dictionnaire, pas une phrase. */
  const REJECT: Record<Exclude<Verdict, "ok">, keyof Dict["justadice"]["reject"]> = {
    "too-early": "tooEarly",
    "too-late": "tooLate",
    reading: "reading",
  };

  function roll(force?: number) {
    const v = verdict(elapsed);
    if (v !== "ok") {
      const key = REJECT[v];
      refuse(() => $_(`justadice.reject.${key}`));
      return;
    }
    /* Le jet part de l'orientation **courante** : relancer un dé encore en l'air
       ne le téléporte pas dans sa pose de repos, il repart d'où il en était. */
    const k = kin();
    const from = th && elapsed !== null ? orientationAt(th, elapsed) : rest;
    trueValue = force ?? drawValue(die);
    /* En port compact, le cube tombe sur une valeur à lui — purement
       cosmétique, voir `kin()` — jamais sur `trueValue` : rien ne garantit
       qu'un cube ait seulement une face numérotée `trueValue` si le vrai dé
       en a vingt. */
    th = makeThrow(k, from, compact ? drawValue(k) : trueValue);
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
      refuse(() => $_("justadice.reject.inAir"));
      return;
    }
    if (id === die.id) return;
    die = dieById(id);
    rest = restQuat(kin(), kin().faces, 0);
    hasResult = false;
    const picked = die.id;
    flash(() => `${picked} — ${$_(`justadice.solids.${picked}`)}`);
  }

  /** L'appui long fait défiler les quatre solides, dans l'ordre du sélecteur. */
  function nextDie() {
    pick(DICE[(DICE.findIndex((d) => d.id === die.id) + 1) % DICE.length].id);
  }

  /* Un jet en cours n'a plus de sens au changement d'appareil : il est parti
     avec la géométrie de l'ancien `kin()`, et la culbute d'un dodécaèdre à mi-vol
     ne devient pas celle du cube compact en cours de route. On le coupe net et
     on repose le dé — plus propre qu'un jet qui changerait de solide sous les
     yeux. */
  $effect(() => {
    renderer = new DiceRenderer(device);
    th = null;
    elapsed = null;
    landed = false;
    hasResult = false;
    rest = restQuat(kin(), kin().faces, 0);
    /* Sans quoi la première image tient l'ancien appareil : la boucle plus bas
       ne corrige qu'à la prochaine image demandée, un cran après le montage ou
       la bascule d'appareil. */
    frame = compact
      ? frameOf(device, DIE_ICON[die.id])
      : frameOf(device, renderer.render(kin(), restingView(kin(), rest)).slice());
  });

  $effect(() => {
    let raf = 0;

    const step = () => {
      const now = performance.now() / 1000;
      const k = kin();

      if (th) {
        const t = now - t0;

        /* Le relevé attend la pose, et pas le tirage — qui est connu dès le
           départ. Un jet relancé en vol n'a donc jamais eu lieu : il ne compte
           pas dans le tableau, ce qui est la seule façon honnête de compter des
           dés. `trueValue`, jamais `th.value` : en port compact ce dernier est
           celui, cosmétique, du cube — voir `roll()`. */
        if (t >= T_LAND && !landed) {
          landed = true;
          hasResult = true;
          last[die.id] = trueValue;
          counts[die.id][trueValue - 1] += 1;
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
      const view = th && elapsed !== null ? viewAt(k, th, elapsed) : restingView(k, rest);

      const st = stageAt(elapsed);
      if (st !== stage) stage = st;
      const li = verdict(elapsed) === "ok";
      if (li !== listening) listening = li;
      progress = elapsed === null ? 0 : Math.min(elapsed / T_END, 1);

      /* L'icône du dé plutôt qu'un rendu, tant que `die` n'a rien à montrer :
         voir `DIE_ICON` et la note sur `hasResult`. Un résultat posé y reste
         ensuite — `restingView` en fait un gros plan fixe, pas un aller-retour
         vers l'icône au bout de quelques secondes. */
      const showIcon = compact && !th && !hasResult;

      /* Une fois la caméra arrivée (voir `REVEAL_OFF` dans `dice.ts`), le port
         compact quitte le raytracé pour `renderFlat` — voir sa note dans
         `render.ts`. Le solide générique ne sert plus qu'à la culbute en vol,
         là où rien de tressautant ne se voit puisque rien ne s'y lit encore. */
      const flat = compact && view.cam.z >= REVEAL_OFF;

      /* La marque ne porte `trueValue` qu'une fois la caméra vraiment arrivée
         **pour ce jet-ci**. Juste après en avoir lancé un nouveau, `elapsed`
         redémarre près de 0 mais `v.cam.z` tient encore le gros plan du jet
         précédent le temps du recul — voir `DEAD_HEAD`, « la caméra recule
         encore ». Sans cette garde, `flat` serait vrai dès la première image
         et montrerait le résultat à venir avant même que le dé soit parti. */
      const pastDeadHead = elapsed === null || elapsed >= DEAD_HEAD;

      frame = showIcon
        ? frameOf(device, DIE_ICON[die.id])
        : flat
          ? frameOf(device, renderer.renderFlat(pastDeadHead ? String(trueValue) : null).slice())
          : frameOf(device, renderer.render(k, view).slice());
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  let flashTimer: ReturnType<typeof setTimeout>;
  function flash(msg: (() => string) | null) {
    noticeFn = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => (noticeFn = null), 2200);
  }

  /* Deux canaux et pas un seul, parce qu'ils n'ont pas le même destinataire.
     `notice` confirme au pied de page qu'on a changé de solide — une nouvelle,
     pas une réponse. `reject` dit **dans la carte**, sur la ligne d'état que
     l'œil lit déjà, pourquoi le clic qu'on vient de faire n'a rien produit. Un
     refus annoncé six cents pixels plus bas en corps 10 n'est pas un refus,
     c'est un bouton qui ne marche pas. */
  let rejectFn = $state<(() => string) | null>(null);
  const reject = $derived(rejectFn ? rejectFn() : "");
  let rejectTimer: ReturnType<typeof setTimeout>;
  function refuse(msg: (() => string) | null) {
    rejectFn = msg;
    clearTimeout(rejectTimer);
    if (msg) rejectTimer = setTimeout(() => (rejectFn = null), 2200);
  }

  /* Repliée par défaut, et pour tous les dés. Ouverte, la rangée passe de six à
     vingt boutons selon le solide : la carte changeait de hauteur à chaque
     changement de dé et poussait tout le rack sous les yeux du lecteur. */
  let showForce = $state(false);

  const status = $derived(
    stage === "rest"
      ? $_("justadice.status.rest")
      : stage === "toss"
        ? $_("justadice.status.toss")
        : stage === "tumble"
          ? $_("justadice.status.tumble")
          : stage === "brake"
            ? listening
              ? $_("justadice.status.slowing")
              : $_("justadice.status.settling")
            : $_("justadice.status.closeup"),
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

  /* Les durées de cette page s'écrivent toutes à décimales imposées. Le
     formateur est **lu ici**, dans la dérivation, et non dans la fonction
     rendue : c'est cette lecture qui abonne le composant, et qui refait passer
     les secondes de « 0.45 » à « 0,45 » au changement de langue. */
  const num = $derived.by(() => {
    const fmt = $number;
    return (v: number, digits = 2) =>
      fmt(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  });
</script>

<svelte:head>
  <title>JUST A DICE</title>
  <meta name="description" content={$_("justadice.description")} />
</svelte:head>

<Shell
  title="Just a dice"
  sub={$_("justadice.sub")}
  stamp={VERSION}
  bind:device
  repo="https://github.com/aero-md/justadice"
  {notice}
>
  {#snippet preview()}
    <PreviewPane
      {frame}
      bind:device
      {mode}
      style={ledStyle}
      bind:buttonReachable
      action={$_("justadice.action")}
      onlongpress={nextDie}
    />
  {/snippet}

  {#snippet rack()}
    <!-- [00] parce que c'est ce qui vient avant tout le reste : la page est une
         préview, et le solide est le seul réglage qui change ce qui tourne sur
         le téléphone — les autres cartes ne changent que la façon de le
         regarder ou reprennent son geste. -->
    <Card ref="00" title={$_("common.kind.toy")} stat={device.name}>
      <Seg
        label={$_("justadice.dieSeg")}
        value={die.id}
        options={DICE.map((d) => ({ v: d.id, t: d.id }))}
        onchange={pick}
      />
      <RenderSeg bind:mode bind:style={ledStyle} />
    </Card>

    <!-- Jeter et lire le résultat sont le même geste, et c'était deux cartes
         séparées par une troisième : on secouait, et le chiffre sortait deux
         cartes plus bas, hors de l'écran. Une seule carte, coupée d'un filet :
         au-dessus ce qu'on fait, en dessous ce que ça donne. -->
    <Card
      ref="01"
      title={$_("justadice.throwCard.title")}
      stat={listening ? $_("justadice.throwCard.listening") : $_("justadice.throwCard.locked")}
      cta={stage === "rest"}
    >
      <div class="bar" class:idle={progress === 0} aria-hidden="true">
        <span style="width:{progress * 100}%"></span>
      </div>
      <!-- La ligne d'état porte aussi les refus : c'est la seule ligne de la
           carte que l'œil suit déjà pendant un jet. -->
      <p class="status" class:accent={!!reject}>{reject || status}</p>
      <div class="btns">
        <button type="button" onclick={() => roll()} disabled={!listening}>
          {$_("justadice.throwCard.shake")}
        </button>
        <button
          type="button"
          class:on={showForce}
          aria-pressed={showForce}
          onclick={() => (showForce = !showForce)}>{$_("justadice.throwCard.force")}</button
        >
      </div>
      {#if showForce}
        <div class="btns force">
          {#each die.face.map((f) => f.value).sort((a, b) => a - b) as v (v)}
            <button type="button" onclick={() => roll(v)} disabled={!listening}>{v}</button>
          {/each}
        </div>
        <p class="note">{@html $_("justadice.throwCard.forceNote")}</p>
      {/if}
      <p class="note">{@html $_("justadice.throwCard.deviceNote")}</p>

      <div class="split"></div>

      <dl class="readout">
        <dt>{$_("justadice.throwCard.face")}</dt>
        <dd class="big">{landedCount ? value : "—"}</dd>
        <dt>{$_("justadice.throwCard.landed")}</dt>
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
        {$_("justadice.throwCard.tally")}
        {#if enough}
          {$_("justadice.throwCard.expected", {
            values: { throws: landedCount, each: num(expected, 1) },
          })}
        {/if}
      </p>
    </Card>

    <Card ref="02" title={$_("justadice.timing.title")} stat="{num(T_END)} s">
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
      <p class="note">{@html $_("justadice.timing.note1")}</p>
      <dl class="readout">
        <dt>{$_("justadice.timing.impulse")}</dt>
        <dd>0 → {num(T_TOSS)} s</dd>
        <dt>{$_("justadice.timing.tumble")}</dt>
        <dd>{num(T_TOSS)} → {num(T_BRAKE)} s</dd>
        <dt>{$_("justadice.timing.settle")}</dt>
        <dd>{num(T_BRAKE)} → {num(T_LAND)} s</dd>
        <dt>{$_("justadice.timing.closeup")}</dt>
        <dd>{num(T_LAND)} → {num(T_END)} s</dd>
      </dl>
      <p class="note">{$_("justadice.timing.note2")}</p>
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

<script lang="ts">
  /* La page du pack. Elle n'emprunte pas `Shell` — bâtie autour de deux
     colonnes dont une porte un téléphone — parce que Haloglyph n'a rien à
     afficher dessus : ce n'est pas un toy à jouer, c'est ce qui les embarque
     tous, et sa préview sur le sommaire est déjà une icône fixe et non une
     matrice (voir `+page.svelte` du sommaire). Une seule colonne de cartes,
     comme le rack des autres pages mais sans ce à côté de quoi il défilerait. */
  import LangToggle from "$lib/i18n/LangToggle.svelte";
  import { _ } from "svelte-i18n";
  import ThemeToggle from "$lib/ui/ThemeToggle.svelte";
  import Card from "$lib/ui/Card.svelte";
  import { readDevicePref } from "$lib/matrix/devicePref";
  import { syncBackdrop } from "$lib/ui/deviceBackdrop.svelte";

  /* Pas d'appareil à montrer ici : le fond suit le réglage global. */
  syncBackdrop(readDevicePref);

  const REPO = "https://github.com/aero-md/haloglyph";
  const YEAR = new Date().getFullYear();

  /* Les six toys du pack qui ont une préview sur ce domaine — Slot n'en fait
     pas partie (voir la carte [00]), et Haloglyph lui-même n'a pas de
     matrice à faire tourner. */
  const TOYS = [
    { slug: "glyphlapse", name: "GLYPHLAPSE" },
    { slug: "justadice", name: "JUST A DICE" },
    { slug: "sonoglyph", name: "SONOGLYPH" },
    { slug: "float", name: "FLOAT" },
    { slug: "gforce", name: "G-METER" },
    { slug: "altclock", name: "ALT CLOCK" },
  ] as const;
</script>

<svelte:head>
  <title>HALOGLYPH</title>
  <meta name="description" content={$_("haloglyph.description")} />
</svelte:head>

<span class="reg tl"></span>
<span class="reg tr"></span>
<span class="reg bl"></span>
<span class="reg br"></span>

<div class="page">
  <header>
    <div class="h-row">
      <p class="sub meta">
        <span class="name">Haloglyph</span> • {$_("haloglyph.sub")}
      </p>
      <div class="h-tools">
        <a class="home" href="/">◂ {$_("common.home")}</a>
        <ThemeToggle />
        <LangToggle />
      </div>
    </div>
  </header>

  <main>
    <div class="rack">
      <Card ref="00" title={$_("common.kind.app")} stat={$_("haloglyph.pitch.stat")}>
        <p class="note">{@html $_("haloglyph.pitch.note1")}</p>
        <p class="note">{@html $_("haloglyph.pitch.note2")}</p>
        <div class="btns">
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            {$_("haloglyph.pitch.repo")}
          </a>
        </div>
      </Card>

      <Card ref="01" title={$_("haloglyph.toys.title")} stat={String(TOYS.length)}>
        <p class="note">{$_("haloglyph.toys.note1")}</p>
        <ul class="toylist">
          {#each TOYS as toy (toy.slug)}
            <li>
              <a href="/{toy.slug}/">{toy.name}</a>
              <span>{$_(`haloglyph.toys.${toy.slug}`)}</span>
            </li>
          {/each}
        </ul>
      </Card>

      <Card ref="02" title={$_("haloglyph.widget.title")} stat={$_("haloglyph.widget.stat")}>
        <p class="note">{@html $_("haloglyph.widget.note1")}</p>
        <p class="note">{$_("haloglyph.widget.note2")}</p>
      </Card>

      <Card ref="03" title={$_("haloglyph.build.title")} stat={$_("haloglyph.build.stat")}>
        <p class="note">{$_("haloglyph.build.note1")}</p>
        <pre class="cmd">git clone git@github.com:aero-md/haloglyph.git
cd haloglyph
./gradlew :app:assembleDebug</pre>
        <p class="note">{@html $_("haloglyph.build.note2")}</p>
      </Card>
    </div>
  </main>

  <footer>
    <div class="f-row">
      <a class="sig" href={REPO} target="_blank" rel="noopener noreferrer">© {YEAR} aero-md</a>
    </div>
  </footer>
</div>

<style>
  /* --- page, en-tête, pied ---
     Repris de `Shell` — même repères, même construction de ligne — mais sans
     son corps à deux colonnes ni son défilement épinglé : cette page-ci
     défile en entier, comme le sommaire. */
  .page {
    position: relative;
    z-index: 2;
    max-width: 700px;
    margin: 0 auto;
    padding: 2.5rem 2.4rem 3rem;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  header {
    flex: none;
    border-bottom: 1px solid var(--line);
    padding-bottom: 1rem;
    margin-bottom: 1.6rem;
  }

  .h-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .sub {
    margin: 0;
    min-width: 0;
    line-height: 1;
  }

  .name {
    font-family: var(--serif);
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
    color: var(--ink);
  }

  .h-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .home {
    border: 1px solid var(--line-strong);
    padding: 0.34rem 0.6rem;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dim);
    white-space: nowrap;
    transition:
      color 0.12s,
      border-color 0.12s;
  }

  .home:hover,
  .home:focus-visible {
    color: var(--ink);
    border-color: var(--ink);
    text-decoration: none;
  }

  main {
    flex: 1 1 auto;
  }

  .rack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  footer {
    flex: none;
    margin-top: 1.6rem;
    border-top: 1px solid var(--line);
    padding: 1rem 0 0;
  }

  .f-row {
    display: flex;
    justify-content: flex-end;
  }

  .sig {
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    transition: color 0.12s;
  }

  .sig:hover,
  .sig:focus-visible {
    color: var(--ink);
  }

  /* --- contenu propre à cette page --- */
  /* La liste des toys du pack : nom cliquable vers sa préview, phrase en
     dessous — même registre que `.note`, sans en reprendre la classe pour ne
     pas hériter du `<b>` qui y passe en pleine encre. */
  .toylist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .toylist li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .toylist a {
    font-size: 13px;
    letter-spacing: 0.1em;
    color: var(--ink);
  }

  .toylist span {
    font-size: 13px;
    line-height: 1.5;
    color: var(--dim);
  }

  /* Les trois commandes de construction : un cadre plutôt qu'une note, pour
     qu'on les distingue d'une phrase au premier coup d'œil et qu'on les
     copie sans en attraper la ponctuation qui les entoure. */
  .cmd {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    background: var(--bg-2);
    font-size: 10.5px;
    line-height: 1.6;
    color: var(--ink);
    overflow-x: auto;
  }

  @media (max-width: 720px) {
    .page {
      padding: 1.6rem 1.2rem 2.4rem;
    }
  }
</style>

<script lang="ts">
  /* Le sélecteur de langue, posé à côté de la bascule de thème.

     Deux lettres et rien d'autre : c'est le code ISO de la langue courante, et
     il tient dans le même gabarit que les autres commandes de l'en-tête. Un
     libellé complet — « Langue : Français » — doublerait la largeur d'une
     rangée déjà serrée en colonne unique, pour un réglage qu'on touche une fois.

     Le menu donne l'**endonyme** : « Deutsch », pas « Allemand ». Quelqu'un qui
     arrive sur la mauvaise langue ne peut pas la reconnaître dans une langue
     qu'il ne lit pas. Il est déduit du code ISO par `Intl.DisplayNames` — d'où
     l'absence de table de noms à tenir à jour ici. */
  import { LOCALES, endonym, setLocale } from "$lib/i18n";
  import { _, locale } from "svelte-i18n";

  let open = $state(false);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();

  function pick(code: string) {
    close();
    void setLocale(code);
  }

  /* La fermeture rend le focus au bouton, sans exception. Sans ça, refermer au
     clavier laissait le focus sur une entrée qu'on venait de retirer du DOM,
     donc sur `<body>` : la tabulation suivante repartait du haut de la page. */
  function close() {
    open = false;
    trigger?.focus();
  }

  /* Le menu se referme au clic à côté et à Échap. Les écouteurs ne sont posés
     que tant qu'il est ouvert — un menu fermé n'a rien à écouter.

     Les flèches déplacent le focus d'une entrée à l'autre, en boucle, et
     Origine/Fin sautent aux extrémités : c'est ce qu'attend quelqu'un qui vient
     d'ouvrir une liste au clavier, et ça ne coûte rien à qui utilise la souris.
     La tabulation reste possible en parallèle — les entrées sont de vrais
     boutons, pas des cases d'un widget à un seul point d'entrée. */
  $effect(() => {
    if (!open) return;

    const away = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };

    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      const items = [...(root?.querySelectorAll<HTMLButtonElement>(".menu button") ?? [])];
      if (!items.length) return;
      const here = items.indexOf(document.activeElement as HTMLButtonElement);

      const go = (i: number) => {
        e.preventDefault();
        items[(i + items.length) % items.length].focus();
      };
      if (e.key === "ArrowDown") go(here + 1);
      else if (e.key === "ArrowUp") go(here <= 0 ? items.length - 1 : here - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(items.length - 1);
    };

    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", keys);
    };
  });

  /* La langue en cours prend le focus à l'ouverture : c'est le point de départ
     dont on veut s'éloigner, et ça rend la position lisible au lecteur d'écran
     sans avoir à parcourir la liste. */
  function focusCurrent(list: HTMLElement) {
    (list.querySelector<HTMLButtonElement>("button.on") ?? list.querySelector("button"))?.focus();
  }
</script>

<div class="lang" bind:this={root}>
  <!-- `aria-expanded` et rien d'autre : c'est un bouton qui déplie une liste,
       et c'est exactement ce que dit ce motif-là. `aria-haspopup="true"`
       annonçait un menu au sens ARIA — `role="menu"`, entrées `menuitem`,
       navigation au seul jeu de flèches — que cette liste n'est pas, ce qui
       promettait à un lecteur d'écran un fonctionnement qu'il n'aurait pas
       trouvé. Mieux vaut ne rien promettre que promettre à faux. -->
  <button
    type="button"
    class="code"
    bind:this={trigger}
    aria-expanded={open}
    aria-controls="lang-menu"
    aria-label={$_("common.language")}
    title={$_("common.language")}
    onclick={() => (open = !open)}
  >
    {($locale ?? "").toUpperCase()}
  </button>

  {#if open}
    <ul class="menu" id="lang-menu" use:focusCurrent>
      {#each LOCALES as code (code)}
        <li>
          <button
            type="button"
            class:on={code === $locale}
            aria-current={code === $locale}
            lang={code}
            onclick={() => pick(code)}
          >
            <span class="c">{code.toUpperCase()}</span>
            <span class="n">{endonym(code)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .lang {
    position: relative;
    flex: none;
  }

  /* Même habillage que la bascule de thème et que le lien d'accueil : c'est une
     commande de l'en-tête, elle porte le filet du registre. */
  .code {
    display: block;
    background: transparent;
    border: 1px solid var(--line-strong);
    border-radius: 0;
    padding: 0.34rem 0.6rem;
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--ink);
    transition:
      color 0.12s,
      border-color 0.12s;
  }

  .code:hover,
  .code[aria-expanded="true"] {
    border-color: var(--ink);
  }

  /* Aligné à droite : le sélecteur est en bout de rangée, un menu ouvert vers la
     gauche déborderait de la page sur les fenêtres étroites. */
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    list-style: none;
    margin: 0;
    padding: 0;
    min-width: 100%;
    border: 1px solid var(--line-strong);
    /* opaque : le rack passe dessous et la trame de fond ne doit pas
       transparaître à travers les entrées */
    background: var(--bg);
  }

  .menu button {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0.34rem 0.6rem;
    cursor: pointer;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-align: left;
    color: var(--dim);
    white-space: nowrap;
    transition:
      background 0.12s,
      color 0.12s;
  }

  .menu button:hover {
    background: var(--hover);
    color: var(--ink);
  }

  /* La langue active s'inverse en plein encre, comme l'option retenue d'un
     sélecteur exclusif : l'état se lit à la forme, pas seulement à la couleur. */
  .menu button.on {
    background: var(--ink);
    color: var(--bg);
  }

  .c {
    flex: none;
    width: 2ch;
  }

  /* L'endonyme se lit comme un mot, pas comme une étiquette technique : ni
     capitales forcées ni interlettrage, contrairement au code à sa gauche. */
  .n {
    letter-spacing: normal;
    color: var(--faint);
  }

  .menu button:hover .n {
    color: var(--dim);
  }

  .menu button.on .n {
    color: var(--bg);
  }
</style>

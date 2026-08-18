/**
 * La langue du portail, sur `svelte-i18n`.
 *
 * La bibliothèque porte le gros œuvre : le magasin de la langue courante, le
 * repli, le chargement paresseux, et le formatage ICU des messages à trous.
 * Il ne reste ici que ce qu'elle ne fait pas — brancher le dossier `locales/`,
 * choisir la langue d'arrivée, retenir celle que le visiteur a demandée, et
 * rattraper un dictionnaire qui n'arrive pas.
 *
 * Les textes sont dans `locales/`, **un JSON par langue**, et c'est le seul
 * endroit à toucher pour en ajouter une : la liste ci-dessous est déduite du
 * dossier, et le libellé du sélecteur se déduit du code ISO.
 */
import { browser } from "$app/environment";
import { get } from "svelte/store";
import { init, locale, register, waitLocale } from "svelte-i18n";
import type en from "./locales/en.json";

/**
 * La forme du dictionnaire, déduite de l'anglais.
 *
 * `import type` : TypeScript lit le JSON, le paquet ne l'embarque pas — l'anglais
 * reste chargé à la demande comme les quatre autres. Ce qu'on en tire, ce sont
 * les **noms** des clés et la **forme** des entrées qui ne sont pas une simple
 * chaîne, ce qui suffit à typer les rares endroits où le code range une clé de
 * dictionnaire dans une variable ou relit une entrée structurée.
 *
 * Ce que ce type ne vérifie pas — qu'une clé écrite au rendu existe, que les
 * quatre autres langues sont complètes — l'est par `scripts/check-locales.ts`,
 * qui tourne dans `bun run check`.
 */
export type Dict = typeof en;

/**
 * Une langue servie = un fichier dans `locales/`. Rien d'autre à déclarer.
 *
 * `import.meta.glob` sans `eager` rend un objet de fonctions d'import : Vite en
 * fait un module par langue, et le visiteur ne télécharge que la sienne. Les
 * cinq dictionnaires empilés feraient une cinquantaine de kilo-octets qu'aucun
 * visiteur ne lit à plus d'un cinquième.
 */
const loaders = import.meta.glob<Record<string, unknown>>("./locales/*.json");

const PREFIX = "./locales/";
const SUFFIX = ".json";

/** Codes ISO 639-1 des langues servies, dans l'ordre alphabétique du dossier. */
export const LOCALES = Object.keys(loaders)
  .map((path) => path.slice(PREFIX.length, -SUFFIX.length))
  .sort();

/**
 * La langue de repli.
 *
 * L'anglais et non le français, alors que le site a été écrit en français :
 * c'est ce que comprend le plus grand nombre de ceux dont la langue n'est pas
 * servie, et un visiteur japonais ou polonais tombe forcément dessus.
 */
export const FALLBACK = "en";

/** Même préfixe que `glyph:theme` : c'est le même site, une seule clé de réglages. */
export const LANG_KEY = "glyph:lang";

/**
 * Branche un dictionnaire, en le remettant dans la file s'il n'arrive pas.
 *
 * Le `.default` est déplié ici plutôt que laissé à la bibliothèque : un module
 * JSON passé par Vite arrive en espace de noms, pas en objet nu.
 *
 * Le rattrapage sur échec n'est pas de la ceinture-bretelles. `svelte-i18n`
 * retire le chargeur de sa file **avant** de l'appeler : si le module ne se
 * télécharge pas — réseau qui tombe, déploiement en cours qui a fait tourner
 * les empreintes des fichiers — la langue reste définitivement vide pour
 * l'onglet, et le prochain essai bascule dessus sans même retenter le
 * téléchargement, affichant les clés brutes. Remis dans la file, un échec
 * redevient une erreur rattrapable et le prochain essai retélécharge.
 */
function mount(code: string, load: () => Promise<unknown>): void {
  register(code, () =>
    load().catch((err) => {
      mount(code, load);
      throw err;
    }),
  );
}

for (const path of Object.keys(loaders)) {
  mount(path.slice(PREFIX.length, -SUFFIX.length), () =>
    loaders[path]().then((mod) => (mod as { default?: unknown }).default ?? mod),
  );
}

/**
 * La langue à servir, par ordre de priorité : celle qu'on a choisie ici, sinon
 * celle du navigateur, sinon l'anglais.
 *
 * `navigator.languages` et pas seulement `navigator.language` : un visiteur
 * peut avoir `pt-BR` en tête et `es` juste derrière, auquel cas l'espagnol le
 * sert mieux que l'anglais. On ne compare que les deux premières lettres — les
 * variantes régionales (`de-AT`, `es-419`) tombent sur la même traduction.
 *
 * `getLocaleFromNavigator` de la bibliothèque ne ferait que la deuxième moitié :
 * elle rend la balise complète du navigateur, sans la confronter aux langues
 * qu'on sert ni au réglage déjà enregistré.
 */
export function detect(): string {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && LOCALES.includes(saved)) return saved;
  } catch {
    // navigation privée verrouillée : on repart de la langue du navigateur
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const two = tag.slice(0, 2).toLowerCase();
    if (LOCALES.includes(two)) return two;
  }
  return FALLBACK;
}

/* `initialLocale` n'est détecté que dans le navigateur : le pré-rendu exécute
   ce module dans Node, où `localStorage` n'existe pas et où `navigator` existe
   sans porter les langues de qui que ce soit. Rien n'y est rendu de toute
   façon, `ssr` étant faux.

   L'attribut `lang` de `<html>` n'est pas posé ici : la bibliothèque le tient
   déjà à jour, dans son propre abonnement au magasin de la langue. */
init({
  fallbackLocale: FALLBACK,
  initialLocale: browser ? detect() : FALLBACK,
});

/**
 * Pose une langue **et la retient**, si elle est arrivée.
 *
 * L'enregistrement n'a lieu qu'ici, jamais à l'amorçage : tant que le visiteur
 * n'a pas touché au sélecteur, il n'a rien choisi, et écrire la langue détectée
 * en réglage figerait le site sur la langue du navigateur du jour.
 *
 * L'attente n'est pas décorative non plus. `locale.set` rend une promesse qui
 * **rejette** si le dictionnaire ne se télécharge pas ; sans elle, un échec
 * laissait l'interface dans l'ancienne langue tout en enregistrant la nouvelle,
 * et le rechargement suivant repartait sur une langue qu'on savait injoignable.
 * Ici, ce qui n'a pas pu s'afficher ne s'enregistre pas.
 */
export async function setLocale(next: string): Promise<void> {
  const target = LOCALES.includes(next) ? next : FALLBACK;
  try {
    await locale.set(target);
  } catch {
    // le dictionnaire n'est pas arrivé : la langue affichée ne bouge pas, et
    // rien n'est retenu — le prochain clic retentera le téléchargement
    return;
  }
  try {
    localStorage.setItem(LANG_KEY, target);
  } catch {
    // le changement marche, il ne survit pas à la fermeture de l'onglet
  }
}

/**
 * Attend le dictionnaire de la langue courante. Appelé par le `load` racine.
 *
 * Le rejet est rattrapé ici et pas plus haut : une promesse rejetée dans un
 * `load` de SvelteKit rend une page d'erreur pleine page. Un dictionnaire
 * manquant n'est pas une page cassée — on retombe sur l'anglais, et si lui non
 * plus n'arrive pas, sur les clés brutes. Les deux se lisent mieux qu'un 500.
 */
export async function loadLocale(): Promise<void> {
  try {
    await waitLocale();
  } catch {
    if (get(locale) === FALLBACK) return;
    try {
      await locale.set(FALLBACK);
    } catch {
      // même l'anglais est injoignable : la page s'affiche telle quelle
    }
  }
}

/* --- nom d'une langue, dans cette langue --- */
/* Le sélecteur affiche « DE — Deutsch », pas « DE — Allemand » : on choisit sa
   langue dans sa langue, sinon il faut déjà comprendre celle affichée pour en
   sortir. `Intl.DisplayNames` rend l'endonyme sans qu'on ait à tenir une table
   — c'est ce qui fait qu'ajouter une langue ne demande qu'un fichier. */
const endonyms = new Map<string, string>();

export function endonym(code: string): string {
  const cached = endonyms.get(code);
  if (cached) return cached;
  let name = code.toUpperCase();
  try {
    name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? name;
    // certaines langues rendent l'endonyme en bas de casse — « français »
    name = name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // moteur sans Intl.DisplayNames : le code ISO fait un libellé acceptable
  }
  endonyms.set(code, name);
  return name;
}

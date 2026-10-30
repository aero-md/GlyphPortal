/**
 * Le catalogue du portail.
 *
 * `ready` dit si la préview est servie ici. Tant qu'elle ne l'est pas, la tuile
 * reste dans le sommaire mais renvoie au dépôt : une entrée absente laisse
 * croire que le toy n'existe pas, une entrée qui pointe sur un 404 est pire.
 *
 * L'ordre est celui de la grille, et il est délibéré : les toys embarqués d'abord,
 * l'outil web en dernier. Ce sont les toys qu'on vient voir, et l'outil sert à en
 * fabriquer les images.
 */

/**
 * Ce qu'une entrée **est**, par opposition à ce qu'elle fait.
 *
 * Deux natures, et la différence est réelle : un `toy` est un APK Android qui
 * s'installe sur le téléphone et dont cette page n'est qu'une reproduction ;
 * un `tool` tourne dans le navigateur et n'existe nulle part ailleurs. Ça
 * décide du dépôt, de la présence d'un bouton de téléchargement, et de ce
 * qu'un visiteur peut espérer en faire.
 */
/*
 * `app` s'est ajouté pour Haloglyph : ni un toy unique — c'est un pack qui en
 * embarque plusieurs — ni un outil web comme GlyphCast, qui n'existe que dans
 * cet onglet. Le libellé de tranche, sous `common.kind.app`, dit « Application
 * Android » plutôt que de forcer l'un des deux mots existants.
 */
export type Kind = "toy" | "tool" | "app";

/*
 * Le libellé de la tranche — « Glyph toy », « Outil web » — vivait ici, dans
 * une table `KIND_LABEL`. Il est parti dans les dictionnaires de langue, sous
 * `common.kind` : c'est du texte affiché, pas une donnée du catalogue. Même
 * chose pour la ligne de chaque entrée, voir `slug` ci-dessous.
 */

/**
 * Les entrées du catalogue, par leur segment d'URL.
 *
 * Le type est fermé et non `string` : c'est lui qui indexe `home.lines` dans
 * les dictionnaires, et un slug ajouté ici sans sa ligne traduite ne compile
 * plus. C'est exactement le rappel qu'on veut au moment où on ajoute un toy.
 */
export type Slug =
  | "glyphslot"
  | "glyphlapse"
  | "sonoglyph"
  | "justadice"
  | "glyphcast"
  | "haloglyph"
  | "gforce"
  | "float"
  | "altclock";

export type Toy = {
  /** Segment d'URL sous glyph.suns.red, et nom du dossier au déploiement. */
  slug: Slug;
  /** Nom affiché, en capitales — c'est un wordmark, pas une phrase. */
  name: string;
  /** Nature de l'entrée, portée par la tranche verticale de la tuile. */
  kind: Kind;
  /* Ce que fait l'entrée, en une ligne, est dans `home.lines[slug]` des
     dictionnaires — **ce qu'elle fait, pas ce qu'elle est** : la catégorie est
     sur la tranche, la répéter dépenserait le premier tiers de la phrase à
     redire ce qui est déjà écrit sur le flanc. */
  /** Dépôt GitHub. */
  repo: string;
  /** La préview est-elle servie sur ce domaine ? */
  ready: boolean;
  /**
   * Boucles exportées du toy, servies depuis `public/preview/`, une par
   * appareil qu'il sait dessiner.
   *
   * Deux formats sont lus, reconnus à la forme du fichier et non à son
   * extension :
   *
   * - le **dessin Glyph Museum** — `{ v, frames: [{ p, d }] }`, des consignes de
   *   LED, donc exactement ce que reçoit l'appareil. C'est celui à préférer :
   *   quelques kilo-octets, aucune dépendance pour le lire, et il porte le
   *   compte exact de LEDs de sa matrice, donc il ne peut pas se désaccorder de
   *   la grille. Voir `design.ts` dans le kit.
   * - le **Lottie**, hérité des premiers exports. Ce ne sont pas des animations
   *   vectorielles libres mais les matrices elles-mêmes, une LED par rectangle —
   *   voir `lottieFrame.ts`, qui les rééchantillonne dans la grille de l'appareil
   *   au lieu de les jouer. Il pèse quelques centaines de kilo-octets et tire
   *   `lottie-web` avec lui.
   *
   * Absente, la tuile garde son disque éteint. C'est un état tenable et non un
   * manque à combler dans l'urgence : un toy dont la boucle n'est pas encore
   * exportée occupe la même place et la même hauteur que les autres, et la
   * grille ne bougera pas le jour où elle arrive.
   *
   * `phone3` est la seule clé garantie : c'est la matrice d'origine, celle que
   * tous les toys prêts savent encore dessiner. `phone4apro` absente, la tuile
   * garde la boucle du (3) quel que soit le réglage d'appareil du visiteur, et
   * le sommaire ajoute la mention « Exclusif au Phone (3) » à sa ligne — voir
   * `+page.svelte`. La grille de chaque boucle se déduit du fichier lui-même
   * (voir `deviceForDesign`), il n'y a donc rien de plus à déclarer ici.
   */
  preview?: { phone3: string; phone4apro?: string };
};

export const TOYS: Toy[] = [
  {
    slug: "haloglyph",
    name: "HALOGLYPH",
    kind: "app",
    repo: "https://github.com/aero-md/haloglyph",
    /* `/haloglyph/+page.svelte` existe déjà (pack, six toys, hublot) mais
       reste débranchée pour l'instant — la tuile revient au dépôt en
       attendant. Repasser `ready` à `true` suffira à la rebrancher. */
    ready: false,
  },
  {
    slug: "glyphlapse",
    name: "GLYPHLAPSE",
    kind: "toy",
    repo: "https://github.com/aero-md/glyphlapse",
    ready: true,
    /* Les trois lapses par défaut, dix secondes chacun, avec le glissement de
       l'appui long entre eux. Générée depuis `defaultLapses` : c'est la même
       liste que celle sur laquelle la préview interactive ouvre.

       Les nombres sont ceux du jour de génération et ne bougeront plus — une
       vignette de sommaire montre à quoi ressemble le toy, elle ne donne pas
       l'heure. C'est la préview qui compte juste. */
    preview: { phone3: "/preview/glyphlapse.json", phone4apro: "/preview/glyphlapse4apro.json" },
  },
  {
    slug: "sonoglyph",
    name: "SONOGLYPH",
    kind: "toy",
    repo: "https://github.com/aero-md/sonoglyph",
    ready: true,
    /* Quatre secondes de VU-mètre puis quatre de spectre, sur une seule prise
       de son : le toy a deux affichages et l'appui long bascule de l'un à
       l'autre, une vignette qui n'en montrerait qu'un mentirait par omission. */
    preview: { phone3: "/preview/sonoglyph.json", phone4apro: "/preview/sonoglyph4apro.json" },
  },
  {
    slug: "justadice",
    name: "JUST A DICE",
    kind: "toy",
    /* Son dépôt à lui depuis que l'APK existe. Il a longtemps pointé sur celui du
       portail, faute d'avoir autre chose derrière lui qu'une préview — et c'est ce
       qui le faisait figurer en queue de grille. */
    repo: "https://github.com/aero-md/justadice",
    ready: true,
    /* Le (3) : trois solides et trois jets — d6, d12, d20 — qui couvrent les
       **trois façons dont le toy écrit un résultat** : des pips, un chiffre
       dilaté, deux chiffres en petite police. Chaque solide entre sur sa plus
       haute face, comme le fait l'appui long, et aucun jet ne retombe sur ce
       nombre-là : un dé qui montre 20, culbute trois secondes et remontre 20 se
       lirait comme une animation qui n'a rien fait.

       Le (4a) Pro tourne le cube générique du port compact — voir `compact`
       dans `render.ts` — quel que soit le solide affiché sur l'icône de
       repos : la culbute y est donc **la même** d'un dé à l'autre, seul le
       chiffre du gros plan change. Générées en rejouant le moteur, voir
       `scripts/`. */
    preview: { phone3: "/preview/justadice.json", phone4apro: "/preview/justadice4apro.json" },
  },
  {
    slug: "float",
    name: "FLOAT",
    kind: "toy",
    /* Écrit dans Haloglyph, pas migré : pas de dépôt à lui, il vit dans le
       monorepo du pack — voir `haloglyph`, en tête du catalogue. */
    repo: "https://github.com/aero-md/haloglyph",
    ready: true,
    preview: { phone3: "/preview/float.json", phone4apro: "/preview/float4apro.json" },
  },
  {
    slug: "gforce",
    name: "G-METER",
    kind: "toy",
    repo: "https://github.com/aero-md/haloglyph",
    ready: true,
    preview: { phone3: "/preview/gforce.json", phone4apro: "/preview/gforce4apro.json" },
  },
  {
    slug: "altclock",
    name: "ALT CLOCK",
    kind: "toy",
    /* Écrit dans Haloglyph, comme Float et G-Meter : pas de dépôt à lui. */
    repo: "https://github.com/aero-md/haloglyph",
    ready: true,
    /* Les trois styles, trois secondes chacun, sur la même heure. Le (3)
       seulement : le (4a) Pro a sa propre horloge d'origine, et le toy n'y a
       aucun intérêt — d'où la mention « Exclusif au Phone (3) » du sommaire. */
    preview: { phone3: "/preview/altclock.json" },
  },
  {
    slug: "glyphslot",
    name: "GLYPHSLOT",
    kind: "toy",
    repo: "https://github.com/aero-md/glyphslot",
    ready: true,
    preview: { phone3: "/preview/glyphslot.json" },
  },
  {
    slug: "glyphcast",
    name: "GLYPHCAST",
    kind: "tool",
    /* Le dépôt du portail, et non un dépôt à lui : GlyphCast est un outil web,
       pas un toy embarqué, et son code vit dans celui-ci — c'est d'ailleurs ce
       dépôt-là qui s'appelait `glyphcast` avant de prendre tout le domaine. Les
       quatre autres entrées pointent bien sur des dépôts distincts, ceux des
       APK Android. */
    repo: "https://github.com/aero-md/GlyphPortal",
    ready: true,
    /* Deux dessins fixes sortis de GlyphCast lui-même, la même image projetée
       sur les deux matrices — 489 LEDs sur le (3), 137 sur le (4a) Pro. Suit
       le réglage d'appareil du visiteur comme les autres tuiles depuis que le
       sommaire porte le sélecteur (changement structurel, 2026-09-20) — avant,
       elle en tirait une au sort faute d'un réglage global à suivre. */
    preview: { phone3: "/preview/squirtle.json", phone4apro: "/preview/squirtle4apro.json" },
  },
];

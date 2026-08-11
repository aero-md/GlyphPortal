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
export type Kind = "toy" | "tool";

/**
 * Le libellé porté par la tranche de la tuile.
 *
 * Une table plutôt qu'une chaîne libre par entrée : la catégorie vivait avant
 * dans le sous-titre, écrite à la main, et elle avait déjà dérivé — `(Glyph
 * toy)` sur deux entrées, `[Glyph toy pour Nothing Phone (3)]` sur une
 * troisième. Quatre entrées suffisent à faire diverger un texte recopié.
 */
export const KIND_LABEL: Record<Kind, string> = {
  toy: "Glyph toy",
  tool: "Outil web",
};

export type Toy = {
  /** Segment d'URL sous glyph.suns.red, et nom du dossier au déploiement. */
  slug: string;
  /** Nom affiché, en capitales — c'est un wordmark, pas une phrase. */
  name: string;
  /** Nature de l'entrée, portée par la tranche verticale de la tuile. */
  kind: Kind;
  /**
   * Ce que fait l'entrée, en une ligne. Sous-titre de la tuile.
   *
   * **Ce qu'elle fait, pas ce qu'elle est** : la catégorie est sur la tranche,
   * la répéter ici dépenserait le premier tiers de la phrase à redire ce qui
   * est déjà écrit sur le flanc.
   */
  line: string;
  /** Dépôt GitHub. */
  repo: string;
  /** La préview est-elle servie sur ce domaine ? */
  ready: boolean;
  /**
   * Boucle exportée du toy, servie depuis `public/preview/`.
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
   * **Plusieurs boucles : la tuile en tire une au sort à l'ouverture de la
   * page**, à chances égales, et la garde pour toute sa durée de vie. C'est ce
   * qui laisse GlyphCast montrer tantôt un rendu de Phone (3), tantôt un de
   * (4a) Pro — un outil qui convertit vers les deux matrices ne devrait pas
   * n'en montrer qu'une. La grille de la mini-prévisu se déduit du fichier lui-
   * même (voir `deviceForDesign`), il n'y a donc rien à déclarer ici : c'est la
   * longueur des trames qui dit l'appareil.
   */
  preview?: string | string[];
};

export const TOYS: Toy[] = [
  {
    slug: "glyphslot",
    name: "GLYPHSLOT",
    kind: "toy",
    line: "Une machine à sous pixélisée",
    repo: "https://github.com/aero-md/glyphslot",
    ready: true,
    preview: "/preview/glyphslot.json",
  },
  {
    slug: "glyphlapse",
    name: "GLYPHLAPSE",
    kind: "toy",
    line: "Une visualisation du temps qui passe",
    repo: "https://github.com/aero-md/glyphlapse",
    ready: true,
    /* Les trois lapses par défaut, dix secondes chacun, avec le glissement de
       l'appui long entre eux. Générée depuis `defaultLapses` : c'est la même
       liste que celle sur laquelle la préview interactive ouvre.

       Les nombres sont ceux du jour de génération et ne bougeront plus — une
       vignette de sommaire montre à quoi ressemble le toy, elle ne donne pas
       l'heure. C'est la préview qui compte juste. */
    preview: "/preview/glyphlapse.json",
  },
  {
    slug: "sonoglyph",
    name: "SONOGLYPH",
    kind: "toy",
    line: "Le son du micro, mesuré et représenté avec une poignée de pixels",
    repo: "https://github.com/aero-md/sonoglyph",
    ready: true,
    /* Quatre secondes de VU-mètre puis quatre de spectre, sur une seule prise
       de son : le toy a deux affichages et l'appui long bascule de l'un à
       l'autre, une vignette qui n'en montrerait qu'un mentirait par omission. */
    preview: "/preview/sonoglyph.json",
  },
  {
    slug: "justadice",
    name: "JUST A DICE",
    kind: "toy",
    line: "Un dé, jeté d'une secousse",
    /* Son dépôt à lui depuis que l'APK existe. Il a longtemps pointé sur celui du
       portail, faute d'avoir autre chose derrière lui qu'une préview — et c'est ce
       qui le faisait figurer en queue de grille. */
    repo: "https://github.com/aero-md/justadice",
    ready: true,
    /* Trois solides et trois jets — d6, d12, d20 — qui couvrent les **trois façons
       dont le toy écrit un résultat** : des pips, un chiffre dilaté, deux chiffres
       en petite police. Chaque solide entre sur sa plus haute face, comme le fait
       l'appui long, et aucun jet ne retombe sur ce nombre-là : un dé qui montre 20,
       culbute trois secondes et remontre 20 se lirait comme une animation qui n'a
       rien fait. Générée en rejouant le moteur, voir `scripts/`. */
    preview: "/preview/justadice.json",
  },
  {
    slug: "glyphcast",
    name: "GLYPHCAST",
    kind: "tool",
    /* « Outil de convertion d'une image… » avant — dont un `convertion` sans
       s. La tranche dit déjà « Outil web », donc la phrase repart du verbe. */
    line: "Convertit une image en rendu Glyph Matrix",
    /* Le dépôt du portail, et non un dépôt à lui : GlyphCast est un outil web,
       pas un toy embarqué, et son code vit dans celui-ci — c'est d'ailleurs ce
       dépôt-là qui s'appelait `glyphcast` avant de prendre tout le domaine. Les
       quatre autres entrées pointent bien sur des dépôts distincts, ceux des
       APK Android. */
    repo: "https://github.com/aero-md/GlyphPortal",
    ready: true,
    /* Deux dessins fixes sortis de GlyphCast lui-même, la même image projetée
       sur les deux matrices — 489 LEDs sur le (3), 137 sur le (4a) Pro. La
       tuile en tire un au sort : c'est le seul endroit du sommaire où la
       différence entre les deux appareils se voit, et elle est le sujet de cet
       outil-là. */
    preview: ["/preview/squirtle.json", "/preview/squirtle4apro.json"],
  },
];

# glyph-portal

Le code de **[glyph.suns.red](https://glyph.suns.red)** : un sommaire et les
préviews web des Glyph Toys pour Nothing Phone.

Une préview reproduit un toy dans le navigateur, **posé sur une photo du dos de
l'appareil** — la Glyph Matrix est rendue à sa position et à son échelle
réelles. Tout tourne en local : aucune image, aucun son, aucune donnée ne sort
du navigateur.

## Pourquoi un dépôt unique

Les préviews ont d'abord été écrites séparément, une par dépôt de toy, chacune
avec sa techno : une app Svelte pour glyphcast, une autre pour sonoglyph, un
fichier HTML monolithique pour glyphlapse, un composant React transpilé par
Babel dans le navigateur pour glyphslot.

Elles partageaient pourtant l'essentiel — la même photo, la même géométrie, la
même mise en page — **en trois copies divergentes**. Le calage du hublot en est
la démonstration : glyphlapse et glyphslot le plaçaient à 79,53 % / 15,36 % pour
un diamètre de 26,04 %, valeurs relevées à l'œil ; glyphcast à 79,688 % /
15,433 % pour 26,49 %, mesurées dans les pixels de la photo. Trois copies, dont
deux fausses, et rien pour le signaler.

Ici il n'y en a qu'une, dans `src/lib`.

## Une seule app, pas cinq

Le rapprochement s'est d'abord fait en monorepo : cinq apps Vite dans `apps/`,
un paquet partagé dans `packages/`, liés par les workspaces de Bun. C'était le
chemin qui touchait le moins de code à chaque étape du portage, pas un choix de
structure — et il se payait cher. Cinq `vite.config.ts`, quinze `tsconfig`, cinq
`index.html`, un `base: "/<slug>/"` par app à tenir en accord avec son dossier
de déploiement, et un lanceur maison de 67 lignes montant cinq serveurs de dev
derrière un sixième qui les proxyfiait. Du routage réimplémenté à la main, en
moins bien : chaque saut d'une préview à l'autre était un rechargement complet.

Le dossier d'une route **est** son URL, il n'y a plus rien à tenir en accord. Le
découpage du JS par route vient du bundler, et la navigation entre les toys ne
recharge plus la page.

## Arborescence

```
src/lib/             le noyau, sous l'alias $lib
  matrix/            géométrie, calibrage, rendu au pixel, Grid, polices,
                     Preview, PreviewPane, ToyPreview, design & lottie
  ui/                Shell, Card, Seg, Slider, ThemeToggle, thème
  app.css            jetons de thème, trame de fond, étages typographiques

src/routes/
  +layout.svelte     la feuille de style, montée une fois
  +layout.ts         pré-rendu, pas de SSR, barre finale imposée
  +page.svelte       le sommaire, servi à la racine du domaine
  toys.ts            le catalogue : une entrée par tuile
  glyphcast/         /glyphcast/   — image → Glyph Matrix
  sonoglyph/         /sonoglyph/   — spectre et VU-mètre, au micro
  glyphlapse/        /glyphlapse/  — le temps qui passe, décomposé
  glyphslot/         /glyphslot/   — machine à sous

src/app.html         le `<head>` commun : polices, favicon, script de thème
static/              favicon, worklet du micro, boucles des vignettes
scripts/             fabrication de la boucle de mini-prévisu de GlyphSlot
deploy.ps1           check + build + un seul tarball vers le Pi
deploy/              le bloc Caddy correspondant
```

Le moteur d'un toy vit dans `lib/` **sous sa route** et non dans `src/lib` : il
ne sert qu'à elle. Ce qui monte dans `$lib` est ce que plusieurs préviews
partagent, et c'est la seule chose qui justifie qu'un noyau existe.

## Le contrat d'un toy

Un toy n'a qu'une chose à produire : une `Frame`.

```ts
type Frame = {
  device: Device;        // l'appareil, donc la grille et le masque
  values: Float32Array;  // luminosité 0..1 par cellule, row-major
  lit: number;           // LEDs allumées
  mean: number;          // luminosité moyenne des LEDs allumées
};
```

Le reste — calage sur la photo, arrondi de la cellule au pixel physique, taille
de LED par appareil, rendu, coquille de page — ne le regarde pas.

Pour l'**écrire**, cette trame, le kit fournit `Grid` (une surface en
luminosités, composition en maximum, masque du disque appliqué à l'écriture),
`discMap` (anneau trié par angle, contour, rayon disponible par direction) et
deux polices bitmap. Tout est dérivé d'une `Geometry` : un toy écrit pour la
matrice du (3) tourne tel quel sur celle du (4a) Pro, à lui de décider si le
résultat reste lisible.

Une route se réduit donc à son moteur, ses réglages, et deux composants :

```svelte
<Shell title="…" sub="…" {device} repo="…">
  {#snippet preview()}
    <PreviewPane {frame} bind:device bind:mode bind:style />
  {/snippet}
  {#snippet rack()}
    <Card ref="01" title="…">…</Card>
  {/snippet}
</Shell>
```

`device` sert au pied de page, qui écrit de lui-même les caractéristiques de la
matrice affichée — taille, plage de valeurs, rayon du masque, compte de LEDs —
et suit donc le sélecteur d'appareil.

## Développement

```powershell
bun install
bun run dev     # http://localhost:5180
bun run check   # svelte-kit sync + svelte-check
```

Le `<head>` est commun aux cinq pages (`src/app.html`) ; chaque route y ajoute
son titre et sa description par un `<svelte:head>`. Le thème est posé sur
`<html>` par un script inline **avant le premier paint** — un effet s'exécute
après, et un visiteur en sombre prendrait un flash clair à chaque chargement.
Ces lignes sont la copie de `THEME_BOOT` dans `$lib/ui/theme.ts`, un `<head>` ne
pouvant pas importer de TypeScript ; il n'en existe qu'une, contre cinq du temps
des `index.html` séparés.

Le site est **pré-rendu sans SSR**, et les deux moitiés de cette phrase comptent.
Le pré-rendu écrit les cinq pages au build : il n'y a pas de serveur Node
derrière, seulement Caddy et des fichiers. Le SSR est coupé parce que les quatre
préviews sont du canvas — leur contenu n'existe qu'une fois la boucle
d'affichage lancée — et parce que la bascule de thème lit le DOM à son
initialisation. Le HTML livré est donc la coquille que servaient déjà les cinq
builds Vite.

Les URL gardent leur **barre finale** (`trailingSlash` dans `+layout.ts`) : le
pré-rendu écrit `glyphcast/index.html` et non `glyphcast.html`, ce qui garde
valables les adresses de la version précédente.

## Déploiement

```powershell
.\deploy.ps1              # check + build + tarball + extraction sur le Pi
.\deploy.ps1 -SkipBuild   # envoie build/ tel quel
```

La cible est `/srv/glyph` sur le Raspberry Pi, servie par Caddy derrière un
tunnel Cloudflare. **La racine du domaine a changé de contenu** : elle servait
GlyphCast, elle sert maintenant le sommaire, et GlyphCast a déménagé sous
`/glyphcast/`. Le bloc Caddy est à remplacer en même temps — voir
[`deploy/Caddyfile.snippet`](deploy/Caddyfile.snippet). Il a changé une seconde
fois depuis : les assets hachés sont sous `/_app/immutable/` et non plus sous
`/assets/`, donc un bloc laissé tel quel annule le cache long sur tout le site.

## Ajouter une préview

1. `src/routes/<slug>/+page.svelte`, sur le modèle de `src/routes/glyphcast`.
   Le moteur du toy dans `src/routes/<slug>/lib/`.
2. Il produit une `Frame` ; `Shell` et `PreviewPane` font le reste.
3. L'entrée dans `src/routes/toys.ts`, `ready: true`.
4. Le slug dans `$Routes` de `deploy.ps1`.

Le point 4 n'est pas de la paperasse : le pré-rendu est silencieux quand une
page n'est pas atteignable, elle sort simplement du build. `$Routes` est ce qui
fait échouer le deploy avant l'envoi plutôt qu'en ligne.

## Licence

MIT — voir [LICENSE](LICENSE).

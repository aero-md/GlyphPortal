# GlyphPortal

Le code de **[glyph.suns.red](https://glyph.suns.red)** : le regroupement de mes
créations autour de la Glyph Matrix — les toys embarqués sur Nothing Phone, et
les outils web qui servent à en fabriquer le contenu.

Chacune a sa page ici. Un toy y est **rejoué dans le navigateur, posé sur une
photo du dos de l'appareil** — la Glyph Matrix est rendue à sa position et à son
échelle réelles, l'APK se télécharge à côté. Un outil, lui, n'existe nulle part
ailleurs que sur cette page. Tout tourne en local : aucune image, aucun son,
aucune donnée ne sort du navigateur.

## Arborescence

```
src/lib/             le noyau, sous l'alias $lib
  matrix/            géométrie, calibrage, rendu au pixel, Grid, polices,
                     Preview, PreviewPane, ToyPreview, design & lottie
  ui/                Shell, Card, Seg, Slider, ThemeToggle, thème
  i18n/              les cinq langues, un JSON chacune, et le sélecteur
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
scripts/             boucles de mini-prévisu, contrôle des dictionnaires
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
bun run check   # svelte-kit sync + svelte-check + dictionnaires
```

Le `<head>` est commun aux cinq pages (`src/app.html`) ; chaque route y ajoute
son titre et sa description par un `<svelte:head>`. Le thème est posé sur
`<html>` par un script inline **avant le premier paint** — un effet s'exécute
après, et un visiteur en sombre prendrait un flash clair à chaque chargement.
Ces lignes sont la copie de `THEME_BOOT` dans `$lib/ui/theme.ts`, un `<head>` ne
pouvant pas importer de TypeScript.

Le site est **pré-rendu sans SSR**, et les deux moitiés de cette phrase comptent.
Le pré-rendu écrit les cinq pages au build : il n'y a pas de serveur Node
derrière, seulement des fichiers. Le SSR est coupé parce que les quatre préviews
sont du canvas — leur contenu n'existe qu'une fois la boucle d'affichage lancée
— et parce que la bascule de thème lit le DOM à son initialisation.

Les URL gardent leur **barre finale** (`trailingSlash` dans `+layout.ts`) : le
pré-rendu écrit `glyphcast/index.html` et non `glyphcast.html`.

## Déploiement

```powershell
bun run build   # sort build/, prêt à servir tel quel
```

Le site est un paquet de fichiers statiques : le sommaire à la racine, une route
par sous-dossier, les assets hachés sous `/_app/immutable/`. N'importe quel
serveur de fichiers convient, à deux conditions — servir l'`index.html` d'un
dossier pour une URL à barre finale, et ne pas mettre les HTML en cache long,
puisqu'ils portent les références vers des assets dont le nom change à chaque
build.

[`deploy.example.ps1`](deploy.example.ps1) pousse `build/` sur un serveur par
SSH. **C'est un exemple avec deux valeurs à renseigner** — l'hôte et le chemin
servi, en tête de fichier :

```powershell
[string]$RemoteHost = "utilisateur@machine",
[string]$RemotePath = "/chemin/vers/la/racine/servie",
```

Une fois ces deux lignes remplies, le script marche tel quel : copier en
`deploy.ps1`, qui est ignoré par git. Le reste — vérifications, build,
compression, envoi, extraction — n'a rien à personnaliser.

Il est gardé hors du dépôt parce qu'une fois rempli il ne décrit plus le site
mais l'endroit où il est posé, et ça ne regarde pas le code.

## Les langues

Cinq langues — anglais, français, allemand, italien, espagnol — sur
[`svelte-i18n`](https://github.com/kaisermann/svelte-i18n). **Une langue, un
fichier** : `src/lib/i18n/locales/<code>.json`, et rien d'autre à déclarer. La
liste servie est déduite du dossier par `import.meta.glob`, et le libellé du
sélecteur vient d'`Intl.DisplayNames`. Ajouter le portugais, c'est déposer
`pt.json`.

Les dictionnaires sont **chargés à la demande**, un module par langue : un
visiteur en télécharge un seul, jamais les cinq. La langue d'arrivée est celle
du navigateur si elle est servie, l'anglais sinon ; le choix explicite du
sélecteur est retenu dans `glyph:lang`, et lui seul.

Dans une page, le dictionnaire se lit par les magasins de la bibliothèque :

```svelte
{$_("glyphcast.crop.zoom")}                          <!-- un message      -->
{$_("glyphslot.status.reel", { values: { n } })}     <!-- à trous, en ICU -->
{$number(value, { style: "percent" })}               <!-- un nombre       -->
{$date(ms, { dateStyle: "medium" })}                 <!-- une date        -->
```

Deux règles qui ne se devinent pas :

- **Un message éphémère se garde en fonction, pas en texte.** Un texte est figé
  dans la langue qui avait cours à l'instant où il a été posé, et changer de
  langue laisse une phrase orpheline au pied de page. D'où les `noticeFn` des
  quatre préviews.
- **L'accord au pluriel appartient au dictionnaire**, jamais au code : un
  `n > 1 ? pluriel : singulier` est la règle française, les quatre autres
  langues basculent à `n ≠ 1`. La forme à écrire est
  `{n, plural, one {# jour} other {# jours}}`.

`bun run check` vérifie les dictionnaires après le typage : mêmes clés partout,
ICU valide, mêmes paramètres d'une langue à l'autre, apostrophes qui ne se font
pas avaler par le lexer, et toute clé écrite dans `src/` qui existe vraiment.
C'est ce qui remplace la vérification à la compilation, que `svelte-i18n` ne
peut pas offrir puisqu'il résout ses clés au rendu.

## Ajouter une préview

1. `src/routes/<slug>/+page.svelte`, sur le modèle de `src/routes/glyphcast`.
   Le moteur du toy dans `src/routes/<slug>/lib/`.
2. Il produit une `Frame` ; `Shell` et `PreviewPane` font le reste.
3. L'entrée dans `src/routes/toys.ts`, `ready: true`.

Vérifier ensuite que `build/<slug>/index.html` existe : le pré-rendu est
silencieux quand une page n'est pas atteignable, elle sort simplement du build
et le 404 n'apparaît qu'en ligne.

## Licence

MIT — voir [LICENSE](LICENSE).

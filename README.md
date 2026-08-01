# glyphcast

Convertit une image en rendu **Glyph Matrix** pour Nothing Phone (3), avec
préview posée sur le dos de l'appareil et un rack de réglages pour fine-tuner
le passage image → LEDs.

Tout se passe dans le navigateur : l'image n'est jamais envoyée nulle part.

```
bun install
bun run dev      # http://localhost:5173
bun run build    # dist/
bun run check    # svelte-check + tsc
```

## La matrice

| Constante | Valeur |
|---|---:|
| Grille | 25 × 25 = 625 cellules, row-major |
| Masque | disque centré sur (12, 12), rayon 12,5 |
| LEDs pilotables | **489** |
| Couleur | aucune — luminosité seule, 0-255 par LED |

Géométrie et calage de la photo repris de [`GlyphLapse`](../GlyphLapse) —
`SPECS.md` et `SPECS-PREVIEW.md`. Le disque est à 79,53 % / 15,36 % du cadre
photo, diamètre 26,04 % ; le Glyph Button à 84,53 % / 74,82 %. Toutes les
positions sont en pourcentage, jamais en pixels : c'est ce qui garde le calage
quand la préview est redimensionnée.

## Chaîne de conversion

`src/lib/pipeline.ts` — une passe, pas d'état caché.

```
cadrage (zoom / décalage / rotation, cover sur fond noir)
  → supersample 200 × 200            8 × 8 échantillons par LED
  → linéarisation sRGB
  → luma = wR·R + wG·G + wB·B        poids normalisés
  → moyenne de zone → 25 × 25
  → ré-encodage sRGB                 la valeur redevient perceptuelle
  → netteté (unsharp 3 × 3)
  → exposition → gates noir/blanc → contraste → gamma → inversion
  → quantification N paliers (+ Floyd-Steinberg ou Bayer 4 × 4)
  → plafond de luminosité → masque disque
```

Deux choix qui ne sont pas cosmétiques :

- **Le downsample se fait en lumière linéaire.** Moyenner des valeurs sRGB
  assombrit les zones contrastées — le damier noir/blanc qui devrait donner
  ~73 % rend un gris à 50 %.
- **On ré-encode en sRGB après la moyenne.** La consigne envoyée à une LED est
  une valeur PWM, mais l'œil la lit en gamma. Sans ce retour, tout le rendu
  sort trop sombre.

### Les curseurs R / G / B

La matrice est monochrome : ces trois réglages ne colorent rien. Ils décident
de la **part de chaque canal dans la luminance** — un filtre coloré de photo
noir et blanc. Monter le rouge éclaircit les peaux et noircit un ciel bleu ;
le preset `CIEL NOIR` pousse le poids bleu en négatif pour détacher les nuages.

### Dithering

À 2 paliers le rendu est binaire et le dither fait tout le travail. Au-delà de
~16 paliers la matrice restitue de vrais niveaux de gris et le dither ne sert
plus qu'à casser les bandes dans les dégradés.

L'erreur de Floyd-Steinberg n'est **propagée qu'aux cellules du disque** : la
pousser hors du masque la ferait disparaître et assombrirait tout le bord.

## Sorties

| Format | Contenu |
|---|---|
| PNG | disque rendu à 24 px par LED (600 × 600) |
| IntArray Kotlin | `intArrayOf(...)` de 625 valeurs 0-255, row-major — à passer tel quel au `GlyphMatrixFrame` |
| JSON | les 625 valeurs **et** tous les réglages, rechargeable |

## Préview

Deux échelles, au choix :

- **Téléphone** — la matrice à sa taille réelle (150 px de diamètre pour un
  appareil rendu à 576 px de large), sur la photo du dos. Maintenir le Glyph
  Button compare avec le rendu sans aucun réglage.
- **Grand** — le disque seul sur toute la largeur de la colonne, pour lire LED
  par LED ce que fait un curseur.

Dans les deux cas une cellule occupe un nombre **entier** de pixels de canvas :
un canvas redimensionné par le navigateur avec un ratio fractionnaire donne
une trame irrégulière, une colonne sur n gagne un pixel de gap. La grille est
donc calculée depuis le `devicePixelRatio`.

### Rendu des LED : sharp / soft

| | `sharp` | `soft` |
|---|---|---|
| Forme | carré vif | angles adoucis, r ≈ 24 % |
| Halo | proportionnel à la luminosité | aucun |
| Gap | 1/6 de cellule | 0,14 de cellule |
| Rampe | plancher à 0,25 | quasi linéaire (0,08) |
| Fond du disque | `#08080a` | `#131316`, plus clair que les LEDs éteintes |

`sharp` émule l'appareil, c'est ce qu'on voit sur le dos d'un Phone (3).
`soft` est fait pour un affichage tel quel sur un écran normal : sans halo
pour porter l'intensité, un plancher haut écraserait tout le bas de la plage
sur un même gris — d'où la rampe quasi linéaire.

**L'export PNG suit le style affiché**, et le nomme dans le fichier
(`glyphcast-soft-…​.png`).

## Direction artistique

Langage Nothing : angles vifs partout, le cercle est réservé aux points et aux
LEDs, filets de 1 px, un seul accent rouge en ponctuation, grille de points en
fond, repères d'imprimerie aux quatre angles, nomenclature parenthétique.
Geist Mono pour ~90 % de la page, serif système pour le seul titre éditorial,
dot-matrix en canvas pour le wordmark.

Thème clair par défaut, bascule en pied de page. Le thème est posé par un
script inline dans `<head>` : un `onMount` s'exécute après le premier paint et
un visiteur en sombre prendrait un flash clair à chaque chargement.

Le Glyph Button et son rappel sont les seuls éléments dont les couleurs sont
en dur : ils sont posés sur le corps noir de l'appareil, pas sur la page, et
ne peuvent donc pas suivre le thème.

## Structure

```
src/lib/matrix.ts       géométrie 25 × 25 et masque circulaire
src/lib/pipeline.ts     conversion image → 625 valeurs
src/lib/render.ts       peinture des LEDs sur canvas (écran et export)
src/lib/export.ts       PNG / Kotlin / JSON, import de session
src/lib/ui/             Preview, Slider, Seg, Card, Wordmark, ThemeToggle
src/App.svelte          rack de réglages et mise en page
public/phone3-back.webp photo du dos, partagée avec glyphlapse / glyphslot
```

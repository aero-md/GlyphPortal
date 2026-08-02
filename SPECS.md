# glyphcast — Spécifications fonctionnelles

Ce document décrit **ce que fait l'application**, dans l'ordre où elle le fait,
avec les formules et les bornes exactes. Il ne traite pas de la direction
artistique.

Référence d'implémentation : `src/lib/matrix.ts`, `src/lib/pipeline.ts`,
`src/lib/render.ts`, `src/lib/export.ts`.

---

## 1. Objet

Transformer une image arbitraire en une trame de luminosités pilotable par la
**Glyph Matrix** d'un Nothing Phone (3), avec une préview fidèle et de quoi
régler finement le passage image → LEDs.

Tout est exécuté dans le navigateur. Aucune image, aucun réglage, aucune
donnée ne quitte la machine : il n'y a pas de requête réseau après le
chargement de la page.

### Hors périmètre

| Non traité | Raison |
|---|---|
| Animations, séquences multi-frames | une seule image fixe par session |
| Envoi direct à l'appareil | pas d'API navigateur pour piloter la Glyph Matrix ; la passerelle est l'export Kotlin |
| Couleur | la matrice est monochrome, la question ne se pose pas |
| Édition d'image (masques, calques, retouche locale) | l'entrée est une image déjà finie |
| Autres appareils Nothing | la géométrie est celle du Phone (3) |

---

## 2. Cible matérielle

| Constante | Valeur | Source |
|---|---:|---|
| `SIZE` | 25 | grille 25 × 25 |
| `CELLS` | 625 | `SIZE²`, row-major |
| Centre | (12, 12) | `CX`, `CY` |
| `RADIUS` | 12,5 | masque circulaire, `dist < RADIUS` |
| `LED_COUNT` | **489** | calculé, jamais écrit en dur |
| Profondeur | 0-255 par LED | consigne du Glyph Matrix SDK |
| Canaux | 1 (luminosité) | pas de couleur |

Les 136 cellules hors disque existent dans le tableau — le SDK attend 625
entrées — mais valent **toujours 0** et sont exclues de tous les calculs
d'agrégat (comptage, moyenne, auto-gates, diffusion d'erreur).

---

## 3. Modèle de données

### `Params` — l'état de réglage complet

Sérialisable, comparable, sans référence à l'image. Deux `Params` identiques
sur la même image donnent la même trame, toujours.

### `Frame` — le résultat

| Champ | Type | Contenu |
|---|---|---|
| `values` | `Float32Array(625)` | luminosités 0..1, row-major, 0 hors disque |
| `lit` | `number` | nombre de LEDs > 0 parmi les 489 |
| `mean` | `number` | luminosité moyenne **des LEDs allumées** (0 si aucune) |

`toBytes(frame)` convertit en `Uint8Array(625)` de consignes 0-255 par
`Math.round(v × 255)`.

---

## 4. Chaîne de conversion

Une passe pure, sans état caché. `convert(image, w, h, params) → Frame`.

```
1  cadrage        zoom / décalage / rotation, cover sur fond noir
2  échantillon    canvas 200 × 200, soit 8 × 8 échantillons par LED
3  luma           poids R/G/B normalisés, en lumière linéaire
4  downsample     moyenne de zone → 25 × 25, puis ré-encodage sRGB
5  netteté        unsharp 3 × 3
6  tonalité       exposition → gates → contraste → gamma → inversion
7  quantification N paliers, avec ou sans dithering
8  finition       plafond de luminosité, masque disque, agrégats
```

### 4.1 Cadrage

La source est dessinée dans un canvas `SAMPLE × SAMPLE` (200 × 200) **rempli
de noir au préalable** : les zones transparentes d'une image à canal alpha
s'éteignent, ce qui est le comportement attendu d'un rendu LED.

```
cover = max(SAMPLE / srcW, SAMPLE / srcH)
s     = cover × max(0,05, zoom)
tx    = SAMPLE/2 + offsetX × SAMPLE/2
ty    = SAMPLE/2 + offsetY × SAMPLE/2
```

Ordre des transformations : translation, puis rotation, puis échelle, l'image
étant dessinée centrée. La rotation ne réajuste pas l'échelle : une image
tournée de 45° laisse apparaître les coins noirs, c'est à l'utilisateur de
compenser au zoom.

Le cadrage est le seul étage qui dépend de la résolution de la source. Les
huit suivants travaillent sur une grille fixe.

### 4.2 Échantillonnage et luminance

Chaque LED intègre **64 échantillons** (8 × 8). Pour chacun :

```
lin(c)  = c ≤ 0,04045 ? c/12,92 : ((c + 0,055)/1,055)^2,4     (table de 256)
luma    = wR'·lin(R) + wG'·lin(G) + wB'·lin(B)
```

Les poids sont **normalisés** par leur somme (`n = wR + wG + wB`, ramené à 1
si `|n| < 1e-4`). Monter le rouge seul rééquilibre les teintes au lieu de
surexposer toute l'image.

> **Les curseurs R/G/B ne colorent rien.** La matrice est monochrome ; ces
> poids décident de la part de chaque canal dans la luminance, exactement
> comme un filtre coloré en photo noir et blanc. Un poids négatif est autorisé
> et légitime : c'est ce que fait le preset `CIEL NOIR`.

### 4.3 Downsample

Moyenne arithmétique des 64 échantillons, **en lumière linéaire**, puis
ré-encodage sRGB :

```
v = encodeSrgb( moyenne des luma linéaires )
```

Deux décisions qui ne sont pas cosmétiques :

- **Moyenner en linéaire.** Moyenner des valeurs sRGB assombrit les zones
  contrastées — un damier noir/blanc rend un gris à 50 % alors qu'il devrait
  donner ~73 %.
- **Ré-encoder après la moyenne.** La consigne envoyée à une LED est une
  valeur PWM, mais l'œil la lit en gamma. Sans ce retour, tout le rendu sort
  trop sombre.

### 4.4 Netteté

Masque flou sur la grille 25 × 25, noyau 3 × 3 pondéré (centre 4, orthogonaux
2, diagonales 1, normalisé), bords tronqués :

```
v' = v + netteté × (v − flou(v))
```

Court-circuité si `netteté ≤ 0,001`. Appliqué **avant** la tonalité : sinon un
gate agressif écrêterait les halos de l'unsharp au lieu du signal.

### 4.5 Tonalité

Ordre fixe, chaque étage sur le résultat du précédent :

```
gain = 2^exposition
lo   = min(pointNoir, pointBlanc − 0,01)
span = max(0,01, pointBlanc − lo)
k    = 1 + max(−0,99, contraste)
g    = max(0,05, gamma)

x = v × gain
x = (x − lo) / span                       gates
x = (x − 0,5) × k + 0,5                   contraste autour du gris moyen
x = clamp(x, 0, 1) puis x^g               gamma
x = inversion ? 1 − x : x
```

Les garde-fous sur `lo`, `span`, `k` et `g` ne sont pas décoratifs :
`pointNoir ≥ pointBlanc` donnerait une division par ~0 et un rendu binaire,
`contraste = −1` aplatirait tout sur un gris unique.

L'exposition est en **IL** (stops), pas en pourcentage : +1 double la
luminance linéaire.

### 4.6 Quantification et dithering

`pas = 1 / (paliers − 1)`, `paliers ∈ [2, 64]`.

| Mode | Comportement |
|---|---|
| `none` | `round(v / pas) × pas` |
| `bayer` | `v += (B₄[y%4][x%4]/16 − 0,5) × pas × force`, puis arrondi |
| `floyd` | diffusion d'erreur 7/3/5/1 sur 16, **en serpentin** (une ligne sur deux à l'envers), erreur multipliée par la force |

**L'erreur de Floyd-Steinberg n'est propagée qu'aux cellules du disque.** La
pousser hors du masque la ferait disparaître et assombrirait tout le bord de
la matrice. Les cellules hors disque sont ignorées à la lecture comme à
l'écriture.

Repère de réglage : à 2 paliers le rendu est binaire et le dithering fait tout
le travail ; au-delà de ~16 paliers la matrice restitue de vrais niveaux de
gris et le dither ne sert plus qu'à casser les bandes dans les dégradés.

### 4.7 Finition

```
pour chaque cellule i :
  hors disque  → values[i] = 0
  dans disque  → values[i] × = plafond
lit  = nombre de values[i] > 0
mean = Σ values[i] / lit          (0 si lit = 0)
```

Le **plafond de luminosité** (5 % à 100 %) borne la consigne maximale envoyée
à une LED. Il s'applique après quantification : il ne réduit pas le nombre de
paliers, il les tasse.

---

## 5. Fonctions de l'interface

### 5.1 Chargement d'une image

Trois voies, toutes équivalentes :

| Voie | Détail |
|---|---|
| Glisser-déposer | sur **n'importe quel point de la page**, pas seulement la zone de dépôt |
| Collage | `Ctrl+V`, premier élément du presse-papiers de type `image/*` |
| Sélecteur de fichier | `accept="image/*"` |

Un fichier dont le type MIME n'est pas `image/*` est refusé avec un message ;
un fichier image que le navigateur ne sait pas décoder l'est aussi. Le
`objectURL` précédent est révoqué au chargement du suivant, jamais avant que
le nouveau soit décodé.

Sans image, la matrice est éteinte, tous les exports sont désactivés et un
message explique les trois voies de chargement. Aucun contenu de démonstration
n'est affiché.

### 5.2 Réglages

| Réglage | Plage | Défaut | Effet |
|---|---|---:|---|
| Zoom | 0,2 – 6 | 1 | échelle relative au cadrage cover |
| Décalage X / Y | −1 – 1 | 0 | en fraction d'un demi-cadre |
| Rotation | −180 – 180° | 0 | pas de 1°, boutons ± 90° |
| Rouge / Vert / Bleu | −1 – 2 | 0,2126 / 0,7152 / 0,0722 | poids de luminance, normalisés |
| Exposition | −3 – 3 IL | 0 | `× 2^v` |
| Gate — point noir | 0 – 100 % | 0 | plancher de la plage |
| Gate — point blanc | 0 – 100 % | 100 % | plafond de la plage |
| Contraste | −0,9 – 3 | 0 | autour du gris moyen |
| Gamma | 0,2 – 3 | 1 | `x^v` |
| Netteté | 0 – 2 | 0,35 | force de l'unsharp |
| Inversion | booléen | non | `1 − x` |
| Paliers de luminosité | 2 – 64 | 16 | niveaux distincts |
| Plafond de luminosité | 5 – 100 % | 100 % | consigne maximale |
| Dithering | aucun / Floyd / Bayer | aucun | |
| Force du dither | 0 – 100 % | 100 % | visible seulement si dithering actif |

`RANGES` dans `src/lib/export.ts` est la **source unique** de ces bornes :
elles alimentent à la fois les curseurs et la validation d'import. Les faire
diverger donnerait un curseur qui ment, le pouce épinglé au maximum sur une
valeur plus grande.

Chaque curseur affiche une pastille rouge quand sa valeur s'écarte de son
repos, et un clic sur son libellé l'y ramène. **Recadrer** remet les seuls
réglages de cadrage.

Il n'y a **pas** de remise à zéro globale. Elle a existé, posée dans la carte
`[06] Export` entre les boutons de téléchargement : un bouton qui efface vingt
minutes de cadrage à un pixel des boutons qui exportent le résultat. Aucun des
deux voisinages n'était sauvable — ni le libellé, ni la place. Le retour au
repos se fait donc curseur par curseur, ce qui est de toute façon le geste
qu'on veut neuf fois sur dix : on annule *un* réglage, pas tout le travail.

#### Presets du mixeur de canaux

| Preset | Poids R / V / B | Usage |
|---|---|---|
| `LUMA` | 0,2126 / 0,7152 / 0,0722 | Rec. 709, la référence perceptuelle |
| `ÉGAL` | 1 / 1 / 1 | moyenne brute |
| `ROUGE` | 1 / 0,15 / 0 | |
| `VERT` | 0,1 / 1 / 0,1 | |
| `BLEU` | 0 / 0,2 / 1 | |
| `CIEL NOIR` | 1,4 / 0,4 / −0,4 | filtre rouge photo : ciel dense, nuages détachés |

#### Auto-gates

Étale l'histogramme sur toute la plage. Une passe de sonde est calculée avec
`black = 0`, `white = 1`, `contrast = 0`, `gamma = 1`, `levels = 256`,
`dither = none` — le reste des réglages inchangé — puis :

```
lo, hi = min et max sur les 489 cellules du disque uniquement
si hi − lo < 0,02 → abandon, la plage est trop plate
pointNoir  = max(0, lo − 0,01)
pointBlanc = min(1, hi + 0,01)
```

Le balayage doit ignorer les cellules hors disque : elles valent toujours 0 et
cloueraient le point noir à 0 quelle que soit l'image.

### 5.3 Comparaison avant / après

Maintenir le **Glyph Button** (mode téléphone) ou le bouton **Maintenir**
(mode grand) affiche le rendu de référence : mêmes réglages de **cadrage**,
tout le reste aux valeurs par défaut. C'est ce que donnerait l'image sans
aucun réglage tonal — pas l'image d'origine, qui n'aurait pas le même
cadrage et ne serait donc pas comparable.

Le relâchement, la sortie du pointeur et l'annulation du geste par le
navigateur reviennent tous au rendu courant. Au clavier, `Entrée` / `Espace`
maintiennent tant que la touche est enfoncée.

### 5.4 Préview

Deux axes indépendants.

**Échelle** :

| Mode | Grille | Rendu |
|---|---|---|
| Téléphone | `diamètre affiché / 25` px CSS par LED | matrice calée sur la photo du dos |
| Grand | `max(6, ⌊côté / 25⌋)` px par LED | disque seul |

Les deux sont larges de `min(576, largeur de colonne)`. À 576 px le disque du
téléphone mesure 150 px, soit **6 px CSS par LED** : l'échelle réelle de
l'appareil.

**Le téléphone n'est jamais réduit pour tenir en hauteur** — le rétrécir
viderait le mode de son sens. Quand la place manque il est **rogné par le
bas** : le disque est dans le haut de l'appareil, ce qu'on perd est le dos et
le Glyph Button, décoratifs. D'où l'alignement en haut du cadre, un centrage
rognerait des deux côtés et mangerait la matrice.

Le disque seul, lui, **se réduit** plutôt que d'être rogné : il n'a pas
d'échelle réelle à préserver et le couper ferait perdre des LEDs.

Seule une colonne plus étroite que 576 px contraint la largeur, et la cellule
suit alors le diamètre réellement affiché : une valeur figée donnerait une
trame irrégulière.

Un fondu de 56 px (28 px en colonne unique) marque le bord du rognage, et
seulement quand il y a rognage — la photo se termine déjà par un dégradé, la
couper net trancherait dedans.

**Style de LED** :

| | `sharp` | `soft` |
|---|---|---|
| Forme | carré vif | angles adoucis, r = 24 % du côté |
| Halo | `shadowBlur = cellule × 0,55 × b` | aucun |
| Demi-gap | `round(cellule × 0,167)` | `round(cellule × 0,14)` |
| Rampe alpha | `0,25 + 0,75 b` | `0,08 + 0,92 b` |
| LED éteinte | `#1b1b20` | `#08080a` |
| Fond du disque | `#08080a` | `#131316` |

`sharp` émule l'appareil. `soft` est fait pour un affichage tel quel sur un
écran : sans halo pour porter l'intensité, un plancher à 0,25 écraserait tout
le bas de la plage sur un même gris — d'où la rampe quasi linéaire. Le fond du
disque y est **plus clair** que les LEDs éteintes, l'inverse de `sharp`, sinon
la trame disparaît.

Une LED est considérée éteinte à `b ≤ 0,02`. La couleur allumée est
`rgb(242, 242, 239)`, le blanc légèrement chaud des LEDs du Phone (3).

#### Grille en pixels entiers

Une cellule occupe un nombre **entier** de pixels de canvas, et le gap est
forcé pair pour que la marge reste entière :

```
cellule = max(3, round(px CSS visés × devicePixelRatio))
demiGap = max(1, round(cellule × ratio du style))
led     = max(2, cellule − 2 × demiGap)
```

Un canvas de taille fixe redimensionné par le navigateur avec un ratio
fractionnaire produit une trame irrégulière : une colonne sur n gagne un pixel
de gap. La taille CSS du canvas est donc dérivée du backing (`size / dpr`),
ratio exactement 1.

#### Calage sur la photo

Positions en **pourcentage du cadre photo**, jamais en pixels — c'est ce qui
garde le calage au redimensionnement. Relevé repris de `SPECS-PREVIEW.md` du
repo GlyphLapse, asset `phone3-back.webp` partagé.

| Élément | Position | Diamètre |
|---|---|---:|
| Disque de la matrice | 79,53 % / 15,36 % | 26,04 % |
| Glyph Button | 84,53 % / 74,82 % | 15,86 % |
| Rappel « maintenir » | 74,6 % / 74,82 % | — |

Cadre en `aspect-ratio: 704/913`, rendu au plus à 576 px de large → disque de
150 px, soit 6 px CSS par LED.

### 5.5 Lectures

Sous la préview, en permanence : **LED allumées** `[nnn / 489]`, **moyenne**
en pourcentage, **échelle** en pixels par LED. Ce sont des mesures de la trame
courante, pas des estimations.

### 5.6 Mise en page et défilement

Invariant commun aux deux largeurs : **la matrice est visible en permanence**,
sans avoir à faire défiler quoi que ce soit. Régler un curseur sans voir son
effet n'aurait aucun intérêt. Ce qui cède quand la place manque, c'est le bas
de la préview — jamais son échelle, jamais sa présence à l'écran.

**Deux colonnes** (au-dessus de 980 px). La page occupe exactement la fenêtre
et **ne défile pas**. L'en-tête, la préview, les lectures et le pied restent en
place ; le rack de réglages est le seul élément qui défile. Si la préview ne
rentre pas dans la hauteur laissée par l'en-tête et le pied, son cadre la rogne
par le bas.

**Colonne unique** (980 px et moins). Défilement de page classique, un seul
ascenseur. L'en-tête défile — collant il volerait 160 px à la préview — et
c'est la **colonne de préview qui s'épingle en haut de l'écran**, réduite à la
bande qui porte le disque, le rack passant dessous.

Hauteur de la bande :

| Mode | Bande |
|---|---|
| Téléphone | `min(0,5 × largeur du téléphone, 0,4 × hauteur d'écran)` |
| Grand | taille du disque, elle-même réduite à `min(largeur, 0,4 × hauteur d'écran)` |

Le facteur 0,5 vient de la géométrie : le bas du disque tombe à 0,329 de la
largeur de l'appareil (centre à 15,36 % de la hauteur, rayon à 13,02 % de la
largeur, cadre en 704/913). Il reste donc de la marge sous le disque, et le
fondu ne mord pas sur les LEDs. Le plafond en hauteur d'écran évite qu'un
appareil large sur un écran court ne laisse rien au rack.

#### Défilement du rack

Le rack n'a de défilement propre qu'en deux colonnes ; en colonne unique il
suit le défilement de la page, sans fondu ni gouttière réservée.

Le rack porte un fondu haut et bas, en masque et non en aplat superposé, pour
que le fond de page reste visible dans la bande. Sa profondeur est
proportionnelle à la distance déjà parcourue, plafonnée à 32 px :

```
fondu haut = min(32, scrollTop)
fondu bas  = min(32, scrollHeight − clientHeight − scrollTop)
```

Il est donc nul quand la liste tient dans la hauteur, et apparaît
progressivement plutôt que d'un bloc. La gouttière d'ascenseur est réservée en
permanence : sans ça l'apparition du curseur de dither décalerait toute la
colonne.

---

## 6. Sorties

| Format | Contenu | Nom de fichier |
|---|---|---|
| PNG | disque à 24 px par LED (600 × 600), fond compris, **dans le style de LED affiché** | `glyphcast-<style>-<horodatage>.png` |
| Kotlin | `val FRAME = intArrayOf(...)`, 625 valeurs 0-255 sur 25 lignes de 25, alignées | `glyphcast-<horodatage>.kt` |
| JSON | trame **et** réglages | `glyphcast-<horodatage>.json` |

Le Kotlin est aussi copiable dans le presse-papiers (`navigator.clipboard`,
repli sur `textarea` + `execCommand`) et affiché en clair dans la carte
Export : ce qu'on lit est exactement ce qu'on exporte.

L'horodatage est un ISO 8601 tronqué à la seconde, `:` et `T` remplacés par
des tirets.

### Schéma JSON

```json
{
  "format": "glyphcast",
  "version": "1.0",
  "size": 25,
  "ledCount": 489,
  "params": { "zoom": 1, "wR": 0.2126, "...": "tous les réglages" },
  "values": [0, 0, 102, "... 625 entiers 0-255"]
}
```

### Import

`format` doit valoir `"glyphcast"`, sinon rejet. Seuls les **réglages** sont
relus : `values` est ignoré et recalculé depuis l'image chargée. Un `.json`
rechargé sans image ne fait donc que restaurer les curseurs.

Chaque valeur est bornée aux plages du § 5.2 et retombe sur le défaut si elle
est absente ou non finie ; `dither` doit être l'une des trois valeurs connues.
Un fichier édité à la main ne peut pas mettre le pipeline dans un état
impossible — `levels = 0` donnerait une division par zéro.

---

## 7. Invariants

Vrais après chaque conversion, quels que soient l'image et les réglages :

1. `values.length === 625`, indexé en row-major.
2. `values[i] === 0` pour les 136 cellules hors disque.
3. `0 ≤ values[i] ≤ plafond` pour toutes les cellules.
4. `lit` ≤ 489 et compte exactement les cellules `> 0`.
5. Aucune requête réseau n'est émise après le chargement de la page.
6. Deux `Params` égaux sur la même image produisent des `values` identiques —
   le dithering est déterministe, la trame de Bayer est fixe et le serpentin
   de Floyd-Steinberg parcourt toujours la grille dans le même ordre.

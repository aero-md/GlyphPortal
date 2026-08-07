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

Ici il n'y en a qu'une, dans `packages/kit`.

## Arborescence

```
packages/kit/        @glyph/kit — le noyau
  src/matrix/        géométrie, calibrage, rendu au pixel, Grid, polices,
                     Preview, PreviewPane
  src/ui/            Shell, Card, Seg, Slider, ThemeToggle, Wordmark, thème
  src/app.css        jetons de thème, trame de fond, étages typographiques

apps/portal/         le sommaire, servi à la racine du domaine
apps/glyphcast/      /glyphcast   — image → Glyph Matrix
apps/sonoglyph/      /sonoglyph   — spectre et VU-mètre, au micro
apps/glyphlapse/     /glyphlapse  — le temps qui passe, décomposé
apps/glyphslot/      /glyphslot   — machine à sous

deploy.ps1           build de tout + un seul tarball vers le Pi
deploy/              le bloc Caddy correspondant
```

Chaque app est un build Vite indépendant avec son propre `base`. Le déploiement
les empile dans l'arborescence que Caddy sert.

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

Une app se réduit donc à son moteur, ses réglages, et deux composants :

```svelte
<Shell title="…" sub="…">
  {#snippet preview()}
    <PreviewPane {frame} bind:device bind:mode bind:style />
  {/snippet}
  {#snippet rack()}
    <Card ref="01" title="…">…</Card>
  {/snippet}
</Shell>
```

## Développement

```powershell
bun install
bun run dev     # les cinq apps -> http://localhost:5180
bun run check   # svelte-check + tsc sur toutes les apps
```

Les cinq serveurs Vite montent **dans un seul processus** (`scripts/dev.ts`),
chacun sur un port fixe, et **le serveur du portail proxyfie les quatre
autres**. Tout répond donc sur `localhost:5180`, exactement comme en
production : le sommaire mène aux préviews, le bouton « ◂ Index » ramène au
sommaire. Sans ce proxy chaque app vivrait sur une origine différente et tous
les liens du portail casseraient, puisqu'ils sont absolus.

Le processus unique n'est pas un détail de confort. Lancer les cinq par
`bun run --filter` exécutait chaque `vite` dans un `node` enfant, et sous
Windows tuer le parent ne propage rien : les cinq continuaient d'écouter après
un Ctrl+C, et le lancement suivant se cognait à `strictPort`. Ici les serveurs
n'ont pas de processus à eux — quoi qu'il arrive au processus, les ports
partent avec lui.

| App | Port | Adresse via le portail |
|---|---:|---|
| portal | 5180 | `/` |
| glyphcast | 5181 | `/glyphcast/` |
| sonoglyph | 5182 | `/sonoglyph/` |
| glyphlapse | 5183 | `/glyphlapse/` |
| glyphslot | 5184 | `/glyphslot/` |

**Le proxy relaie le HTTP, pas la websocket.** Le HMR de chaque app parle
directement à son propre port (`server.hmr`), et l'app autorise l'origine du
portail (`server.cors`) — sans quoi Vite refuse la connexion, à juste titre :
une websocket cross-origine acceptée sans condition est une porte d'entrée. La
websocket relayée, elle, ne s'établit pas sous Bun, et Vite finit alors la
réponse par un `socket.destroySoon()` qui n'existe pas dans le socket d'un
`upgrade` — ce qui tuait le processus, donc les cinq serveurs.

Les ports sont en `strictPort` : une collision fait échouer le démarrage au lieu
de glisser silencieusement sur le port suivant, où le proxy ne trouverait plus
personne.

Une seule URL est imprimée, celle du portail. Les terminaux et éditeurs qui
guettent les adresses locales ouvraient sinon un onglet par ligne, pour un site
qui n'a qu'une porte d'entrée. Pour la même raison, `bun run dev` n'accepte plus
de drapeau destiné à Vite : un `--open` égaré ouvrait cinq onglets à chaque
lancement, et il n'a plus de chemin jusqu'à lui.

Les paquets de `packages/` ne sont pas compilés : ils sont consommés en source
par Vite, via les liens de workspace. Une modification du noyau part en HMR dans
l'app ouverte, sans étape de build intermédiaire et sans rechargement.

## Déploiement

```powershell
.\deploy.ps1              # check + build + tarball + extraction sur le Pi
.\deploy.ps1 -StageOnly   # assemble .staging/ et s'arrête — pour vérifier avant d'envoyer
```

La cible est `/srv/glyph` sur le Raspberry Pi, servie par Caddy derrière un
tunnel Cloudflare. **La racine du domaine a changé de contenu** : elle servait
GlyphCast, elle sert maintenant le sommaire, et GlyphCast a déménagé sous
`/glyphcast/`. Le bloc Caddy est à remplacer en même temps — voir
[`deploy/Caddyfile.snippet`](deploy/Caddyfile.snippet).

## Ajouter une préview

1. `apps/<slug>/` sur le modèle de `apps/glyphcast` — `base: "/<slug>/"` dans le
   `vite.config.ts`.
2. Le moteur du toy produit une `Frame` ; `Shell` et `PreviewPane` font le reste.
3. L'entrée dans `apps/portal/src/toys.ts`, `ready: true`.
4. L'entrée dans `$Apps` de `deploy.ps1`.

Les points 3 et 4 vont ensemble : `ready: true` sans entrée dans `$Apps` donne
un lien vers un 404.

## Licence

MIT — voir [LICENSE](LICENSE).

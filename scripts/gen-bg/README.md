# gen-bg

Fonds de glyph.suns.red : 5 compositions x 2 thèmes, 16:9 (2560x1440), générés par script (déterministe, graine fixe).

- Commande : `bun run scripts/gen-bg/gen.ts` -> écrit `static/bg/{1..5}-{dark|light}.webp`.
- Dépendances : Bun et `ffmpeg` (libwebp) dans le PATH. Rien d'autre.
- Brouillon rapide : `--scale 0.25 --out <dossier> --preview <dossier>` ; `--only 3` pour une seule composition.
- Réglages : palettes `DARK` / `LIGHT` (luminance, grain, `curve` = assombrissement des tons moyens), fonctions `comp1..comp5` (géométrie en unités de hauteur ; centre horizontal = 0.889).
- Poids : `--quality` (défaut 85) et `grain` des palettes ; le grain pèse vite, baisser l'un ou l'autre plutôt que la résolution.

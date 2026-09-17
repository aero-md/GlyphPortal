/**
 * Pose le `<title>` et les balises `description` / `og:*` / `twitter:*` dans
 * le HTML statique, après `vite build`.
 *
 * `ssr` est faux (voir `+layout.ts`) : le `<svelte:head>` de chaque page ne
 * s'exécute donc jamais côté serveur, et `vite build` écrit un `index.html`
 * par route qui ne porte ni titre ni description — voir `build/index.html`
 * avant ce script, où seuls `viewport` et `theme-color` survivent. Un
 * crawler qui déplie un lien (Discord, Slack, iMessage…) ne joue jamais le
 * JavaScript de la page : ce que ce script écrit en dur est la seule version
 * qu'il verra jamais.
 *
 * Une seule langue : l'anglais, la langue de repli — voir `scripts/og.ts`
 * pour le même raisonnement appliqué aux images.
 *
 * Lancé après chaque build (`vite build && bun run scripts/inject-meta.ts`),
 * jamais à la main : `adapter-static` réécrit `build/` en entier à chaque
 * fois, donc toute pose manuelle serait perdue au build suivant.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import en from "../src/lib/i18n/locales/en.json";
import { TOYS } from "../src/routes/toys";

const ORIGIN = "https://glyph.suns.red";
const buildDir = join(import.meta.dir, "..", "build");

type Page = { dir: string; title: string; ogTitle: string; description: string; image: string };

/* `title` — celui de l'onglet — reprend le `<title>` que pose déjà chaque
   `+page.svelte` : une fois l'hydratation faite, c'est cette valeur-là que le
   visiteur voit de toute façon, poser autre chose ferait clignoter le titre.

   `ogTitle` en diffère sur le sommaire seulement : « GLYPH » seul est un
   wordmark très bien sur site, mais fait un titre de lien pauvre dans une
   messagerie — le domaine dit mieux ce qu'on ouvre. Les toys gardent leur
   nom, qui est déjà spécifique. */
/* `ready: false` — Haloglyph pour l'instant — n'a pas de route : la tuile du
   sommaire renvoie droit sur le dépôt (voir `toys.ts`), donc il n'existe ni
   `build/<slug>/index.html` à réécrire ni carte `og/<slug>.png` à référencer. */
const pages: Page[] = [
  { dir: "", title: "GLYPH", ogTitle: "glyph.suns.red", description: en.home.description, image: "home" },
  ...TOYS.filter((toy) => toy.ready).map((toy) => ({
    dir: toy.slug,
    title: toy.name,
    ogTitle: toy.name,
    description: en[toy.slug].description,
    image: toy.slug,
  })),
];

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

for (const page of pages) {
  const file = join(buildDir, page.dir, "index.html");
  let html: string;
  try {
    html = readFileSync(file, "utf-8");
  } catch {
    console.error(`Absent — build introuvable pour /${page.dir}/ (${file}). Lancer "vite build" d'abord.`);
    process.exit(1);
  }

  const url = `${ORIGIN}/${page.dir ? `${page.dir}/` : ""}`;
  const image = `${ORIGIN}/og/${page.image}.png`;
  const desc = escapeAttr(page.description);

  const tags = `    <title>${page.title}</title>
    <meta name="description" content="${desc}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="glyph.suns.red" />
    <meta property="og:title" content="${page.ogTitle}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${desc}" />
    <meta property="og:locale" content="en" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${page.ogTitle}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${image}" />
`;

  if (!html.includes("</head>")) {
    console.error(`Pas de </head> dans ${file} — gabarit inattendu, rien n'est écrit.`);
    process.exit(1);
  }
  html = html.replace("</head>", `${tags}  </head>`);
  writeFileSync(file, html);
  console.log(`meta: /${page.dir}/`);
}

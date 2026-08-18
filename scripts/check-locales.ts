/**
 * Vérifie les dictionnaires. Lancé par `bun run check`, après `svelte-check`.
 *
 * `svelte-i18n` résout ses clés au rendu : `$_("commmon.language")` compile, et
 * affiche `commmon.language` en clair au visiteur. Le typage ne peut pas
 * rattraper ça — le dictionnaire est un JSON chargé à la demande, pas un objet
 * que TypeScript indexe. Ce contrôle-ci le rattrape, au même endroit et au même
 * moment que le reste : cinq passes, et rien qui demande à être tenu à jour à
 * la main quand une langue ou une clé arrive.
 *
 *   1. les cinq langues portent exactement les mêmes clés, de la même forme ;
 *   2. chaque message à paramètres est de l'ICU valide ;
 *   3. un message et sa traduction attendent les mêmes paramètres ;
 *   4. aucune apostrophe ne se fait avaler par le lexer ICU ;
 *   5. toute clé écrite dans `src/` existe.
 *
 * Sortie non nulle au premier manquement, pour que la vérification échoue.
 */
import { parse } from "@formatjs/icu-messageformat-parser";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LOCALES_DIR = "src/lib/i18n/locales";
const SRC_DIR = "src";
const REFERENCE = "en";

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

/* --- lecture --- */

type Json = string | Json[] | { [k: string]: Json };

const codes = readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

const dicts = new Map<string, Json>(
  codes.map((c) => [c, JSON.parse(readFileSync(join(LOCALES_DIR, `${c}.json`), "utf8"))]),
);

if (!dicts.has(REFERENCE)) {
  console.error(`✗ pas de ${REFERENCE}.json — c'est la langue de référence`);
  process.exit(1);
}

/**
 * Aplatit un dictionnaire en chemins pointés.
 *
 * Les conteneurs y figurent aussi, et pas seulement les feuilles : c'est ce qui
 * permet de voir qu'une entrée est passée d'objet à tableau, ou qu'un tableau a
 * changé de longueur, alors que les clés seules resteraient d'accord.
 */
function flatten(node: Json, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof node === "string") {
    out.set(path, "message");
  } else if (Array.isArray(node)) {
    out.set(path, `liste[${node.length}]`);
    node.forEach((v, i) => flatten(v, `${path}.${i}`, out));
  } else {
    if (path) out.set(path, "groupe");
    for (const [k, v] of Object.entries(node)) flatten(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const shapes = new Map(codes.map((c) => [c, flatten(dicts.get(c)!)]));
const ref = shapes.get(REFERENCE)!;

/* --- 1. mêmes clés, même forme --- */

for (const code of codes) {
  if (code === REFERENCE) continue;
  const here = shapes.get(code)!;

  for (const [path, kind] of ref) {
    const mine = here.get(path);
    if (mine === undefined) fail(`${code}.json : clé manquante — ${path}`);
    else if (mine !== kind) fail(`${code}.json : ${path} est ${mine}, ${REFERENCE} dit ${kind}`);
  }
  for (const path of here.keys()) {
    if (!ref.has(path)) fail(`${code}.json : clé en trop — ${path}`);
  }
}

/* --- 2 à 4 : ce qui ne concerne que les messages réellement formatés --- */

/**
 * Un message ne passe par ICU que s'il porte un paramètre.
 *
 * `svelte-i18n` court-circuite : `formatMessage` rend le texte tel quel quand
 * on l'appelle sans `values` (`runtime.js`, « if (!values) return message »).
 * Les neuf dixièmes du dictionnaire sont donc de la chaîne brute, jamais lue
 * par le lexer — et leur appliquer les règles d'ICU produit de faux problèmes.
 * Vérifié dans les deux sens : une apostrophe « échappée » dans un message sans
 * paramètre s'affiche **doublée** au visiteur.
 */
const formatted = (s: string) => s.includes("{");

/* --- 2 et 3. ICU valide, mêmes paramètres --- */

/** Les noms de paramètres d'un message, y compris ceux qui pilotent un pluriel. */
function argsOf(message: string, locale: string, path: string): Set<string> | null {
  const found = new Set<string>();
  const walk = (nodes: ReturnType<typeof parse>): void => {
    for (const node of nodes) {
      // 0 = texte, 7 = le « # » d'un pluriel : ni l'un ni l'autre ne nomme rien
      if (node.type === 0 || node.type === 7) continue;
      // 8 = balise `<b>…</b>` : elle traverse le formateur telle quelle
      // (`ignoreTag`), son nom n'est pas un paramètre à traduire
      if (node.type === 8) {
        if (node.children) walk(node.children);
        continue;
      }
      if ("value" in node && typeof node.value === "string") found.add(node.value);
      if ("options" in node && node.options) {
        for (const opt of Object.values(node.options)) walk(opt.value);
      }
      if ("children" in node && node.children) walk(node.children);
    }
  };
  try {
    walk(parse(message));
  } catch (e) {
    fail(`${locale}.json : ICU invalide en ${path} — ${(e as Error).message}`);
    return null;
  }
  return found;
}

/** La valeur au bout d'un chemin pointé, ou `undefined`. */
function at(dict: Json, path: string): Json | undefined {
  let node: Json | undefined = dict;
  for (const seg of path.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = Array.isArray(node) ? node[Number(seg)] : node[seg];
  }
  return node;
}

for (const [path, kind] of ref) {
  if (kind !== "message") continue;
  const source = at(dicts.get(REFERENCE)!, path) as string;
  if (!formatted(source)) continue;
  const expected = argsOf(source, REFERENCE, path);
  if (!expected) continue;

  for (const code of codes) {
    if (code === REFERENCE) continue;
    const value = at(dicts.get(code)!, path);
    if (typeof value !== "string") continue; // déjà signalé par la passe 1
    const mine = argsOf(value, code, path);
    if (!mine) continue;

    for (const a of expected) {
      if (!mine.has(a)) fail(`${code}.json : ${path} n'utilise pas {${a}}`);
    }
    for (const a of mine) {
      if (!expected.has(a)) fail(`${code}.json : ${path} invente {${a}}`);
    }
  }
}

/* --- 4. l'apostrophe qui avale la suite --- */

/**
 * En ICU, une apostrophe suivie de `<`, `{`, `}` ou `#` n'est pas une
 * apostrophe : elle ouvre une citation, disparaît du rendu, et neutralise tout
 * ce qui suit jusqu'à la prochaine. Un piège pour le français et l'italien
 * exclusivement, où l'élision colle le mot à ce qui vient après.
 *
 * Le piège ne se referme que sur les messages à paramètres, d'où le `formatted`
 * : le reste du dictionnaire ne rencontre jamais le lexer, et une apostrophe
 * doublée « par précaution » s'y afficherait doublée. Les deux moitiés de cette
 * règle ont été vues à l'écran, dans un sens puis dans l'autre.
 */
for (const [path, kind] of ref) {
  if (kind !== "message") continue;
  if (!formatted(at(dicts.get(REFERENCE)!, path) as string)) continue;
  for (const code of codes) {
    const value = at(dicts.get(code)!, path);
    if (typeof value !== "string") continue;
    // une apostrophe seule — ni précédée ni suivie d'une autre — devant un
    // caractère que le lexer ICU regarde
    for (const m of value.matchAll(/(^|[^'])'(?=[<{}#])/g)) {
      const around = value.slice(Math.max(0, m.index - 14), m.index + 18);
      fail(
        `${code}.json : ${path} — apostrophe avalée par ICU près de « ${around} », la doubler pour la garder`,
      );
    }
  }
}

/* --- 5. toute clé écrite dans le code existe --- */

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (p.endsWith(".svelte") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/* Deux formes à reconnaître. La clé littérale — `$_("home.title")` — se vérifie
   entièrement. La clé montée à l'exécution — `$_(`glyphslot.symbols.${k}`)` —
   ne se vérifie que jusqu'au dernier point fixe : c'est peu, mais c'est ce qui
   casse quand un groupe est renommé, et c'est précisément le cas que le typage
   ne voyait déjà pas. */
const LITERAL = /\$(_|json)\(\s*["']([^"']+)["']/g;
const DYNAMIC = /\$(_|json)\(\s*`([^`$]*)\$\{/g;

for (const file of walkFiles(SRC_DIR)) {
  const source = readFileSync(file, "utf8");

  for (const [, , key] of source.matchAll(LITERAL)) {
    if (!ref.has(key)) fail(`${file} : clé inconnue — ${key}`);
  }

  for (const [, , prefix] of source.matchAll(DYNAMIC)) {
    const group = prefix.replace(/\.$/, "");
    if (!group) continue; // clé entièrement dynamique : rien à vérifier
    const kind = ref.get(group);
    if (kind === undefined) fail(`${file} : groupe inconnu — ${group}.*`);
    else if (kind === "message") fail(`${file} : ${group} est un message, pas un groupe`);
  }
}

/* --- verdict --- */

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problème(s) de dictionnaire`);
  process.exit(1);
}

const messages = [...ref.values()].filter((k) => k === "message").length;
console.log(`✓ ${messages} messages × ${codes.length} langues (${codes.join(", ")}) — rien à signaler`);

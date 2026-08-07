/**
 * Monte les cinq serveurs de développement **dans un seul processus**.
 *
 * La version précédente déléguait à `bun run --filter './apps/*' dev`, ce qui
 * lance cinq `vite` en ligne de commande. Deux nuisances en découlaient, et
 * c'était la même cause :
 *
 * - **Les ports restaient pris après un Ctrl+C.** Chaque `vite` s'exécute dans
 *   un `node` enfant du `bun` qui l'a lancé. Sous Windows, tuer le parent ne
 *   propage rien : les cinq `node` continuaient d'écouter, et le lancement
 *   suivant se heurtait à `strictPort`. Ici les serveurs vivent *dans* ce
 *   processus — il n'y a plus de petit-enfant à orphelin, et `close()` rend les
 *   ports avant de sortir.
 * - **Cinq bannières, donc cinq URLs.** Les terminaux et les éditeurs qui
 *   guettent les adresses locales en ouvraient une par app. Il n'y en a plus
 *   qu'une, la seule qu'on ouvre vraiment : celle du portail.
 *
 * L'ordre de démarrage compte : les quatre préviews d'abord, le portail ensuite.
 * C'est lui qui les proxyfie, autant qu'elles écoutent quand il ouvre.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Doit rester cohérent avec le proxy de `apps/portal/vite.config.ts`. */
const PREVIEWS = ["glyphcast", "sonoglyph", "glyphlapse", "glyphslot"];
const PORTAL = "portal";

const servers: ViteDevServer[] = [];

async function start(dir: string): Promise<ViteDevServer> {
  const root = path.join(ROOT, "apps", dir);
  const server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    // Silencieux : la récapitulation est imprimée une fois, plus bas. `warn`
    // et non `silent` — une erreur de compilation doit rester visible.
    logLevel: "warn",
  });
  await server.listen();
  servers.push(server);
  return server;
}

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled(servers.map((s) => s.close()));
  process.exit(code);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => void stop(0));
}

try {
  for (const dir of PREVIEWS) await start(dir);
  const portal = await start(PORTAL);

  const base = portal.resolvedUrls?.local?.[0] ?? "http://localhost:5180/";

  /* **Une seule URL imprimée**, et les préviews en chemins relatifs.
     Les terminaux et éditeurs qui guettent les adresses locales en ouvraient un
     onglet chacune — cinq lignes, cinq onglets, pour un site qui n'a qu'une
     porte d'entrée. Le sommaire mène aux quatre autres, c'est son travail. */
  console.log(`\n  glyph.suns.red — 5 apps, 1 processus\n`);
  console.log(`  ➜  ${base}`);
  console.log(`     ${PREVIEWS.map((s) => `/${s}/`).join("   ")}\n`);
  console.log(`  Ctrl+C rend les cinq ports.\n`);
} catch (e) {
  console.error(e);
  await stop(1);
}

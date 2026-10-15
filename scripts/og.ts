/**
 * Fabrique les cartes de partage — `static/og/<slug>.png`, 1200×630.
 *
 * Version précédente : un gabarit typographique (repères, mono, serif), écrit
 * en dur et capturé hors navigateur. Rejetée — une carte de partage de ce
 * portail doit montrer la matrice, pas un résumé en texte. Ce que fait ce
 * script à la place : démarrer `og-render/` — une appli Vite à part, voir son
 * en-tête — et naviguer vers `/?slug=<slug>`, qui rend le **vrai** composant
 * `Preview` avec une trame réelle prise dans les boucles déjà exportées de
 * chaque toy (`static/preview/*.json`), puis capture le résultat tel quel —
 * aucun texte, aucun cadre, juste la matrice.
 *
 * Pas de dépendance `puppeteer` — cherche Edge ou Chrome aux emplacements
 * usuels, comme les autres scripts sans-tête du dépôt.
 *
 * Lancer : `bun run og`
 */
import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PORT = 5183;
const BASE = `http://localhost:${PORT}`;

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const browser = BROWSERS.find(existsSync);
if (!browser) {
  console.error("Ni Edge ni Chrome trouvé aux emplacements usuels — impossible de rendre les cartes.");
  process.exit(1);
}

const outDir = join(ROOT, "static", "og");
mkdirSync(outDir, { recursive: true });

/* Pas de Haloglyph ici : `ready: false` n'a pas de route dans le portail —
   voir `inject-meta.ts`, qui l'exclut pour la même raison. */
const ALL_SLUGS = ["home", "glyphslot", "glyphlapse", "sonoglyph", "justadice", "gforce", "float", "altclock", "glyphcast"];
/* `bun run og altclock` ne refait que la carte demandée : régénérer les neuf
   réécrit aussi celles qui n'ont pas changé, et un PNG capturé n'est jamais
   identique au pixel près d'une exécution à l'autre. */
const SLUGS = process.argv.length > 2 ? process.argv.slice(2) : ALL_SLUGS;

async function waitReady(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      // pas encore prêt
    }
    await Bun.sleep(300);
  }
  throw new Error(`Le serveur de dev ne répond toujours pas sur ${BASE} après ${timeoutMs} ms.`);
}

console.log(`Démarrage de og-render sur ${PORT}…`);
const server = Bun.spawn({
  cmd: ["bun", "run", "og:serve", "--", "--port", String(PORT), "--strictPort"],
  cwd: ROOT,
  stdout: "ignore",
  stderr: "ignore",
});

try {
  await waitReady();
  console.log("Serveur prêt.");

  for (const slug of SLUGS) {
    const out = join(outDir, `${slug}.png`);
    execFileSync(browser, [
      "--headless=new",
      "--disable-gpu",
      "--disable-lcd-text",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      "--virtual-time-budget=6000",
      `--screenshot=${out}`,
      `${BASE}/?slug=${slug}`,
    ]);
    console.log(`og/${slug}.png`);
  }
} finally {
  /* `server.kill()` seul ne suffit pas sous Windows : `bun run dev` lance
     `vite` via un ou deux processus intermédiaires, et le signal n'atteint
     que le premier — le vrai serveur Node peut rester orphelin, port occupé,
     jusqu'au prochain reboot. Même `taskkill /T` sur le PID de départ l'a
     laissé passer une fois, le temps qu'il soit reparenté. On tue donc par
     **port occupé** plutôt que par ascendance : quel que soit le processus
     qui écoute encore dessus, c'est lui le serveur à fermer. */
  server.kill();
  if (process.platform === "win32") {
    try {
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ` +
          "Select-Object -ExpandProperty OwningProcess -Unique | " +
          "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }",
      ]);
    } catch {
      // rien à nettoyer, ou powershell indisponible
    }
  }
}

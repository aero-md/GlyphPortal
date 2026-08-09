/**
 * Thème clair / sombre, partagé par tout le portail.
 *
 * La clé est `glyph:theme` et non `glyphcast:theme` ou `sonoglyph:theme` : les
 * préviews vivaient sur des domaines différents, elles vivent maintenant sur le
 * même. Une clé par app ferait repasser le visiteur en clair à chaque saut d'une
 * préview à l'autre, alors que c'est visiblement le même site.
 *
 * Le thème est posé sur `<html>` **avant le premier paint** par le script inline
 * du `<head>` — voir `THEME_BOOT`. Un `onMount` s'exécute après, et un visiteur
 * en sombre prendrait un flash clair à chaque chargement de page.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "glyph:theme";

/** Les fonds de `app.css`, dupliqués ici pour la barre d'adresse mobile. */
const THEME_COLOR: Record<Theme, string> = { light: "#eff0f1", dark: "#0e1013" };

/**
 * À recopier tel quel dans le `<head>` de chaque `index.html`, en `<script>`
 * inline et non en module — un module est différé, donc exécuté après le paint,
 * ce qui est exactement le flash qu'on évite.
 *
 * Exporté pour que la duplication soit au moins traçable : le HTML ne peut pas
 * importer de TypeScript, donc ces cinq lignes existent forcément en double.
 */
export const THEME_BOOT = `(function () {
  var t = localStorage.getItem("glyph:theme") || "light";
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')
    .setAttribute("content", t === "dark" ? "#0e1013" : "#eff0f1");
})();`;

/** Le thème courant, lu sur `<html>` — le script du `<head>` l'y a déjà posé. */
export function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Bascule, persiste, et met à jour la couleur de la barre d'adresse. */
export function toggleTheme(): Theme {
  const next: Theme = readTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // navigation privée verrouillée : la bascule marche, elle ne survit pas
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[next]);
  return next;
}

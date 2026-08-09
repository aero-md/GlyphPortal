/**
 * Réglages valables pour les cinq pages.
 *
 * `prerender` : tout est calculé au build et part en fichiers sur le Pi. C'est
 * ce que faisaient déjà les cinq builds Vite, en cinq fois.
 *
 * `ssr` désactivé, et c'est un choix, pas un oubli. Les quatre préviews sont des
 * canvas : leur contenu n'existe qu'une fois le premier `requestAnimationFrame`
 * passé, et il n'y a rien à rendre côté serveur qu'une page vide. Le sommaire,
 * lui, aurait du texte à pré-rendre, mais il porte la bascule de thème — qui lit
 * `data-theme` sur `<html>`, posé par le script du `<head>` au chargement. Rendu
 * côté serveur, ce composant afficherait « Clair » à un visiteur en sombre
 * jusqu'à l'hydratation.
 *
 * Le HTML livré est donc la coquille que servait déjà le monorepo : aucune
 * régression, et le SSR reste à une ligne d'ici le jour où la bascule saura se
 * passer du DOM.
 */
export const prerender = true;
export const ssr = false;

/**
 * Les URL gardent leur barre finale — `/glyphcast/` et non `/glyphcast`.
 *
 * Ce n'est pas une préférence d'écriture : c'est ce que servait déjà le
 * monorepo, où chaque app était un dossier portant son `index.html`. Sans ce
 * réglage, le pré-rendu écrit `glyphcast.html` à plat, `/glyphcast/` ne
 * correspond plus à rien, et Caddy renvoie ces visiteurs-là au sommaire —
 * silencieusement, avec un code 200. Tout lien existant vers une préview
 * tomberait à côté.
 */
export const trailingSlash = "always";

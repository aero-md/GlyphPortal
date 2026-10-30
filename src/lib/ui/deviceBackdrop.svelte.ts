/**
 * Le fond d'écran suit l'appareil **affiché**, pas la préférence stockée : une
 * page qui force Phone (3) (voir `resolveDevice`) montre le fond de Phone (3)
 * même si le visiteur a retenu Phone (4a) Pro.
 *
 * L'appareil est posé en attribut sur `<html>` et c'est le CSS qui choisit
 * l'image — voir `.bg` dans `app.css`. Chaque page appelle ceci une fois, avec
 * l'appareil qu'elle montre ; la mise à jour suit le sélecteur.
 */

import type { DeviceId } from "../matrix/devices";

export function syncBackdrop(id: () => DeviceId): void {
  $effect(() => {
    document.documentElement.dataset.device = id();
  });
}

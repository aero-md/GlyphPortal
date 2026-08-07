/**
 * @glyph/kit — le noyau commun aux préviews de Glyph Toys.
 *
 * Ce que le paquet garantit, et qui justifie qu'il existe : **une seule
 * géométrie**. Le hublot de la Glyph Matrix a été relevé une fois, dans les
 * pixels de la photo du dos, et vit dans `matrix/devices.ts`. Chaque préview qui
 * gardait sa propre copie de ces six nombres en gardait une version différente,
 * donc au moins une version fausse — c'était le cas des trois qui ont précédé
 * ce paquet.
 *
 * Un toy n'a qu'un contrat à remplir : produire une `Frame`. Le calage sur la
 * photo, l'arrondi de la cellule au pixel physique, la taille de LED par
 * appareil, le rendu et la coquille de page ne le regardent pas.
 *
 * Les composants s'importent à part — un `.svelte` ne peut pas transiter par un
 * barrel `.ts` :
 *
 *     import { DEVICES, frameOf } from "@glyph/kit";
 *     import Shell from "@glyph/kit/Shell.svelte";
 *     import PreviewPane from "@glyph/kit/PreviewPane.svelte";
 */

export { buildGeometry, type Geometry } from "./matrix/matrix";
export {
  DEFAULT_DEVICE,
  DEVICES,
  deviceById,
  previewBand,
  type Device,
  type DeviceId,
  type Disc,
} from "./matrix/devices";
export { emptyFrame, frameOf, toBytes, type Frame } from "./matrix/frame";
export {
  DISC_BG,
  exportGrid,
  ledMetrics,
  paint,
  screenGrid,
  type Grid,
  type LedStyle,
  type PaintOpts,
} from "./matrix/render";
export { readTheme, toggleTheme, type Theme } from "./ui/theme";

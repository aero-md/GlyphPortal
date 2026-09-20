/**
 * L'appareil préféré, partagé par tout le portail — même principe que le
 * thème et la langue (`glyph:theme`, `glyph:lang` — voir `ui/theme.ts` et
 * `i18n/index.ts`), même préfixe de clé.
 *
 * Une page qui ne sait dessiner qu'un seul appareil (voir `devices` de
 * `Shell`/`PreviewPane`) ne lit ni n'écrit jamais ce réglage : elle force
 * celui qu'elle sait dessiner — `resolveDevice` s'en charge, sans jamais
 * remonter au réglage global. Revenir sur une page libre, ou à l'accueil,
 * retrouve donc le choix du visiteur intact.
 */

import { DEFAULT_DEVICE, DEVICES, type Device, type DeviceId } from "./devices";

export const DEVICE_KEY = "glyph:device";

/** Le réglage global, ou le défaut (Phone (3)) si rien n'est retenu. */
export function readDevicePref(): DeviceId {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && DEVICES.some((d) => d.id === saved)) return saved as DeviceId;
  } catch {
    // navigation privée verrouillée : repli sur le défaut
  }
  return DEFAULT_DEVICE.id;
}

export function setDevicePref(id: DeviceId): void {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // le changement marche, il ne survit pas à la fermeture de l'onglet
  }
}

/**
 * L'appareil à afficher pour une liste d'appareils supportés : le réglage
 * global s'il y figure, sinon le premier de la liste — **sans jamais écrire**
 * le réglage, voir l'en-tête du fichier. C'est ce qui force silencieusement
 * Phone (3) sur les toys qui n'ont pas encore de rendu compact.
 */
export function resolveDevice(supported: Device[] = DEVICES): Device {
  const pref = readDevicePref();
  return supported.find((d) => d.id === pref) ?? supported[0];
}

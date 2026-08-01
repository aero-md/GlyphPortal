/**
 * Sorties : PNG, IntArray Kotlin, JSON de session.
 *
 * Le Glyph Matrix SDK consomme un IntArray(625) row-major de valeurs 0-255 —
 * même contrat que les renderers de GlyphLapse / GlyphSlot.
 */

import { SIZE, CELLS, LED_COUNT } from "./matrix";
import { toBytes, DEFAULTS, type Frame, type Params } from "./pipeline";
import { exportGrid, paint } from "./render";

export const VERSION = "1.0";

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // révoqué après le tick pour laisser au navigateur le temps de lancer le
  // téléchargement — révoquer immédiatement l'annule sur Firefox
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/* -------------------------------------------------------------------------- */

/** PNG carré du disque, 24 px par LED (600 x 600). */
export async function exportPng(frame: Frame): Promise<void> {
  const g = exportGrid(24);
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = g.size;
  paint(cvs.getContext("2d")!, frame, g, { background: "#08080a", glow: true });
  const blob = await new Promise<Blob | null>((r) => cvs.toBlob(r, "image/png"));
  if (blob) download(blob, `glyphcast-${stamp()}.png`);
}

/* -------------------------------------------------------------------------- */

export function toKotlin(frame: Frame, name = "FRAME"): string {
  const b = toBytes(frame);
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: string[] = [];
    for (let x = 0; x < SIZE; x++) row.push(String(b[y * SIZE + x]).padStart(3, " "));
    rows.push("    " + row.join(", ") + (y < SIZE - 1 ? "," : ""));
  }
  return [
    `// GlyphCast ${VERSION} — matrice ${SIZE}x${SIZE} row-major, ${LED_COUNT} LEDs dans le disque.`,
    `// Valeurs 0-255, à passer tel quel au GlyphMatrixFrame / GlyphMatrixManager.`,
    `val ${name} = intArrayOf(`,
    ...rows,
    `)`,
  ].join("\n");
}

export function downloadKotlin(frame: Frame): void {
  download(new Blob([toKotlin(frame)], { type: "text/plain" }), `glyphcast-${stamp()}.kt`);
}

/* -------------------------------------------------------------------------- */

export type Session = {
  format: "glyphcast";
  version: string;
  size: number;
  ledCount: number;
  params: Params;
  values: number[];
};

export function toSession(frame: Frame, params: Params): Session {
  return {
    format: "glyphcast",
    version: VERSION,
    size: SIZE,
    ledCount: LED_COUNT,
    params: { ...params },
    values: Array.from(toBytes(frame)),
  };
}

export function downloadJson(frame: Frame, params: Params): void {
  const json = JSON.stringify(toSession(frame, params), null, 2);
  download(new Blob([json], { type: "application/json" }), `glyphcast-${stamp()}.json`);
}

/**
 * Relit une session. Seules les clés connues sont reprises et les valeurs sont
 * bornées : un JSON édité à la main ne doit pas pouvoir mettre le pipeline
 * dans un état impossible (levels = 0 -> division par zéro).
 */
export function parseSession(text: string): Params {
  const raw = JSON.parse(text);
  if (raw?.format !== "glyphcast") throw new Error("format inconnu");
  const p = raw.params ?? {};
  const num = (k: keyof Params, lo: number, hi: number) => {
    const v = Number(p[k]);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : (DEFAULTS[k] as number);
  };
  return {
    zoom: num("zoom", 0.1, 8),
    offsetX: num("offsetX", -2, 2),
    offsetY: num("offsetY", -2, 2),
    rotation: num("rotation", -180, 180),
    wR: num("wR", -2, 3),
    wG: num("wG", -2, 3),
    wB: num("wB", -2, 3),
    exposure: num("exposure", -3, 3),
    black: num("black", 0, 1),
    white: num("white", 0, 1),
    contrast: num("contrast", -1, 3),
    gamma: num("gamma", 0.2, 3),
    sharpen: num("sharpen", 0, 2),
    invert: Boolean(p.invert),
    levels: Math.round(num("levels", 2, 256)),
    dither: ["none", "floyd", "bayer"].includes(p.dither) ? p.dither : DEFAULTS.dither,
    ditherAmount: num("ditherAmount", 0, 1),
    ceiling: num("ceiling", 0.05, 1),
  };
}

/* -------------------------------------------------------------------------- */

/** Copie dans le presse-papiers, avec repli sur textarea + execCommand. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export { CELLS };

import { mount } from "svelte";
import { init, register, waitLocale } from "svelte-i18n";
import "$lib/app.css";
import App from "./App.svelte";

/* `Preview.svelte` lit `svelte-i18n` pour du texte purement accessible (alt de
   la photo, légendes du Glyph Button) — invisible sur une capture, mais
   `svelte-i18n` lève si aucune langue n'a jamais été posée, ce qui plantait
   le rendu avant même d'atteindre le canvas. Une seule langue suffit ici. */
register("en", () => import("$lib/i18n/locales/en.json"));
init({ fallbackLocale: "en", initialLocale: "en" });
await waitLocale();

mount(App, { target: document.getElementById("app")! });

<script lang="ts">
  /**
   * La marque Haloglyph seule — couronne solaire, sans fond.
   *
   * Miroir de `haloglyph-icon.svg` (source de vérité : l'app Android), moins
   * le carré blanc qui y sert de fond d'icône de lanceur. Ici la marque est
   * posée à même la tuile du sommaire, pas dans un hublot : un fond plein — a
   * fortiori un disque noir façon dos d'appareil — mentirait, Haloglyph
   * n'étant ni un toy qui s'allume ni un appareil qu'on regarde par un verre.
   *
   * 12 rayons (9 pleins + 3 accent), pas 16 : version épaissie retenue côté
   * app (hw=15 contre 11), noyau vide r=68 inchangé.
   *
   * Les rayons suivent le thème plutôt que de garder les couleurs figées de
   * l'app : `--ink` (noir en clair, blanc en sombre) pour les neuf pleins,
   * `--accent` (rouge en clair, le même rouge adouci en sombre) pour le
   * quadrant qui porte l'accent — les deux jetons existent déjà dans
   * `app.css` pour exactement cette bascule.
   */
  type Props = {
    /** Côté du carré porteur, en px CSS. */
    size?: number;
  };

  let { size = 96 }: Props = $props();
</script>

<svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true">
  <g fill="var(--ink)">
    <path d="M271 188L271 159A15 15 0 0 0 241 159L241 188Z" />
    <path d="M307.39 302.99L332.50 317.49A15 15 0 0 0 347.50 291.51L322.39 277.01Z" />
    <path d="M277.01 322.39L308.51 376.95A15 15 0 0 0 334.49 361.95L302.99 307.39Z" />
    <path d="M241 324L241 353A15 15 0 0 0 271 353L271 324Z" />
    <path d="M209.01 307.39L177.51 361.95A15 15 0 0 0 203.49 376.95L234.99 322.39Z" />
    <path d="M189.61 277.01L164.50 291.51A15 15 0 0 0 179.50 317.49L204.61 302.99Z" />
    <path d="M188 241L125 241A15 15 0 0 0 125 271L188 271Z" />
    <path d="M204.61 209.01L179.50 194.51A15 15 0 0 0 164.50 220.49L189.61 234.99Z" />
    <path d="M234.99 189.61L203.49 135.05A15 15 0 0 0 177.51 150.05L209.01 204.61Z" />
  </g>
  <g fill="var(--accent)">
    <path d="M302.99 204.61L334.49 150.05A15 15 0 0 0 308.51 135.05L277.01 189.61Z" />
    <path d="M322.39 234.99L347.50 220.49A15 15 0 0 0 332.50 194.51L307.39 209.01Z" />
    <path d="M324 271L387 271A15 15 0 0 0 387 241L324 241Z" />
  </g>
</svg>

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
   * 10 fers de lance (7 pleins + 3 accent), tournés de 15°, largeur 40 à la
   * base et pointes à 130 / 164 : version retenue côté app. Noyau vide r=68
   * inchangé.
   *
   * Les rayons suivent le thème plutôt que de garder les couleurs figées de
   * l'app : `--ink` (noir en clair, blanc en sombre) pour les huit pleins,
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
    <path d="M302.14 309.81L349.1 340.31L393.54 345.32L370.89 306.76L323.92 276.26Z" />
    <path d="M261.7 326.65L269.58 347.19L302.59 377.37L306.92 332.85L299.04 312.32Z" />
    <path d="M219.08 316.51L204.59 370.6L213.55 414.41L243.22 380.95L257.72 326.86Z" />
    <path d="M190.57 283.25L173.47 297.1L154.97 337.81L198.64 328.18L215.74 314.34Z" />
    <path d="M187.05 239.59L131.12 242.52L92.22 264.58L133.22 282.46L189.14 279.53Z" />
    <path d="M209.86 202.19L191.41 190.21L146.97 185.2L169.63 223.76L188.08 235.74Z" />
    <path d="M250.3 185.35L230.23 133.07L197.23 102.89L192.89 147.4L212.96 199.68Z" />
  </g>
  <g fill="var(--accent)">
    <path d="M292.92 195.49L298.61 174.24L289.65 130.43L259.98 163.89L254.28 185.14Z" />
    <path d="M321.43 228.75L364.95 193.51L383.45 152.79L339.78 162.42L296.26 197.66Z" />
    <path d="M324.95 272.41L346.92 271.26L385.82 249.2L344.83 231.32L322.86 232.47Z" />
  </g>
</svg>

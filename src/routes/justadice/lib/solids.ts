/**
 * Les quatre dés, comme **solides** : d4, d6, d8, d10.
 *
 * Rien ici n'est dessiné. Un dé est une liste de faces, chacune avec son plan,
 * son centre, ses marques et sa valeur — le rendu ne fait que couper des rayons
 * contre ces plans et tamponner ces marques. C'est ce qui permet d'ajouter un
 * solide sans toucher au rendu : un maillage de plus dans ce fichier, et le
 * reste suit.
 *
 * Chaque solide est décrit par ses **sommets et ses faces**, pas par ses plans.
 * Les plans, les centres, les rayons et les tangentes en sont dérivés : écrire
 * dix normales à la main pour un d10, c'est écrire dix occasions de se tromper
 * d'un signe, et un signe faux sur une normale fait un dé qu'on voit de
 * l'intérieur.
 *
 * Deux façons de marquer une face, et c'est celle des vrais dés : **le d6 porte
 * des pips, les autres un chiffre**. Personne ne compte huit points sur un
 * triangle, et un jeu de dés du commerce ne le demande à personne.
 */

/* --------------------------------- vecteurs -------------------------------- */

export type Vec3 = [number, number, number];

export const UP: Vec3 = [0, 1, 0];

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Longueur, par la racine de la somme des carrés et **non par `Math.hypot`**.
 *
 * `hypot` est le choix normal : il évite le débordement quand les composantes sont
 * énormes ou minuscules. Ici elles vivent dans [−2, 2], le débordement n'existe
 * pas, et `hypot` coûte une chose qui compte davantage : il n'est pas **reproductible
 * d'une plateforme à l'autre**. La norme lui demande d'être juste à un ulp près,
 * pas d'être exact, et chacun l'implémente à sa façon — `Math.hypot(x, y, z)` en
 * JS, `hypot(hypot(x, y), z)` sur la JVM ne donnent pas les mêmes derniers bits.
 *
 * Ça s'est vu, et exactement là où le port se compare au prototype : les normales
 * du dodécaèdre différaient de 1e−16, ce qui a suffi à faire basculer **deux
 * cellules** de la pose de repos d'une face à sa voisine — une arête presque
 * verticale qui passait pile au centre de ces cellules. La multiplication et la
 * racine, elles, sont exactes au bit près dans IEEE 754 : même expression, même
 * ordre, même résultat partout.
 */
export const len = (v: Vec3) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

export function norm(v: Vec3): Vec3 {
  const n = len(v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/* ---------------------------------- pips ----------------------------------- */

/**
 * Les six motifs du d6, en fractions de la demi-arête de la face.
 *
 * Le 6 écarte ses rangées à 0,56 plutôt que 0,52 : à trois rangées le pas est
 * plus serré qu'à deux, et sans cet écart les taches du gros plan se touchent.
 */
const PIPS: readonly (readonly [number, number][])[] = [
  [],
  [[0, 0]],
  [
    [-0.52, -0.52],
    [0.52, 0.52],
  ],
  [
    [-0.52, -0.52],
    [0, 0],
    [0.52, 0.52],
  ],
  [
    [-0.52, -0.52],
    [0.52, -0.52],
    [-0.52, 0.52],
    [0.52, 0.52],
  ],
  [
    [-0.52, -0.52],
    [0.52, -0.52],
    [0, 0],
    [-0.52, 0.52],
    [0.52, 0.52],
  ],
  [
    [-0.52, -0.56],
    [-0.52, 0],
    [-0.52, 0.56],
    [0.52, -0.56],
    [0.52, 0],
    [0.52, 0.56],
  ],
];

/* --------------------------------- le solide ------------------------------- */

export type Face = {
  /** Normale unitaire, sortante. */
  n: Vec3;
  /** Distance du centre du dé au plan de la face. */
  d: number;
  /** Centre visuel — barycentre des sommets. C'est là que se pose la marque. */
  c: Vec3;
  /** Rayon inscrit dans la face, depuis `c`. Dit quelle taille de marque tient. */
  inr: number;
  /** La valeur portée par la face, 1..faces. */
  value: number;
  /** Le nombre imprimé, vide si la face porte des pips. Deux chiffres au dix. */
  glyph: string;
  /** Centres des pips dans le repère du dé. Vide sur une face chiffrée. */
  pips: Vec3[];
};

/**
 * Le jeu retenu : celui d'un joueur de rôle, moins les deux dés dont personne ne
 * se sert seul. Le d4 et le d8 y étaient au départ, et sont partis ensemble — le
 * premier ne peut pas se lire « la face du dessus » puisqu'un tétraèdre posé
 * présente un sommet en l'air, le second n'a jamais rien apporté que le d6 et le
 * d10 n'aient déjà.
 */
export type DieId = "d6" | "d10" | "d12" | "d20";

export type Die = {
  id: DieId;
  /** Nombre de faces — et donc plage du tirage. */
  faces: number;
  /** Nom du solide, pour le rack. */
  solid: string;
  /**
   * Demi-champ de la caméra au gros plan, en unités de dé.
   *
   * Par dé et non partagé : à taille de solide égale, la face d'un icosaèdre est
   * deux fois plus petite que celle d'un cube, et un gros plan commun révélerait un
   * triangle perdu au milieu du hublot. Réglé pour que la face déborde d'environ
   * 10 % — ce qui dit « on est dessus » — et que le nombre tienne dans le cercle
   * inscrit de la face.
   */
  close: number;
  /**
   * Nombre de poses de repos équivalentes pour une face donnée, par rotation
   * autour de sa normale. Quatre pour un carré, trois pour un triangle, une pour
   * le cerf-volant d'un d10, qui n'a aucune symétrie de rotation.
   *
   * Ça ne sert qu'à varier la pose : la marque, elle, est tamponnée à l'écran et
   * reste droite quelle que soit la pose.
   */
  spin: number;
  face: Face[];
};

/**
 * Tous les solides sont ramenés au **même rayon circonscrit**, celui du cube.
 *
 * C'est la silhouette en vol qu'on égalise, pas la face : le cadrage large est
 * commun aux quatre dés, et un solide qui dépasserait se ferait rogner par la
 * découpe du hublot. La taille des faces, elle, se rattrape dé par dé au gros
 * plan — voir `close`.
 */
const REACH = Math.sqrt(3);

type Mesh = {
  verts: Vec3[];
  /** Sommets de chaque face. L'ordre importe peu : la normale est réorientée. */
  faces: number[][];
};

/* -------------------------------------------------------------------------- */

/** Cube : les huit coins de ±1. */
const CUBE: Mesh = {
  verts: [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ],
  faces: [
    [4, 5, 6, 7], // +Z
    [1, 0, 3, 2], // −Z
    [5, 1, 2, 6], // +X
    [0, 4, 7, 3], // −X
    [7, 6, 2, 3], // +Y
    [0, 1, 5, 4], // −Y
  ],
};

/**
 * Les valeurs du d6, posées à la main et pas déduites.
 *
 * C'est un dé occidental : faces opposées à sept, et avec le 1 en haut et le 2
 * vers soi, le 3 tombe à droite. Un appariement automatique donnerait aussi des
 * opposées à sept, mais une chiralité tirée de l'ordre des faces — donc un dé
 * juste une fois sur deux, sans qu'on sache laquelle.
 */
const CUBE_VALUES = [2, 5, 3, 4, 1, 6];

/* ---------------------- les deux grands réguliers -------------------------- */

const PHI = (1 + Math.sqrt(5)) / 2;

/** Icosaèdre : trois rectangles d'or emboîtés, douze sommets. */
function icosaVerts(): Vec3[] {
  const out: Vec3[] = [];
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      out.push([0, s, t * PHI], [s, t * PHI, 0], [t * PHI, 0, s]);
    }
  }
  return out;
}

/**
 * Dodécaèdre : les huit coins d'un cube, plus trois rectangles d'or.
 *
 * L'ordre des coordonnées n'est pas indifférent. Les deux jeux de sommets doivent
 * être **duaux l'un de l'autre dans la même pose**, et pas seulement à une
 * rotation près : ici le grand côté du rectangle est en `y` là où l'icosaèdre le
 * met en `z`. Écrit dans l'autre sens — le plus naturel à taper — les directions
 * de faces tombaient sur des sommets, et `fromDual` ne trouvait qu'un sommet par
 * face au lieu de cinq. C'est exactement ce que son contrôle est là pour dire.
 */
function dodecaVerts(): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) out.push([x, y, z]);
  const i = 1 / PHI;
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      out.push([0, s * PHI, t * i], [s * PHI, t * i, 0], [t * i, 0, s * PHI]);
    }
  }
  return out;
}

/**
 * Le maillage d'un solide dont on connaît les sommets et les **directions de
 * faces**, sans lister une seule face à la main.
 *
 * Pour un dodécaèdre il faudrait douze pentagones, soit soixante indices écrits
 * dans le bon ordre ; pour un icosaèdre, vingt triangles. Personne ne relit ça, et
 * une seule permutation donne une face retournée qu'on ne verra qu'en jouant.
 *
 * La direction d'une face suffit à la retrouver : les sommets de la face sont ceux
 * qui vont **le plus loin** dans cette direction, et ils sont tous à la même
 * distance puisque le solide est régulier. Restent à les mettre en cercle, ce que
 * fait un tri par angle autour du centre de la face.
 *
 * Et les directions ne s'écrivent pas non plus : ce sont les sommets du **dual**.
 * Les faces d'un icosaèdre regardent vers les sommets d'un dodécaèdre, et
 * réciproquement — les deux listes de sommets se suffisent l'une à l'autre.
 */
function fromDual(verts: Vec3[], dirs: Vec3[], expect: number): Mesh {
  const faces = dirs.map((dir) => {
    const n = norm(dir);
    const far = Math.max(...verts.map((v) => dot(v, n)));
    const on: number[] = [];
    verts.forEach((v, i) => {
      if (Math.abs(dot(v, n) - far) < 1e-9) on.push(i);
    });
    if (on.length !== expect) {
      throw new Error(`face à ${on.length} sommets, ${expect} attendus`);
    }
    const c = centroid(verts, on);
    const u = norm(sub(verts[on[0]], c));
    const w = cross(n, u);
    return on
      .map((i) => {
        const r = sub(verts[i], c);
        return { i, a: Math.atan2(dot(r, w), dot(r, u)) };
      })
      .sort((p, q) => p.a - q.a)
      .map((p) => p.i);
  });
  return { verts, faces };
}

/**
 * Trapézoèdre pentagonal — le d10, dix cerfs-volants.
 *
 * Deux couronnes de cinq sommets décalées d'un dixième de tour, plus deux
 * pointes sur l'axe. Chaque face joint une pointe, deux sommets voisins de sa
 * couronne, et le sommet de l'autre couronne qui s'insère entre eux.
 *
 * La proportion n'est pas libre : pour que les quatre coins d'un cerf-volant
 * soient **coplanaires**, il faut `h/c = (K + sin2φ) / (K − sin2φ)`, avec
 * `φ = 36°` et `K = sin2φ·cosφ + (1−cos2φ)·sinφ` — soit environ 9,47. Le rayon
 * `r`, lui, reste libre : l'étirer radialement est une application linéaire, et
 * une application linéaire envoie un plan sur un plan. C'est ce qui fait des
 * trapézoèdres une famille à un paramètre, et `r = 10` donne la silhouette d'un
 * d10 du commerce — un peu plus large que haute.
 */
function trapezohedron(): Mesh {
  const P = Math.PI / 5;
  const S = Math.sin(2 * P);
  const K = S * Math.cos(P) + (1 - Math.cos(2 * P)) * Math.sin(P);
  const c = 1;
  const h = (c * (K + S)) / (K - S);
  const r = 10;

  const verts: Vec3[] = [
    [0, h, 0],
    [0, -h, 0],
  ];
  for (let k = 0; k < 5; k++) verts.push([r * Math.cos(2 * P * k), c, r * Math.sin(2 * P * k)]);
  for (let k = 0; k < 5; k++)
    verts.push([r * Math.cos(2 * P * k + P), -c, r * Math.sin(2 * P * k + P)]);

  const U = (k: number) => 2 + (k % 5);
  const L = (k: number) => 7 + (k % 5);
  const faces: number[][] = [];
  for (let k = 0; k < 5; k++) faces.push([0, U(k), L(k), U(k + 1)]);
  for (let k = 0; k < 5; k++) faces.push([1, L(k), U(k + 1), L(k + 1)]);
  return { verts, faces };
}

/* -------------------------------- fabrication ------------------------------ */

/** Barycentre des sommets d'une face. */
function centroid(verts: Vec3[], f: number[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const i of f) {
    c[0] += verts[i][0];
    c[1] += verts[i][1];
    c[2] += verts[i][2];
  }
  return [c[0] / f.length, c[1] / f.length, c[2] / f.length];
}

/** Rayon du cercle inscrit : la plus courte distance du centre à une arête. */
function inradius(verts: Vec3[], f: number[], c: Vec3): number {
  let best = Infinity;
  for (let i = 0; i < f.length; i++) {
    const a = verts[f[i]];
    const b = verts[f[(i + 1) % f.length]];
    const e = sub(b, a);
    const gap = len(cross(sub(c, a), e)) / (len(e) || 1);
    if (gap < best) best = gap;
  }
  return best;
}

/**
 * Apparie les faces opposées et distribue les valeurs pour que deux opposées
 * somment à `faces + 1`.
 *
 * Les quatre solides retenus ont tous leurs faces par paires parallèles, donc
 * l'appariement aboutit toujours. Une forme qui n'en aurait pas — un tétraèdre —
 * prendrait ses valeurs dans l'ordre, sans que rien ne casse.
 */
function assignValues(planes: { n: Vec3 }[], faces: number): number[] {
  const value = new Array<number>(planes.length).fill(0);
  let next = 1;
  for (let i = 0; i < planes.length; i++) {
    if (value[i]) continue;
    value[i] = next;
    const anti = planes.findIndex(
      (p, j) => j !== i && !value[j] && dot(p.n, planes[i].n) < -0.999,
    );
    if (anti >= 0) value[anti] = faces + 1 - next;
    next++;
  }
  return value;
}

function build(
  id: DieId,
  solid: string,
  mesh: Mesh,
  close: number,
  spin: number,
  values?: number[],
): Die {
  const count = mesh.faces.length;

  // Mise à l'échelle par le rayon circonscrit, avant tout le reste.
  const scale = REACH / Math.max(...mesh.verts.map(len));
  const verts: Vec3[] = mesh.verts.map((v) => [v[0] * scale, v[1] * scale, v[2] * scale]);

  const raw = mesh.faces.map((f) => {
    const c = centroid(verts, f);
    let n = norm(cross(sub(verts[f[1]], verts[f[0]]), sub(verts[f[2]], verts[f[0]])));
    // Le centre du dé est à l'intérieur : une normale sortante regarde du même
    // côté que n'importe quel sommet de sa face.
    if (dot(n, verts[f[0]]) < 0) n = [-n[0], -n[1], -n[2]];
    return { n, d: dot(n, verts[f[0]]), c, inr: inradius(verts, f, c), f };
  });

  const value = values ?? assignValues(raw, count);

  const face: Face[] = raw.map((r, i) => {
    const v = value[i];
    /* Les pips ne concernent que le d6 : sa face est un carré, donc une base
       tangente prise sur une arête, et une demi-arête pour unité. */
    let pips: Vec3[] = [];
    if (count === 6) {
      const e = sub(verts[r.f[1]], verts[r.f[0]]);
      const half = len(e) / 2;
      const u = norm(e);
      const w = cross(r.n, u);
      pips = PIPS[v].map(([a, b]) => [
        r.c[0] + (a * u[0] + b * w[0]) * half,
        r.c[1] + (a * u[1] + b * w[1]) * half,
        r.c[2] + (a * u[2] + b * w[2]) * half,
      ]);
    }
    return {
      n: r.n,
      d: r.d,
      c: r.c,
      inr: r.inr,
      value: v,
      /* Le dix s'écrit `10`, et pas `0` comme sur un dé du commerce.
         La convention du `0` marche sur un objet qu'on tient : les neuf autres
         faces sont là pour dire de quoi il s'agit. Ici on ne voit **qu'une face à
         la fois**, en gros plan, et un `0` seul annonce alors une valeur que le dé
         ne peut pas faire. Le prix est payé en taille : deux chiffres ne tiennent
         dans le cerf-volant qu'à la police non dilatée, donc le dix s'affiche plus
         petit que le sept. C'est la lisibilité du nombre qui tranche, pas
         l'uniformité du dessin. */
      glyph: count === 6 ? "" : String(v),
      pips,
    };
  });

  return { id, faces: count, solid, close, spin, face };
}

/* -------------------------------------------------------------------------- */

/* Les `close` sont réglés dé par dé, et le critère n'est pas seulement « la face
   remplit le hublot » : c'est **le nombre en grand qui décide**. Le rendu ne
   dispose que de trois tailles de glyphe — voir `STEPS` dans `render.ts` — et le
   passage de l'une à l'autre se joue sur une comparaison. Réglé au ras du seuil, un
   solide retombe d'un cheveu sur la petite taille et révèle un 1 de sept cellules
   au milieu d'un hublot de vingt-cinq. Chaque valeur garde donc une marge nette
   au-dessus du seuil, quitte à zoomer plus fort et à laisser les coins de la face
   sortir du hublot — ce qui dit de toute façon qu'on est dessus.

   Le d6 est le seul dont le réglage ne dépende pas d'un nombre, puisqu'il porte
   des pips : 1,30 lui fait un carré qui déborde d'un dixième, et c'est le cadrage
   sur lequel tout le reste a été réglé.

   Les deux grands en demandent plus, et pour la même raison : à rayon circonscrit
   égal, la face d'un icosaèdre fait la moitié de celle d'un cube. Il faut donc
   s'approcher davantage — et sur ces deux-là, les valeurs à deux chiffres passent
   en petite police là où les chiffres seuls restent en grande, comme le dix du d10
   depuis toujours. */
export const DICE: Die[] = [
  build("d6", "cube", CUBE, 1.3, 4, CUBE_VALUES),
  build("d10", "trapézoèdre", trapezohedron(), 1.06, 1),
  build("d12", "dodécaèdre", fromDual(dodecaVerts(), icosaVerts(), 5), 1.24, 5),
  build("d20", "icosaèdre", fromDual(icosaVerts(), dodecaVerts(), 3), 0.9, 3),
];

/* Le d6, et par son identité plutôt que par son rang : c'est le dé dont tout le
   monde connaît les faces, pas celui qui se trouve en tête de liste. */
const d6 = DICE.find((d) => d.id === "d6");
if (!d6) throw new Error("le d6 a disparu du jeu");
export const DEFAULT_DIE = d6;

export function dieById(id: unknown): Die {
  return DICE.find((d) => d.id === id) ?? DEFAULT_DIE;
}

<script lang="ts">
  import type { Snippet } from "svelte";

  /* Bloc de la fiche technique : référence numérotée + titre + compteur.
     La référence encode l'ordre réel de la chaîne de traitement, elle n'est
     pas décorative. */
  type Props = {
    ref: string;
    title: string;
    /** Valeur d'état affichée à droite du titre (compteur, mode actif…). */
    stat?: string;
    /** Grise et neutralise le contenu — un réglage qui n'a rien à régler.
        `inert` plutôt qu'un `disabled` sur chaque contrôle : ça sort aussi la
        carte de l'ordre de tabulation, ce que quinze `disabled` ne feraient
        qu'à condition de n'en oublier aucun. L'en-tête reste net, la structure
        numérotée doit rester lisible même verrouillée. */
    locked?: boolean;
    children: Snippet;
  };

  let { ref, title, stat, locked = false, children }: Props = $props();
</script>

<section class="card">
  <header>
    <span class="ref">[{ref}]</span>
    <h2>{title}</h2>
    {#if stat}<span class="stat">{stat}</span>{/if}
  </header>
  <div class="body" class:locked inert={locked}>
    {@render children()}
  </div>
</section>

<style>
  .card {
    border: 1px solid var(--line);
    background: var(--bg);
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--line);
  }

  .ref {
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--accent);
  }

  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .stat {
    margin-left: auto;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
    white-space: nowrap;
  }

  .body {
    padding: 0.85rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* assez pâle pour se lire comme éteint, assez lisible pour qu'on voie quels
     réglages attendent — c'est aussi ce qui donne envie de charger l'image */
  .body.locked {
    opacity: 0.32;
  }
</style>

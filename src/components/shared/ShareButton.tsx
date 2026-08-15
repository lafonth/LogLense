'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

type CopyState = 'idle' | 'copied' | 'failed';

const LABELS: Record<CopyState, string> = {
  idle: 'Copy link',
  copied: '✓ Link copied',
  failed: 'Copy failed',
};

/** Combien de temps la confirmation reste à l'écran avant que le bouton redevienne un bouton. */
const RESET_MS = 2500;

/**
 * Copie l'URL courante, marquée comme lien de partage.
 *
 * L'URL est déjà la source de vérité de l'écran — elle porte le personnage ou le rapport, la
 * difficulté, la spec et le boss vu. Ce qui manquait n'était pas l'adresse mais le geste : rien
 * n'indiquait qu'elle valait d'être partagée, et l'ouvrir rejouait tout le pipeline.
 *
 * La marque `shared=1` n'est pas une frontière de sécurité — la forger n'ouvre rien, le
 * destinataire doit être connecté comme n'importe quel autre appelant, et il pourrait de toute
 * façon lancer l'analyse lui-même. Elle dit seulement au serveur que cette ouverture-ci accepte
 * l'instantané du rendu partagé plutôt qu'un calcul neuf. Sans elle, un raideur qui relance son
 * analyse pendant la soirée verrait la pull d'il y a deux heures.
 */
export function ShareButton() {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(setState, RESET_MS, 'idle');
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('shared', '1');
      // `navigator.clipboard` est absent hors contexte sécurisé, et son refus est une promesse
      // rejetée : les deux mènent au même aveu plutôt qu'à une confirmation mensongère.
      await navigator.clipboard.writeText(url.toString());
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  // L'échec se dit dans le libellé, pas dans une couleur : `text-danger` posé en `className`
  // sur cette primitive entre en concurrence avec le `text-text` de sa variante, et Tailwind
  // départage les deux par leur ordre dans la feuille générée. Le rouge partirait au hasard.
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => void copy()}
      aria-live="polite"
      className="font-mono text-xs"
    >
      {LABELS[state]}
    </Button>
  );
}

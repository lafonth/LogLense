'use client';

import { useState } from 'react';
import { abilityIconUrl } from '@/lib/wcl/icons';

interface SpellIconProps {
  /**
   * Le nom de la capacité. Il n'est jamais rendu ici — le texte qui suit l'icône le porte
   * déjà — mais il sert de clé de repli quand `icon` manque.
   */
  name: string;
  /** Le fichier d'icône que WCL a rendu. Absent, la pastille neutre prend sa place. */
  icon?: string;
  size?: 'sm' | 'md';
}

const SIZES: Record<'sm' | 'md', string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
};

/**
 * L'icône d'un sort, avec sa pastille de repli.
 *
 * **Le repli n'est pas décoratif, il est la raison d'être de cette primitive.** Trois cas le
 * déclenchent, et aucun n'est une anomalie : une aura de raid ou un talent passif n'a pas de
 * ligne dans les tables WCL, un instantané écrit avant que le parse ne garde `abilityIcon`
 * est relu tel quel pendant 24 h, et l'hôte d'assets peut refuser un fichier. Dans les trois,
 * on rend une pastille neutre — jamais l'image cassée du navigateur, dont le glyphe crie
 * l'erreur là où il n'y en a pas.
 *
 * L'icône est purement redondante : le nom du sort est toujours à côté, en texte. Elle est
 * donc `aria-hidden`, et rien n'est perdu pour un lecteur d'écran.
 */
export function SpellIcon({ name, icon, size = 'sm' }: SpellIconProps) {
  const [failed, setFailed] = useState(false);
  const url = abilityIconUrl(icon);

  return (
    <span
      className={`bg-surface-raised border-border inline-block shrink-0 overflow-hidden rounded-xs border align-[-0.2em] ${SIZES[size]}`}
      aria-hidden="true"
    >
      {url && !failed && (
        // `next/image` ferait passer chaque vignette de 56 px par notre optimiseur : un
        // aller-retour serveur par sort, pour un fichier que l'hôte de WCL sert déjà en cache.
        // eslint-disable-next-line next/no-img-element -- voir ci-dessus
        <img
          src={url}
          alt=""
          title={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

interface BadgeProps {
  pct: number;
  size?: 'sm' | 'md' | 'lg';
}

/*
 * Les paliers portent à la fois la couleur et son sens. La couleur seule ne transmet rien à
 * qui ne la voit pas — ni un lecteur d'écran, ni un daltonien sur le couple violet/bleu qui
 * sépare epic de rare. Le nom du palier accompagne donc le chiffre, en `sr-only` : le rendu
 * visuel ne bouge pas, l'annonce devient « 97 percentile, epic ».
 *
 * Les classes sont écrites en toutes lettres parce que Tailwind v4 lit les sources en texte :
 * une classe assemblée par concaténation n'est jamais générée.
 */
const TIERS = [
  { min: 99, name: 'legendary', className: 'text-pct-legendary' },
  { min: 95, name: 'epic', className: 'text-pct-epic' },
  { min: 75, name: 'rare', className: 'text-pct-rare' },
  { min: 50, name: 'uncommon', className: 'text-pct-uncommon' },
  { min: 0, name: 'common', className: 'text-pct-common' },
] as const;

function tierOf(pct: number): (typeof TIERS)[number] {
  return TIERS.find((tier) => pct >= tier.min) ?? TIERS[TIERS.length - 1];
}

const SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-2xs px-2 py-1',
  md: 'text-xs px-2 py-1',
  lg: 'text-base px-3 py-1',
};

export function Badge({ pct, size = 'md' }: BadgeProps) {
  const tier = tierOf(pct);

  return (
    <span
      className={`${tier.className} rounded-xs border border-current font-mono font-semibold ${SIZES[size]}`}
    >
      {pct}
      <span className="sr-only"> percentile, {tier.name}</span>
    </span>
  );
}

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../Badge';

describe('badge', () => {
  it('shows the percentile as a number', () => {
    render(<Badge pct={97} />);

    expect(screen.getByText('97')).toBeInTheDocument();
  });

  // La couleur porte le palier, et la couleur seule n'arrive ni à un lecteur d'écran ni à un
  // daltonien sur le couple violet/bleu qui sépare epic de rare. Le nom du palier double donc
  // la teinte, sans apparaître à l'écran.
  it.each([
    [100, 'legendary'],
    [99, 'legendary'],
    [98, 'epic'],
    [95, 'epic'],
    [94, 'rare'],
    [75, 'rare'],
    [74, 'uncommon'],
    [50, 'uncommon'],
    [49, 'common'],
    [0, 'common'],
  ])('announces %i as %s', (pct, tier) => {
    const { container } = render(<Badge pct={pct} />);

    expect(container.textContent).toBe(`${pct} percentile, ${tier}`);
  });

  it('colours each tier with its own token class', () => {
    const { container } = render(<Badge pct={97} />);

    expect(container.firstElementChild?.className).toContain('text-pct-epic');
  });

  it('sizes the badge without letting the caller override it', () => {
    // Une taille passée en `className` serait départagée par l'ordre de la feuille générée,
    // pas par la chaîne : la primitive garde donc la main sur ses trois tailles.
    const { container } = render(<Badge pct={97} size="lg" />);

    expect(container.firstElementChild?.className).toContain('text-base');
    expect(container.firstElementChild?.className).not.toContain('text-xs');
  });
});

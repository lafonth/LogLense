import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExternalLink } from '../ExternalLink';

describe('externalLink', () => {
  it('ouvre un onglet neuf sans donner de poignée sur la page', () => {
    render(
      <ExternalLink href="https://www.warcraftlogs.com/reports/abc#fight=1">Log</ExternalLink>
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://www.warcraftlogs.com/reports/abc#fight=1');
    expect(link).toHaveAttribute('target', '_blank');
    // `noopener` est la partie qu'on oublie en recopiant un `<a>` : sans elle, la page
    // ouverte garde `window.opener` sur la nôtre.
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('annonce la sortie à qui ne voit pas la flèche', () => {
    render(<ExternalLink href="https://example.com">Log</ExternalLink>);

    expect(screen.getByRole('link', { name: /opens in a new tab/ })).toBeInTheDocument();
  });

  it('porte un anneau de focus', () => {
    render(<ExternalLink href="https://example.com">Log</ExternalLink>);

    expect(screen.getByRole('link')).toHaveClass('focus-visible:outline-2');
  });

  it('s’efface quand l’adresse a été refusée', () => {
    const { container } = render(<ExternalLink href={null}>Log</ExternalLink>);

    expect(screen.queryByRole('link')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});

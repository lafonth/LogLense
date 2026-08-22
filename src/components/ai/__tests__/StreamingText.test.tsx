import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StreamingText } from '../StreamingText';

describe('streamingText', () => {
  it('rend un tableau markdown en tableau, et non en pipes littéraux', () => {
    const text = [
      '| Ability | You | Refs |',
      '| --- | ---: | ---: |',
      '| Fireball | 12,000 | 15,000 |',
    ].join('\n');

    const { container } = render(<StreamingText text={text} loading={false} />);

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Ability' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Fireball' })).toBeInTheDocument();
    expect(container.textContent).not.toContain('|');
  });

  it('rend titres, gras et listes', () => {
    const { container } = render(
      <StreamingText
        text={'## Rotation\n\n- Cast **Fireball** first\n- Then Pyroblast'}
        loading={false}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Rotation' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('Fireball');
    expect(container.textContent).not.toContain('**');
  });

  it('met les chiffres en font-mono jusque dans une phrase, sans y mettre la phrase', () => {
    const { container } = render(
      <StreamingText text="You lost 12% of your damage." loading={false} />
    );

    const mono = container.querySelectorAll('.font-mono');
    expect(mono).toHaveLength(1);
    expect(mono[0].textContent).toBe('12%');
    expect(container.querySelector('p')?.className).not.toContain('font-mono');
  });

  it('n’utilise aucun style en ligne — tout passe par les tokens (CLAUDE.md)', () => {
    const { container } = render(
      <StreamingText text={'# T\n\n- a\n\n| a |\n| --- |\n| 1 |'} loading={true} />
    );
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('pose le curseur dans le dernier paragraphe pendant le flux, et rien après', () => {
    const { container, rerender } = render(<StreamingText text="Writing" loading={true} />);
    expect(container.querySelector('p')?.querySelector('.animate-pulse')).not.toBeNull();

    rerender(<StreamingText text="Writing" loading={false} />);
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('pose le curseur hors du flux quand le dernier bloc est un tableau', () => {
    const { container } = render(<StreamingText text={'| a |\n| --- |\n| 1 |'} loading={true} />);
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).not.toBeNull();
    expect(cursor?.closest('table')).toBeNull();
  });

  it('ne rend rien quand le texte est vide', () => {
    const { container } = render(<StreamingText text="" loading={false} />);
    expect(container.querySelector('p')).toBeNull();
  });
});

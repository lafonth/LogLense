import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrollArea } from '../ScrollArea';

describe('scrollArea', () => {
  // Une zone qui défile sans contenir de contrôle focusable est inatteignable au clavier :
  // le tableau des statistiques déborde horizontalement, et rien ne permettait de le faire
  // défiler sans souris.
  it('is a tab stop even when it holds nothing focusable', () => {
    const { container } = render(
      <ScrollArea>
        <table>
          <tbody>
            <tr>
              <td>Crit</td>
            </tr>
          </tbody>
        </table>
      </ScrollArea>
    );

    expect(container.firstElementChild).toHaveAttribute('tabindex', '0');
  });

  it('becomes a named region when the caller says what it holds', () => {
    render(
      <ScrollArea label="Stats">
        <span>content</span>
      </ScrollArea>
    );

    expect(screen.getByRole('region', { name: 'Stats' })).toBeInTheDocument();
  });

  // Sans libellé, une région anonyme encombrerait la liste des points de repère sans rien
  // nommer : mieux vaut un simple conteneur focusable.
  it('stays a plain container when it has no label', () => {
    const { container } = render(
      <ScrollArea>
        <span>content</span>
      </ScrollArea>
    );

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute('aria-label');
  });

  it('keeps a visible focus ring, since the focus lands on the container itself', () => {
    const { container } = render(
      <ScrollArea>
        <span>content</span>
      </ScrollArea>
    );

    expect(container.firstElementChild?.className).toContain('focus-visible:');
  });
});

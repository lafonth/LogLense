import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackLink } from '../BackLink';

describe('backLink', () => {
  it('rend le geste au clic', async () => {
    const onClick = vi.fn();
    render(<BackLink onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: '← Back' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Les quatre copies de ce lien étaient sans anneau : la seule sortie d'un formulaire était
  // invisible à qui navigue au clavier, précisément là où le clavier est le plus utilisé.
  it('porte un anneau de focus, que les quatre copies n’avaient pas', () => {
    render(<BackLink onClick={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveClass('focus-visible:outline-2');
  });

  it('nomme ce qu’on quitte quand l’écran le précise', () => {
    render(<BackLink onClick={vi.fn()}>Modes</BackLink>);

    expect(screen.getByRole('button', { name: '← Modes' })).toBeInTheDocument();
  });
});

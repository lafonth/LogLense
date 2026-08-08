import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from '../ErrorBanner';

describe('errorBanner', () => {
  // Sans `role="alert"`, la bannière apparaît en silence : l'utilisateur d'un lecteur
  // d'écran continue d'attendre un résultat qui a déjà échoué.
  it('announces itself as an alert', () => {
    render(<ErrorBanner message="Warcraft Logs refused the request" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Warcraft Logs refused the request');
  });

  // Le bouton n'apparaît que si l'appelant sait quoi réessayer : une seconde chance qui ne
  // relance rien est pire qu'un message franc.
  it('offers a retry only when the caller can handle one', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorBanner message="Network error" />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

    rerender(<ErrorBanner message="Network error" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

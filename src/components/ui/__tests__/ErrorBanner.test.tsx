import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorBanner } from '../ErrorBanner';

describe('errorBanner', () => {
  // Sans `role="alert"`, la bannière apparaît en silence : l'utilisateur d'un lecteur
  // d'écran continue d'attendre un résultat qui a déjà échoué.
  it('announces itself as an alert', () => {
    render(<ErrorBanner message="Warcraft Logs refused the request" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Warcraft Logs refused the request');
  });
});

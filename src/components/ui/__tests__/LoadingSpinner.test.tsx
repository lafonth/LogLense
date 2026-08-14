import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingScreen } from '../LoadingScreen';
import { LoadingSpinner } from '../LoadingSpinner';

describe('loadingSpinner', () => {
  it('names what is being waited for', () => {
    render(<LoadingSpinner label="Fetching Chimaerus…" />);

    expect(screen.getByText('Fetching Chimaerus…')).toBeInTheDocument();
  });

  // Là où la place manque — un rail de boss large de 200 px — le nom reste porté, seul
  // l'encombrement tombe. Retirer le texte au lieu de le masquer rendrait l'attente muette.
  it('keeps the label for screen readers when there is no room to show it', () => {
    render(<LoadingSpinner label="Loading Fractillus…" labelHidden />);

    expect(screen.getByText('Loading Fractillus…')).toHaveClass('sr-only');
  });

  it('hides the disc itself, which names nothing', () => {
    const { container } = render(<LoadingSpinner label="Loading…" />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  /*
   * Le point qui justifie la séparation en deux composants : la région vive appartient au
   * conteneur, pas au disque. Le rail de boss monte huit spinners de front, et huit régions
   * vives concurrentes noieraient l'annonce au lieu de la porter.
   */
  it('carries no live region of its own', () => {
    render(<LoadingSpinner label="Loading…" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('loadingScreen', () => {
  it('announces the wait, so a blank screen does not pass for a breakdown', () => {
    render(<LoadingScreen />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('lets the caller say what is loading', () => {
    render(<LoadingScreen label="Reading the report…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Reading the report…');
  });
});

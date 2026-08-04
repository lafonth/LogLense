// src/components/ui/__tests__/Sheet.test.tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet } from '../Sheet';

describe('sheet', () => {
  it('renders its children for the desktop layout', () => {
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    expect(screen.getByText('Boss list')).toBeInTheDocument();
  });

  it('keeps the mobile panel closed until the trigger is pressed', () => {
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: /Rotmire/ }).click();
    });

    expect(screen.getByRole('dialog', { name: 'Bosses' })).toBeInTheDocument();
  });
});

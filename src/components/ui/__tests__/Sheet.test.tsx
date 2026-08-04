// src/components/ui/__tests__/Sheet.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('keeps the mobile panel closed until the trigger is pressed', async () => {
    const user = userEvent.setup();
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Rotmire/ }));

    expect(screen.getByRole('dialog', { name: 'Bosses' })).toBeInTheDocument();
  });

  it('closes the panel when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    await user.click(screen.getByRole('button', { name: /Rotmire/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the trigger button after closing', async () => {
    const user = userEvent.setup();
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    const trigger = screen.getByRole('button', { name: /Rotmire/ });
    await user.click(trigger);

    // Focus should have moved into the panel (close button)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    // Close the panel
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Focus should return to trigger
    expect(trigger).toHaveFocus();
  });

  it('closes the panel when a child element is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <button>Select Boss</button>
      </Sheet>
    );

    const trigger = screen.getByRole('button', { name: /Rotmire/ });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Click a child element inside the panel
    const selectBossButton = screen.getAllByRole('button', { name: 'Select Boss' })[0];
    await user.click(selectBossButton);

    // Panel should close
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Focus should return to trigger
    expect(trigger).toHaveFocus();
  });
});

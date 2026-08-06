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

  it('dialog is not a descendant of inert or aria-hidden elements', async () => {
    const user = userEvent.setup();
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    await user.click(screen.getByRole('button', { name: /Rotmire/ }));
    const dialog = screen.getByRole('dialog');

    // Verify dialog is never inside an inert element
    expect(dialog.closest('[inert]')).toBeNull();

    // Verify dialog is never inside an aria-hidden="true" element
    expect(dialog.closest('[aria-hidden="true"]')).toBeNull();
  });

  // jsdom does no painting or hit-testing, so it cannot see that an absolutely
  // positioned backdrop paints over a static sibling and swallows its clicks.
  // A real browser did: every click inside the panel closed the sheet instead of
  // selecting. Assert the stacking structure that keeps the panel reachable.
  it('stacks the panel above the backdrop rather than under it', async () => {
    const user = userEvent.setup();
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    await user.click(screen.getByRole('button', { name: /Rotmire/ }));
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement!.querySelector('[aria-hidden="true"]')!;

    expect(backdrop.className).toContain('absolute');
    // The panel must be positioned too, or the positioned backdrop paints on top.
    expect(dialog.className).toMatch(/\b(relative|absolute|fixed|sticky)\b/);
  });
});

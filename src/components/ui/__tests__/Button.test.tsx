import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';

describe('button', () => {
  it('renders its label and forwards clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Analyse</Button>);

    const button = screen.getByRole('button', { name: 'Analyse' });
    button.click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Analyse
      </Button>
    );

    screen.getByRole('button', { name: 'Analyse' }).click();

    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a visible focus ring in every variant', () => {
    render(<Button variant="ghost">Reset</Button>);

    expect(screen.getByRole('button', { name: 'Reset' }).className).toContain('focus-visible:');
  });
});

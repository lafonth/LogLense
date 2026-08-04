import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { Card } from '../Card';

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

  it('renders with type="button" by default', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('allows type attribute override to "submit"', () => {
    render(<Button type="submit">Submit</Button>);

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toHaveAttribute('type', 'submit');
  });
});

describe('card', () => {
  it('passes through id and aria-* attributes to container', () => {
    render(
      <Card id="test-card" aria-label="Test Card">
        Content
      </Card>
    );

    const section = screen.getByRole('region', { name: 'Test Card' });
    expect(section).toHaveAttribute('id', 'test-card');
    expect(section).toHaveAttribute('aria-label', 'Test Card');
  });
});

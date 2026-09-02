import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SpellIcon } from '../SpellIcon';

describe('spellIcon', () => {
  it('renders the ability art when the fight indexed an icon', () => {
    render(<SpellIcon name="Rip" icon="ability_druid_rip.jpg" />);

    const img = screen.getByTitle('Rip');
    expect(img.getAttribute('src')).toBe(
      'https://assets.rpglogs.com/img/warcraft/abilities/ability_druid_rip.jpg'
    );
  });

  it('falls back to the neutral pill when no icon is known', () => {
    const { container } = render(<SpellIcon name="Overgrowth" />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the neutral pill when the asset host refuses the file', () => {
    const { container } = render(<SpellIcon name="Rip" icon="gone.jpg" />);

    fireEvent.error(screen.getByTitle('Rip'));

    expect(container.querySelector('img')).toBeNull();
  });
});

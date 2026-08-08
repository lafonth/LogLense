import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealmAutocomplete } from '../RealmAutocomplete';

const REALMS = [
  { id: 1, name: 'Hyjal', slug: 'hyjal' },
  { id: 2, name: 'Hyjalor', slug: 'hyjalor' },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(REALMS) }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Ouvre la liste en tapant un préfixe qui correspond aux deux royaumes. */
async function openList() {
  const input = screen.getByRole('combobox');
  await waitFor(() => expect(input).toHaveAttribute('placeholder', 'Search realm…'));
  fireEvent.change(input, { target: { value: 'Hyj' } });
  await screen.findByRole('listbox');
  return input;
}

describe('realmAutocomplete', () => {
  it('announces the list it controls only once it is open', async () => {
    render(<RealmAutocomplete region="eu" value={null} onChange={() => {}} />);

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');

    const input = await openList();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  // Sans les flèches, le seul moyen d'atteindre un royaume au clavier était d'en taper le
  // nom entier — ce que l'autocomplétion est justement censée éviter.
  it('walks the options with the arrows and wraps around', async () => {
    render(<RealmAutocomplete region="eu" value={null} onChange={() => {}} />);
    const input = await openList();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Hyjal' })).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-0'));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Hyjalor' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Hyjal' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reports the highlighted realm on Enter', async () => {
    const onChange = vi.fn();
    render(<RealmAutocomplete region="eu" value={null} onChange={onChange} />);
    const input = await openList();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith({ name: 'Hyjalor', slug: 'hyjalor' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // Entrée sans option mise en avant doit rester la soumission du formulaire : la
  // saisie ne choisit pas à la place de l'utilisateur.
  it('leaves Enter alone when nothing is highlighted', async () => {
    const onChange = vi.fn();
    render(<RealmAutocomplete region="eu" value={null} onChange={onChange} />);
    const input = await openList();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ slug: 'hyjal' }));
  });

  it('closes the list on Escape', async () => {
    render(<RealmAutocomplete region="eu" value={null} onChange={() => {}} />);
    const input = await openList();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});

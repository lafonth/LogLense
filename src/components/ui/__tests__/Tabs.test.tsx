import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { tabId, tabPanelId } from '../tab-ids';
import { Tabs } from '../Tabs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Comparison' },
];

describe('tabs', () => {
  it('marks only the active tab as selected', () => {
    render(<Tabs tabs={TABS} active="comparison" onChange={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Comparison' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
  });

  it('reports the clicked tab id', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="overview" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Comparison' }).click();

    expect(onChange).toHaveBeenCalledWith('comparison');
  });

  it('names the panel it controls', () => {
    render(<Tabs tabs={TABS} active="overview" onChange={() => {}} />);

    const tab = screen.getByRole('tab', { name: 'Overview' });
    expect(tab).toHaveAttribute('id', tabId('overview'));
    expect(tab).toHaveAttribute('aria-controls', tabPanelId('overview'));
  });

  // Un seul arrêt de tabulation pour toute la barre : c'est le motif ARIA, et c'est ce qui
  // évite de traverser tous les onglets au clavier avant d'atteindre le contenu.
  it('keeps a single tab stop and moves the rest with the arrows', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="overview" onChange={onChange} />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Comparison' })).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('comparison');
  });

  it('wraps around at both ends', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="overview" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('comparison');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('comparison');
  });

  it('ignores keys that are not navigation', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="overview" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

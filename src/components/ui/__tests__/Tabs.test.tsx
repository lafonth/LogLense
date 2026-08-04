import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});

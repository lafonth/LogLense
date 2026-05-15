import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DifficultyRegionFields } from '../DifficultyRegionFields';

describe('DifficultyRegionFields', () => {
  it('renders region and difficulty selects', () => {
    render(
      <DifficultyRegionFields
        region="EU"
        difficulty={4}
        onRegionChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/region/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/difficulty/i)).toBeInTheDocument();
  });

  it('shows all five region options', () => {
    render(
      <DifficultyRegionFields
        region="EU"
        difficulty={4}
        onRegionChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />
    );
    const regionSelect = screen.getByLabelText(/region/i);
    const options = Array.from((regionSelect as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['US', 'EU', 'KR', 'TW', 'CN']);
  });

  it('reflects current region value', () => {
    render(
      <DifficultyRegionFields
        region="US"
        difficulty={4}
        onRegionChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/region/i) as HTMLSelectElement).value).toBe('US');
  });

  it('reflects current difficulty value', () => {
    render(
      <DifficultyRegionFields
        region="EU"
        difficulty={5}
        onRegionChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/difficulty/i) as HTMLSelectElement).value).toBe('5');
  });

  it('calls onRegionChange when region is changed', () => {
    const onRegionChange = vi.fn();
    render(
      <DifficultyRegionFields
        region="EU"
        difficulty={4}
        onRegionChange={onRegionChange}
        onDifficultyChange={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/region/i), { target: { value: 'KR' } });
    expect(onRegionChange).toHaveBeenCalledWith('KR');
  });

  it('calls onDifficultyChange with numeric value when difficulty is changed', () => {
    const onDifficultyChange = vi.fn();
    render(
      <DifficultyRegionFields
        region="EU"
        difficulty={4}
        onRegionChange={vi.fn()}
        onDifficultyChange={onDifficultyChange}
      />
    );
    fireEvent.change(screen.getByLabelText(/difficulty/i), { target: { value: '3' } });
    expect(onDifficultyChange).toHaveBeenCalledWith(3);
  });

  it('shows Mythic, Heroic, Normal difficulty options', () => {
    render(
      <DifficultyRegionFields
        region="EU"
        difficulty={4}
        onRegionChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />
    );
    const select = screen.getByLabelText(/difficulty/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.text);
    expect(labels).toEqual(['Mythic', 'Heroic', 'Normal']);
  });
});

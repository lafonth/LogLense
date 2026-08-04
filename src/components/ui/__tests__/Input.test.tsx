import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../Input';
import { Select } from '../Select';

describe('input', () => {
  it('associates its label with the control', () => {
    render(<Input label="Character name" defaultValue="Jumbaa" />);

    expect(screen.getByLabelText('Character name')).toHaveValue('Jumbaa');
  });

  it('exposes the error to assistive technology', () => {
    render(<Input label="Report code" error="Unknown report" />);

    const field = screen.getByLabelText('Report code');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Unknown report')).toBeInTheDocument();
  });
});

describe('select', () => {
  it('associates its label with the control', () => {
    render(
      <Select label="Region" defaultValue="EU">
        <option value="EU">EU</option>
        <option value="US">US</option>
      </Select>
    );

    expect(screen.getByLabelText('Region')).toHaveValue('EU');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BookingTimingFieldset } from './BookingTimingFieldset.jsx';

const baseValues = {
  firstAvailable: true,
  preferredDate: '',
  preferredTimeOfDay: 'morning',
  preferredTime: '',
  backupDate: '',
  backupTimeOfDay: 'afternoon',
  backupTime: '',
};

function renderFieldset(overrides = {}) {
  const onChange = vi.fn();
  render(<BookingTimingFieldset values={{ ...baseValues, ...overrides }} onChange={onChange} />);
  return onChange;
}

describe('BookingTimingFieldset', () => {
  it('reports a first-available toggle', () => {
    const onChange = renderFieldset();
    fireEvent.click(screen.getByLabelText('First available'));
    expect(onChange).toHaveBeenCalledWith('firstAvailable', false);
  });

  it('reports date, time-of-day, and optional exact-time changes', () => {
    const onChange = renderFieldset();

    fireEvent.change(screen.getByLabelText('Preferred date'), { target: { value: '2026-06-05' } });
    fireEvent.change(screen.getByLabelText('Preferred time of day'), {
      target: { value: 'evening' },
    });
    fireEvent.change(screen.getByLabelText('Preferred time (optional)'), {
      target: { value: '09:30' },
    });

    expect(onChange).toHaveBeenCalledWith('preferredDate', '2026-06-05');
    expect(onChange).toHaveBeenCalledWith('preferredTimeOfDay', 'evening');
    expect(onChange).toHaveBeenCalledWith('preferredTime', '09:30');
  });

  it('exposes optional exact-time inputs for preferred and backup windows', () => {
    renderFieldset();
    expect(screen.getByLabelText('Preferred time (optional)')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('Backup time (optional)')).toHaveAttribute('type', 'time');
  });
});

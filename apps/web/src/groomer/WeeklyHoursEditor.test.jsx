import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WeeklyHoursEditor } from './WeeklyHoursEditor.jsx';

const weeklyHours = [
  { id: 'wh-1', groomerId: 'g1', dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' },
];

describe('WeeklyHoursEditor', () => {
  it('lists existing windows by day', () => {
    render(<WeeklyHoursEditor weeklyHours={weeklyHours} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    // "Monday" also appears as a <select> option; the row's open-time field
    // (labelled with the day) uniquely proves the row rendered.
    expect(screen.getByLabelText('Monday open time')).toHaveValue('09:00');
  });

  it('adds a window', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<WeeklyHoursEditor weeklyHours={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('New window open time'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('New window close time'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: /add hours/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ dayOfWeek: 3, openTime: '10:00', closeTime: '14:00' }));
  });

  it('updates a window inline', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<WeeklyHoursEditor weeklyHours={weeklyHours} onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Monday close time'), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('wh-1', { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' }),
    );
  });

  it('removes a window', () => {
    const onDelete = vi.fn();
    render(<WeeklyHoursEditor weeklyHours={weeklyHours} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalledWith('wh-1');
  });

  it('surfaces an overlap error from onCreate', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('That window overlaps an existing one for this day.'));
    render(<WeeklyHoursEditor weeklyHours={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add hours/i }));
    expect(await screen.findByText(/overlaps an existing one/i)).toBeInTheDocument();
  });
});

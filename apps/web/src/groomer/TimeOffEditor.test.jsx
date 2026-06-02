import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimeOffEditor } from './TimeOffEditor.jsx';

const timeOff = [
  { id: 'to-1', groomerId: 'g1', startAt: '2026-07-01T00:00', endAt: '2026-07-05T00:00' },
];

describe('TimeOffEditor', () => {
  it('lists existing time off', () => {
    render(<TimeOffEditor timeOff={timeOff} onCreate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/2026-07-01T00:00 → 2026-07-05T00:00/)).toBeInTheDocument();
  });

  it('adds a time-off block', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<TimeOffEditor timeOff={[]} onCreate={onCreate} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Time off start'), { target: { value: '2026-08-01T09:00' } });
    fireEvent.change(screen.getByLabelText('Time off end'), { target: { value: '2026-08-03T17:00' } });
    fireEvent.click(screen.getByRole('button', { name: /add time off/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ startAt: '2026-08-01T09:00', endAt: '2026-08-03T17:00' }),
    );
  });

  it('removes a time-off block', () => {
    const onDelete = vi.fn();
    render(<TimeOffEditor timeOff={timeOff} onCreate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalledWith('to-1');
  });

  it('surfaces a validation error', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('The start must be before the end.'));
    render(<TimeOffEditor timeOff={[]} onCreate={onCreate} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add time off/i }));
    expect(await screen.findByText('The start must be before the end.')).toBeInTheDocument();
  });
});

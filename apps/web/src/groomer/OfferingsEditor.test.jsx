import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OfferingsEditor } from './OfferingsEditor.jsx';

const offerings = [
  { id: 'offering-1', groomerId: 'g1', service: 'full-groom', durationMinutes: 90, basePriceCents: 8500 },
];

describe('OfferingsEditor', () => {
  it('lists existing offerings by service name', () => {
    render(<OfferingsEditor offerings={offerings} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    // "Full groom" also appears as a <select> option; the row's duration field
    // (labelled with the service name) uniquely proves the row rendered.
    expect(screen.getByLabelText('Duration for Full groom')).toHaveValue(90);
  });

  it('adds a new offering with the price converted to cents', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<OfferingsEditor offerings={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('New offering duration'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('New offering price'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: /add service/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      service: 'full-groom',
      durationMinutes: 60,
      basePriceCents: 7000,
    });
  });

  it('updates an offering inline', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<OfferingsEditor offerings={offerings} onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Duration for Full groom'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('offering-1', expect.objectContaining({ durationMinutes: 120 })));
  });

  it('removes an offering', () => {
    const onDelete = vi.fn();
    render(<OfferingsEditor offerings={offerings} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalledWith('offering-1');
  });

  it('surfaces an add error', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Duration must be a positive number of minutes.'));
    render(<OfferingsEditor offerings={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add service/i }));
    expect(await screen.findByText('Duration must be a positive number of minutes.')).toBeInTheDocument();
  });
});

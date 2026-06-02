import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BusinessDetailsForm } from './BusinessDetailsForm.jsx';

const profile = {
  id: 'groomer-1',
  name: 'Paw House',
  salon: 'Paw House Grooming',
  phone: '+12125551212',
  website: 'https://pawhouse.example',
  timezone: 'America/New_York',
  leadTimeHours: 12,
};

describe('BusinessDetailsForm', () => {
  it('renders the current profile values', () => {
    render(<BusinessDetailsForm profile={profile} onSave={vi.fn()} />);
    expect(screen.getByLabelText('Business name')).toHaveValue('Paw House');
    expect(screen.getByLabelText('Timezone')).toHaveValue('America/New_York');
    expect(screen.getByLabelText('Lead time (hours)')).toHaveValue(12);
  });

  it('saves edited fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BusinessDetailsForm profile={profile} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Paw Palace' } });
    fireEvent.click(screen.getByRole('button', { name: /save business details/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Paw Palace', leadTimeHours: 12 });
    expect(await screen.findByText('Business details saved.')).toBeInTheDocument();
  });

  it('surfaces a save error', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Choose a valid timezone.'));
    render(<BusinessDetailsForm profile={profile} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save business details/i }));

    expect(await screen.findByText('Choose a valid timezone.')).toBeInTheDocument();
  });
});

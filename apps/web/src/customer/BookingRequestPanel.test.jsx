import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookingRequestPanel } from './BookingRequestPanel.jsx';

const createBookingRequest = vi.fn();
const requireSupabaseClient = vi.fn();

vi.mock('../api/bookingRequests.js', () => ({
  TIME_OF_DAY_OPTIONS: [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ],
  buildPreferredWindows: (input) =>
    [
      input.firstAvailable ? { type: 'first-available' } : null,
      input.preferredDate
        ? {
            type: 'preferred-date',
            date: input.preferredDate,
            timeOfDay: input.preferredTimeOfDay,
          }
        : null,
      input.backupDate
        ? {
            type: 'backup-date',
            date: input.backupDate,
            timeOfDay: input.backupTimeOfDay,
          }
        : null,
    ].filter(Boolean),
  createBookingRequest: (...args) => createBookingRequest(...args),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => requireSupabaseClient(),
}));

const supabase = { id: 'supabase-client' };
const customer = {
  id: 'customer-1',
  authUserId: 'auth-user-1',
};
const dogs = [
  {
    id: 'dog-1',
    customerId: customer.id,
    name: 'Mochi',
    breed: 'Mini poodle',
    size: 'small',
    temperament: 'Nervous around dryers',
    notes: 'Use fragrance-free shampoo.',
    preferredServiceId: 'bath-brush',
    preferredGroomerId: 'groomer-2',
  },
];
const groomers = [
  {
    id: 'groomer-1',
    name: 'Paw House',
    website: 'https://pawhouse.example/book',
    services: ['full-groom'],
  },
  {
    id: 'groomer-2',
    name: 'SoHo Pups',
    website: '',
    services: ['bath-brush', 'nail-trim'],
  },
];
const selectedService = {
  id: 'full-groom',
  name: 'Full groom',
};

describe('BookingRequestPanel', () => {
  afterEach(() => {
    createBookingRequest.mockReset();
    requireSupabaseClient.mockReset();
  });

  it('stays gated until a dog profile exists', () => {
    render(
      <BookingRequestPanel
        customer={customer}
        dogs={[]}
        groomers={groomers}
        selectedGroomer={groomers[0]}
        selectedService={selectedService}
      />,
    );

    expect(screen.getByText('Add a dog profile before requesting a booking.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request booking' })).not.toBeInTheDocument();
  });

  it('auto-selects the dog preferred groomer and service when they match available groomers', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    createBookingRequest.mockResolvedValueOnce({
      id: 'request-1',
      customerId: customer.id,
      dogId: dogs[0].id,
      groomerId: groomers[1].id,
      service: 'bath-brush',
      preferredWindows: ['first-available', 'weekend'],
      status: 'requested',
      externalBookingUrl: '',
    });

    render(
      <BookingRequestPanel
        customer={customer}
        dogs={dogs}
        groomers={groomers}
        selectedGroomer={groomers[0]}
        selectedService={selectedService}
      />,
    );

    expect(screen.getByLabelText('Groomer')).toHaveValue('groomer-2');
    const serviceSelect = screen.getByLabelText('Service');
    expect(serviceSelect).toHaveValue('bath-brush');
    expect(screen.getByLabelText('Dog size')).toHaveValue('small');
    expect(
      Array.from(serviceSelect.querySelectorAll('optgroup')).map((group) =>
        group.getAttribute('label'),
      ),
    ).toEqual(['Grooming packages', 'Maintenance']);
    expect(screen.queryByRole('option', { name: 'Full groom' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('First available'));
    fireEvent.change(screen.getByLabelText('Preferred date'), {
      target: { value: '2026-06-05' },
    });
    fireEvent.change(screen.getByLabelText('Preferred time of day'), {
      target: { value: 'morning' },
    });
    fireEvent.change(screen.getByLabelText('Backup date'), {
      target: { value: '2026-06-07' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Please text before confirming.' },
    });
    fireEvent.change(screen.getByLabelText('Dog size'), {
      target: { value: 'large' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request booking' }));

    await waitFor(() => {
      expect(createBookingRequest).toHaveBeenCalledWith(
        supabase,
        customer,
        {
          ...dogs[0],
          size: 'large',
        },
        groomers[1],
        {
          service: 'bath-brush',
          preferredWindows: [
            { type: 'preferred-date', date: '2026-06-05', timeOfDay: 'morning' },
            { type: 'backup-date', date: '2026-06-07', timeOfDay: 'afternoon' },
          ],
          customerNotes: expect.stringContaining('Please text before confirming.'),
        },
      );
    });
    expect(createBookingRequest.mock.calls[0][4].customerNotes).toContain('Size: Large');
    expect(createBookingRequest.mock.calls[0][4].customerNotes).toContain('Breed: Mini poodle');
    expect(createBookingRequest.mock.calls[0][4].customerNotes).toContain(
      'Temperament: Nervous around dryers',
    );
    expect(createBookingRequest.mock.calls[0][4].customerNotes).toContain(
      'Dog notes: Use fragrance-free shampoo.',
    );
    expect(screen.getByText('Booking request saved')).toBeInTheDocument();
    expect(within(screen.getByText('Booking request saved').parentElement).queryByRole('link')).toBeNull();
  });

  it('lets the customer pick a different groomer before requesting', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    createBookingRequest.mockResolvedValueOnce({
      id: 'request-2',
      customerId: customer.id,
      dogId: dogs[0].id,
      groomerId: groomers[1].id,
      service: 'full-groom',
      preferredWindows: ['first-available'],
      status: 'requested',
      externalBookingUrl: '',
    });

    render(
      <BookingRequestPanel
        customer={customer}
        dogs={dogs}
        groomers={groomers}
        selectedGroomer={groomers[0]}
        selectedService={selectedService}
      />,
    );

    fireEvent.change(screen.getByLabelText('Groomer'), {
      target: { value: 'groomer-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request booking' }));

    await waitFor(() => {
      expect(createBookingRequest).toHaveBeenCalledWith(
        supabase,
        customer,
        dogs[0],
        groomers[1],
        expect.objectContaining({
          preferredWindows: [{ type: 'first-available' }],
        }),
      );
    });
    expect(within(screen.getByText('Booking request saved').parentElement).queryByRole('link')).toBeNull();
  });
});

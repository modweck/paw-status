import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookingForm } from './BookingForm.jsx';
import { createBookingRequest } from '../api/bookingRequests.js';
import { createGuestBookingRequest } from '../api/guestBooking.js';
import { GUEST_PREFILL_STORAGE_KEY } from './guestPrefill.js';

let authState = { user: null, isConfigured: true, sendMagicLink: vi.fn() };

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: vi.fn(() => ({})),
}));

vi.mock('../api/bookingRequests.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, createBookingRequest: vi.fn() };
});

vi.mock('../api/guestBooking.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, createGuestBookingRequest: vi.fn() };
});

const groomers = [{ id: 'g1', name: 'Paw House' }];

afterEach(() => {
  vi.clearAllMocks();
  authState = { user: null, isConfigured: true, sendMagicLink: vi.fn() };
});

describe('BookingForm — signed-in mode', () => {
  it('renders a dog dropdown, no contact fields, and submits a booking request', async () => {
    authState = { user: { id: 'u1' }, isConfigured: true, sendMagicLink: vi.fn() };
    createBookingRequest.mockResolvedValue({ id: 'req-1', externalBookingUrl: '' });

    render(
      <BookingForm
        customer={{ id: 'c1' }}
        dogs={[{ id: 'd1', name: 'Mochi', customerId: 'c1', size: 'small' }]}
        groomers={groomers}
        selectedGroomer={{ id: 'g1' }}
      />,
    );

    expect(screen.getByLabelText('Dog')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request booking' }));

    await waitFor(() => expect(createBookingRequest).toHaveBeenCalled());
    const [, customerArg, dogArg, groomerArg, requestArg] = createBookingRequest.mock.calls[0];
    expect(customerArg).toEqual({ id: 'c1' });
    expect(dogArg.id).toBe('d1');
    expect(groomerArg).toEqual({ id: 'g1', name: 'Paw House' });
    expect(requestArg.service).toBeTruthy();
    expect(requestArg.preferredWindows).toContainEqual({ type: 'first-available' });
  });

  it('passes an optional exact time through to the request', async () => {
    authState = { user: { id: 'u1' }, isConfigured: true, sendMagicLink: vi.fn() };
    createBookingRequest.mockResolvedValue({ id: 'req-2', externalBookingUrl: '' });

    render(
      <BookingForm
        customer={{ id: 'c1' }}
        dogs={[{ id: 'd1', name: 'Mochi', customerId: 'c1', size: 'small' }]}
        groomers={groomers}
        selectedGroomer={{ id: 'g1' }}
      />,
    );

    fireEvent.click(screen.getByLabelText('First available'));
    fireEvent.change(screen.getByLabelText('Preferred date'), { target: { value: '2026-06-05' } });
    fireEvent.change(screen.getByLabelText('Preferred time (optional)'), {
      target: { value: '09:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request booking' }));

    await waitFor(() => expect(createBookingRequest).toHaveBeenCalled());
    const requestArg = createBookingRequest.mock.calls[0][4];
    expect(requestArg.preferredWindows).toContainEqual({
      type: 'preferred-date',
      date: '2026-06-05',
      timeOfDay: 'morning',
      time: '09:30',
    });
  });
});

describe('BookingForm — guest mode', () => {
  it('hydrates from stored prefill, submits, and persists details for next time', async () => {
    authState = { user: null, isConfigured: true, sendMagicLink: vi.fn() };
    window.localStorage.setItem(
      GUEST_PREFILL_STORAGE_KEY,
      JSON.stringify({ customerName: 'Alex', customerEmail: 'alex@example.com' }),
    );
    createGuestBookingRequest.mockResolvedValue({ claimToken: 'tok', customerEmail: 'alex@example.com' });

    render(
      <BookingForm groomers={groomers} selectedGroomer={{ id: 'g1' }} selectedDogSize="small" />,
    );

    expect(screen.getByLabelText('Your name')).toHaveValue('Alex');
    expect(screen.getByLabelText('Email')).toHaveValue('alex@example.com');

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+12125551212' } });
    fireEvent.change(screen.getByLabelText('Dog name'), { target: { value: 'Mochi' } });

    fireEvent.click(screen.getByRole('button', { name: /Request booking as guest/i }));

    await waitFor(() => expect(createGuestBookingRequest).toHaveBeenCalled());
    const payload = createGuestBookingRequest.mock.calls[0][0];
    expect(payload.customerEmail).toBe('alex@example.com');
    expect(payload.dogName).toBe('Mochi');

    const saved = JSON.parse(window.localStorage.getItem(GUEST_PREFILL_STORAGE_KEY));
    expect(saved.dogName).toBe('Mochi');
    expect(saved.customerName).toBe('Alex');
  });
});

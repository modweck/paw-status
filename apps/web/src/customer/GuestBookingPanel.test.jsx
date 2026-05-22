import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestBookingPanel } from './GuestBookingPanel.jsx';

const createGuestBookingRequest = vi.fn();
const sendMagicLink = vi.fn();

vi.mock('../api/guestBooking.js', () => ({
  PENDING_GUEST_CLAIM_STORAGE_KEY: 'paw-status:pending-guest-claim',
  createGuestBookingRequest: (...args) => createGuestBookingRequest(...args),
}));

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => ({
    isConfigured: true,
    sendMagicLink,
  }),
}));

const groomers = [
  {
    id: 'groomer-1',
    name: 'Paw House',
    services: ['full-groom', 'bath-brush'],
  },
];

describe('GuestBookingPanel', () => {
  afterEach(() => {
    createGuestBookingRequest.mockReset();
    sendMagicLink.mockReset();
    window.localStorage.clear();
  });

  it('submits a signed-out booking packet and offers account save by magic link', async () => {
    createGuestBookingRequest.mockResolvedValueOnce({
      request: { id: 'request-1', status: 'requested' },
      claimToken: 'claim-token-1',
      customerEmail: 'owner@example.com',
    });
    sendMagicLink.mockResolvedValueOnce(undefined);

    render(
      <GuestBookingPanel
        groomers={groomers}
        selectedDogSize="small"
        selectedGroomer={groomers[0]}
        selectedService={{ id: 'bath-brush', name: 'Bath and brush' }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Alex' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '+12125551212' },
    });
    fireEvent.change(screen.getByLabelText('Dog name'), {
      target: { value: 'Mochi' },
    });
    fireEvent.change(screen.getByLabelText('Breed'), {
      target: { value: 'Mini poodle' },
    });
    expect(screen.getByLabelText('Dog size')).toHaveValue('small');
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
    fireEvent.click(screen.getByRole('button', { name: 'Request booking as guest' }));

    await waitFor(() => {
      expect(createGuestBookingRequest).toHaveBeenCalledWith({
        customerEmail: 'owner@example.com',
        customerName: 'Alex',
        customerPhone: '+12125551212',
        customerNotes: 'Please text before confirming.',
        dogBreed: 'Mini poodle',
        dogName: 'Mochi',
        dogNotes: '',
        dogSize: 'small',
        groomerId: 'groomer-1',
        preferredWindows: [
          { type: 'preferred-date', date: '2026-06-05', timeOfDay: 'morning' },
          { type: 'backup-date', date: '2026-06-07', timeOfDay: 'afternoon' },
        ],
        service: 'bath-brush',
      });
    });
    expect(window.localStorage.getItem('paw-status:pending-guest-claim')).toBe('claim-token-1');
    expect(screen.getByText('Booking request sent')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save this info for next time' }));

    await waitFor(() => {
      expect(sendMagicLink).toHaveBeenCalledWith('owner@example.com');
    });
  });
});

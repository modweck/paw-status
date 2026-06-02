import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_LOCATION_LABEL, CustomerApp } from './CustomerApp.jsx';

const fetchNearbyGroomers = vi.fn();
const geocodeAddress = vi.fn();
const getBrowserLocation = vi.fn();
const reverseGeocodeLocation = vi.fn();
const resolvePlace = vi.fn();
const suggestAddresses = vi.fn();
const claimGuestBookingRequest = vi.fn();
let authState = { user: null, loading: false };

vi.mock('../api/groomers.js', () => ({
  fetchNearbyGroomers: (...args) => fetchNearbyGroomers(...args),
}));

vi.mock('../api/geocoding.js', () => ({
  geocodeAddress: (...args) => geocodeAddress(...args),
  resolvePlace: (...args) => resolvePlace(...args),
  reverseGeocodeLocation: (...args) => reverseGeocodeLocation(...args),
  suggestAddresses: (...args) => suggestAddresses(...args),
}));

vi.mock('../api/browserLocation.js', () => ({
  getBrowserLocation: (...args) => getBrowserLocation(...args),
}));

vi.mock('../api/guestBooking.js', () => ({
  claimGuestBookingRequest: (...args) => claimGuestBookingRequest(...args),
  PENDING_GUEST_CLAIM_STORAGE_KEY: 'paw-status:pending-guest-claim',
}));

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => authState,
}));

vi.mock('../auth/LoginPanel.jsx', () => ({
  LoginPanel: () => <div>Login panel</div>,
}));

vi.mock('./BookingForm.jsx', () => ({
  BookingForm: ({ selectedGroomer, selectedDogSize, customer }) => (
    <div>
      Booking form for {selectedGroomer?.name || 'no groomer selected'} (
      {customer ? 'account' : 'guest'}) size {selectedDogSize || 'no dog size'}
    </div>
  ),
}));

vi.mock('./CustomerOwnershipPanel.jsx', () => ({
  CustomerOwnershipPanel: ({ selectedGroomer }) => (
    <div>Booking panel for {selectedGroomer?.name || 'no groomer selected'}</div>
  ),
}));

function resetMocks() {
  fetchNearbyGroomers.mockReset();
  geocodeAddress.mockReset();
  getBrowserLocation.mockReset();
  reverseGeocodeLocation.mockReset();
  suggestAddresses.mockReset();
  resolvePlace.mockReset();
  claimGuestBookingRequest.mockReset();
  if (typeof window !== 'undefined' && window.localStorage?.clear) {
    window.localStorage.clear();
  }
  window.history.pushState(null, '', '/');
}

describe('CustomerApp search screen', () => {
  beforeEach(() => {
    authState = { user: null, loading: false };
  });
  afterEach(resetMocks);

  it('shows only the search form first — no results, popular, or booking gate', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    fetchNearbyGroomers.mockResolvedValue([]);

    render(<CustomerApp />);

    await screen.findByRole('button', { name: 'Find groomers' });
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
    expect(screen.queryByText('Nearby groomers')).not.toBeInTheDocument();
    expect(screen.queryByText('Popular near you')).not.toBeInTheDocument();
  });

  it('captures browser location on mount but stays on the search screen', async () => {
    getBrowserLocation.mockResolvedValueOnce({ lat: 40.72, lng: -73.99 });
    reverseGeocodeLocation.mockResolvedValueOnce({
      displayName: 'Lower East Side, New York, NY',
      lat: 40.72,
      lng: -73.99,
    });
    fetchNearbyGroomers.mockResolvedValueOnce([{ id: 'groomer-1', name: 'Puppy Tale Lodge' }]);

    render(<CustomerApp />);

    await waitFor(() => expect(fetchNearbyGroomers).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Find groomers' })).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toHaveValue('');
    expect(screen.queryByText('Nearby groomers')).not.toBeInTheDocument();
  });

  it('lets the customer grant location later by clicking Use my location', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    fetchNearbyGroomers.mockResolvedValue([]);

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });
    expect(screen.getByLabelText('Location')).toHaveValue('');

    getBrowserLocation.mockResolvedValueOnce({ lat: 40.768, lng: -73.958 });
    reverseGeocodeLocation.mockResolvedValueOnce({
      displayName: 'Upper East Side, New York, NY',
      lat: 40.768,
      lng: -73.958,
    });
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Location')).toHaveValue('Upper East Side, New York, NY');
    });
  });

  it('surfaces a helpful error when Use my location returns nothing', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    fetchNearbyGroomers.mockResolvedValue([]);

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });

    getBrowserLocation.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByText(/browser location is unavailable/i)).toBeInTheDocument();
    });
  });

  it('organizes the service picker into labeled sections', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    fetchNearbyGroomers.mockResolvedValue([]);

    render(<CustomerApp />);
    const serviceSelect = await screen.findByLabelText('Service');

    expect(
      Array.from(serviceSelect.querySelectorAll('optgroup')).map((group) =>
        group.getAttribute('label'),
      ),
    ).toEqual(['Grooming packages', 'Maintenance', 'Special care']);
    expect(screen.getByLabelText('Dog size')).toHaveValue('');
  });

  it('does not fetch when browser location is unavailable and no address is entered', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });

    expect(screen.getByLabelText('Location')).toHaveValue('');
    expect(fetchNearbyGroomers).not.toHaveBeenCalled();
  });
});

describe('CustomerApp step flow', () => {
  beforeEach(() => {
    authState = { user: null, loading: false };
  });
  afterEach(resetMocks);

  async function searchToResults(displayName = '72nd St') {
    getBrowserLocation.mockResolvedValueOnce(null);
    geocodeAddress.mockResolvedValueOnce({ lat: 40.77, lng: -73.95, displayName });
    fetchNearbyGroomers.mockResolvedValueOnce([
      { id: 'g1', name: 'Museum Mile Grooming', rating: '4.8', services: ['full-groom'] },
    ]);

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: displayName } });
    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));
    await screen.findByText('Nearby groomers');
  }

  it('advances search -> results and syncs ?step=results', async () => {
    await searchToResults();
    expect(screen.getAllByText('Museum Mile Grooming').length).toBeGreaterThan(0);
    expect(window.location.search).toBe('?step=results');
  });

  it('returns to the search screen with state intact via Edit search', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    geocodeAddress.mockResolvedValueOnce({
      lat: 41.0534,
      lng: -73.5387,
      displayName: 'Stamford, CT 06902',
    });
    fetchNearbyGroomers.mockResolvedValueOnce([{ id: 'g1', name: 'Stamford Paws' }]);

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '06902' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));
    await screen.findByText('Nearby groomers');

    fireEvent.click(screen.getByRole('button', { name: /edit search/i }));

    expect(screen.getByLabelText('Location')).toHaveValue('Stamford, CT 06902');
    expect(screen.getByRole('button', { name: '10 mi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '0.5 mi' })).not.toBeInTheDocument();
  });

  it('resolves an address suggestion without a second geocode call', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    suggestAddresses.mockResolvedValueOnce([
      { placeId: 'place-1', displayName: '1000 5th Ave, New York, NY 10028' },
    ]);
    resolvePlace.mockResolvedValueOnce({
      lat: 40.775,
      lng: -73.965,
      displayName: '1000 5th Ave, New York, NY 10028, USA',
    });
    fetchNearbyGroomers.mockResolvedValueOnce([{ id: 'g1', name: 'Museum Mile Grooming' }]);

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '1000 5th' } });

    const suggestion = await screen.findByRole('option', {
      name: '1000 5th Ave, New York, NY 10028',
    });
    fireEvent.click(suggestion);
    await waitFor(() => {
      expect(screen.getByLabelText('Location')).toHaveValue('1000 5th Ave, New York, NY 10028, USA');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));
    await screen.findByText('Nearby groomers');

    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(screen.getAllByText('Museum Mile Grooming').length).toBeGreaterThan(0);
  });

  it('advances results -> booking when a groomer is chosen (guest)', async () => {
    await searchToResults();
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await screen.findByText(/Booking form for Museum Mile Grooming \(guest\)/i);
    expect(screen.getByText('Login panel')).toBeInTheDocument();
    expect(window.location.search).toBe('?step=booking');
  });

  it('restores the previous step on browser back (popstate)', async () => {
    await searchToResults();
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    await screen.findByText(/Booking form for Museum Mile Grooming/i);

    window.history.pushState(null, '', '/?step=results');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(screen.getByText('Nearby groomers')).toBeInTheDocument());
  });

  it('shows the account booking panel for a signed-in customer', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    geocodeAddress.mockResolvedValueOnce({ lat: 40.77, lng: -73.95, displayName: '72nd St' });
    fetchNearbyGroomers.mockResolvedValueOnce([
      { id: 'g1', name: 'Puppy Tale Lodge', services: ['full-groom'] },
    ]);
    authState = { user: { id: 'auth-user-1', email: 'owner@example.com' }, loading: false };

    render(<CustomerApp />);
    await screen.findByRole('button', { name: 'Find groomers' });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '72nd St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));
    await screen.findByText('Nearby groomers');

    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(await screen.findByText('Booking panel for Puppy Tale Lodge')).toBeInTheDocument();
  });

  it('opens the booking screen directly for the /bookings route', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);

    render(<CustomerApp initialSection="bookings" />);

    // Guest with no chosen groomer sees the pick-a-groomer hint on the gate.
    expect(
      await screen.findByText(/Pick a groomer from the list below/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nearby groomers')).not.toBeInTheDocument();
  });
});

describe('CustomerApp guest claim feedback', () => {
  beforeEach(() => {
    authState = {
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      session: { access_token: 'session-token' },
      loading: false,
    };
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('paw-status:pending-guest-claim', 'claim-token-1');
    }
    getBrowserLocation.mockResolvedValue(null);
    fetchNearbyGroomers.mockResolvedValue([]);
  });

  afterEach(() => {
    authState = { user: null, loading: false };
    resetMocks();
  });

  it('shows a success notice and clears the pending claim token on success', async () => {
    claimGuestBookingRequest.mockResolvedValueOnce({ ok: true });

    render(<CustomerApp />);

    expect(await screen.findByText(/now linked to this account/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem('paw-status:pending-guest-claim')).toBeNull();
    });
  });

  it('shows an error notice when the claim fails and keeps the token for retry', async () => {
    claimGuestBookingRequest.mockRejectedValueOnce(new Error('Email did not match.'));

    render(<CustomerApp />);

    expect(await screen.findByText('Email did not match.')).toBeInTheDocument();
    expect(window.localStorage.getItem('paw-status:pending-guest-claim')).toBe('claim-token-1');
  });

  it('dismisses the notice when the user clicks Dismiss', async () => {
    claimGuestBookingRequest.mockResolvedValueOnce({ ok: true });

    render(<CustomerApp />);

    await screen.findByText(/now linked to this account/i);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    await waitFor(() => {
      expect(screen.queryByText(/now linked to this account/i)).not.toBeInTheDocument();
    });
  });

  it('does not attempt to claim when there is no pending token', async () => {
    window.localStorage.clear();

    render(<CustomerApp />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(claimGuestBookingRequest).not.toHaveBeenCalled();
    expect(screen.queryByText(/linked to this account/i)).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_LOCATION_LABEL, CustomerApp } from './CustomerApp.jsx';

const fetchNearbyGroomers = vi.fn();
const geocodeAddress = vi.fn();
const getBrowserLocation = vi.fn();
const reverseGeocodeLocation = vi.fn();
const suggestAddresses = vi.fn();
let authState = { user: null, loading: false };

vi.mock('../api/groomers.js', () => ({
  fetchNearbyGroomers: (...args) => fetchNearbyGroomers(...args),
}));

vi.mock('../api/geocoding.js', () => ({
  geocodeAddress: (...args) => geocodeAddress(...args),
  reverseGeocodeLocation: (...args) => reverseGeocodeLocation(...args),
  suggestAddresses: (...args) => suggestAddresses(...args),
}));

vi.mock('../api/browserLocation.js', () => ({
  getBrowserLocation: (...args) => getBrowserLocation(...args),
}));

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => authState,
}));

vi.mock('../auth/LoginPanel.jsx', () => ({
  LoginPanel: () => <div>Login panel</div>,
}));

vi.mock('./GuestBookingPanel.jsx', () => ({
  GuestBookingPanel: ({ selectedDogSize, selectedGroomer }) => (
    <div>
      Guest booking panel for {selectedGroomer?.name || 'no groomer selected'} and{' '}
      {selectedDogSize || 'no dog size'}
    </div>
  ),
}));

vi.mock('./CustomerOwnershipPanel.jsx', () => ({
  CustomerOwnershipPanel: ({ selectedGroomer }) => (
    <div>Booking panel for {selectedGroomer?.name || 'no groomer selected'}</div>
  ),
}));

describe('CustomerApp default groomer loading', () => {
  beforeEach(() => {
    authState = { user: null, loading: false };
  });

  afterEach(() => {
    fetchNearbyGroomers.mockReset();
    geocodeAddress.mockReset();
    getBrowserLocation.mockReset();
    reverseGeocodeLocation.mockReset();
    suggestAddresses.mockReset();
  });

  it('asks for browser location and loads real groomers near the user when permission is granted', async () => {
    getBrowserLocation.mockResolvedValueOnce({
      lat: 40.72,
      lng: -73.99,
    });
    reverseGeocodeLocation.mockResolvedValueOnce({
      displayName: 'Lower East Side, New York, NY',
      lat: 40.72,
      lng: -73.99,
    });
    fetchNearbyGroomers.mockResolvedValueOnce([
      {
        id: 'groomer-1',
        name: 'Puppy Tale Lodge',
      },
    ]);

    render(<CustomerApp />);

    await waitFor(() => {
      expect(fetchNearbyGroomers).toHaveBeenCalledWith({
        lat: 40.72,
        lng: -73.99,
        radiusMeters: 1609,
        serviceId: 'full-groom',
      });
    });
    expect(screen.getByLabelText('Location')).toHaveValue('Lower East Side, New York, NY');
  });

  it('organizes the service picker into labeled sections', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    fetchNearbyGroomers.mockResolvedValueOnce([]);

    render(<CustomerApp />);

    const serviceSelect = screen.getByLabelText('Service');
    await waitFor(() => {
      expect(
        screen.getByText('Enter a ZIP code or allow location to find groomers.'),
      ).toBeInTheDocument();
    });

    expect(
      Array.from(serviceSelect.querySelectorAll('optgroup')).map((group) =>
        group.getAttribute('label'),
      ),
    ).toEqual(['Grooming packages', 'Maintenance', 'Special care']);
    expect(
      Array.from(
        serviceSelect.querySelector('optgroup[label="Grooming packages"]').querySelectorAll('option'),
      ).map((option) => option.textContent),
    ).toContain('Mobile grooming');
    expect(screen.getByLabelText('Dog size')).toHaveValue('');
  });

  it('suggests real addresses while the customer types and searches from the selected suggestion', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    suggestAddresses.mockResolvedValueOnce([
      {
        lat: 40.775,
        lng: -73.965,
        displayName: '1000 5th Ave, New York, NY 10028',
      },
    ]);
    fetchNearbyGroomers.mockResolvedValueOnce([
      {
        id: 'groomer-1',
        name: 'Museum Mile Grooming',
      },
    ]);

    render(<CustomerApp />);

    await screen.findByText('Enter a ZIP code or allow location to find groomers.');

    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: '1000 5th' },
    });

    const suggestion = await screen.findByRole('option', {
      name: '1000 5th Ave, New York, NY 10028',
    });
    fireEvent.click(suggestion);
    fireEvent.change(screen.getByLabelText('Dog size'), {
      target: { value: 'small' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));

    await waitFor(() => {
      expect(fetchNearbyGroomers).toHaveBeenCalledWith({
        lat: 40.775,
        lng: -73.965,
        radiusMeters: 1609,
        serviceId: 'full-groom',
      });
    });
    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(screen.getByText('Guest booking panel for Museum Mile Grooming and small')).toBeInTheDocument();
  });

  it('leaves location empty and waits for a customer-entered location when browser location is unavailable', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);

    render(<CustomerApp />);

    await waitFor(() => {
      expect(
        screen.getByText('Enter a ZIP code or allow location to find groomers.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Location')).toHaveValue('');
    expect(fetchNearbyGroomers).not.toHaveBeenCalled();
  });

  it('updates the location field and radius options after a ZIP code search resolves', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    geocodeAddress.mockResolvedValueOnce({
      lat: 41.0534,
      lng: -73.5387,
      displayName: 'Stamford, CT 06902',
    });
    fetchNearbyGroomers.mockResolvedValueOnce([
      {
        id: 'groomer-1',
        name: 'Stamford Paws',
      },
    ]);

    render(<CustomerApp />);

    await screen.findByText('Enter a ZIP code or allow location to find groomers.');

    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: '06902' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));

    await waitFor(() => {
      expect(fetchNearbyGroomers).toHaveBeenCalledWith({
        lat: 41.0534,
        lng: -73.5387,
        radiusMeters: 1609,
        serviceId: 'full-groom',
      });
    });
    expect(screen.getByLabelText('Location')).toHaveValue('Stamford, CT 06902');
    expect(screen.getByRole('button', { name: '10 mi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '0.5 mi' })).not.toBeInTheDocument();
  });

  it('keeps NYC radius options when the search resolves inside New York City', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);
    geocodeAddress.mockResolvedValueOnce({
      lat: 40.768,
      lng: -73.958,
      displayName: '10021, New York, NY',
    });
    fetchNearbyGroomers.mockResolvedValueOnce([]);

    render(<CustomerApp />);

    await screen.findByText('Enter a ZIP code or allow location to find groomers.');

    fireEvent.change(screen.getByLabelText('Location'), {
      target: { value: '10021' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find groomers' }));

    await waitFor(() => {
      expect(fetchNearbyGroomers).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: '0.5 mi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10 mi' })).not.toBeInTheDocument();
  });

  it('shows only the first five groomers on initial load', async () => {
    getBrowserLocation.mockResolvedValueOnce({
      lat: 40.72,
      lng: -73.99,
    });
    reverseGeocodeLocation.mockResolvedValueOnce({
      displayName: CURRENT_LOCATION_LABEL,
      lat: 40.72,
      lng: -73.99,
    });
    fetchNearbyGroomers.mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, index) => ({
        id: `groomer-${index + 1}`,
        name: `Groomer ${index + 1}`,
      })),
    );

    render(<CustomerApp />);

    await waitFor(() => {
      expect(screen.getAllByText('Groomer 5').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('Groomer 6')).not.toBeInTheDocument();
    expect(screen.getByText('5 shown')).toBeInTheDocument();
  });

  it('shows a horizontal popular near you section sorted by rating', async () => {
    getBrowserLocation.mockResolvedValueOnce({
      lat: 40.72,
      lng: -73.99,
    });
    reverseGeocodeLocation.mockResolvedValueOnce({
      displayName: CURRENT_LOCATION_LABEL,
      lat: 40.72,
      lng: -73.99,
    });
    fetchNearbyGroomers.mockResolvedValueOnce([
      {
        id: 'groomer-1',
        name: 'Good Grooming',
        rating: '4.3',
        reviewCount: 40,
      },
      {
        id: 'groomer-2',
        name: 'Top Paws',
        rating: '4.9',
        reviewCount: 120,
      },
    ]);

    render(<CustomerApp />);

    await waitFor(() => {
      expect(screen.getByText('Popular near you')).toBeInTheDocument();
    });

    const popularSection = screen.getByLabelText('Popular near you');
    const bookingSection = document.getElementById('bookings');
    expect(popularSection).toHaveTextContent('Top Paws');
    expect(popularSection).toHaveTextContent('Good Grooming');
    expect(
      bookingSection.compareDocumentPosition(popularSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps a signed-out groomer request selected through the sign-in gate', async () => {
    getBrowserLocation.mockResolvedValueOnce({
      lat: 40.72,
      lng: -73.99,
    });
    reverseGeocodeLocation.mockResolvedValueOnce({
      displayName: CURRENT_LOCATION_LABEL,
      lat: 40.72,
      lng: -73.99,
    });
    fetchNearbyGroomers.mockResolvedValueOnce([
      {
        id: 'groomer-1',
        name: 'Puppy Tale Lodge',
        rating: '4.8',
        services: ['full-groom'],
      },
    ]);

    const { rerender } = render(<CustomerApp />);

    const startRequest = await screen.findByRole('button', { name: 'Book as guest' });
    expect(startRequest).not.toBeDisabled();
    fireEvent.click(startRequest);
    expect(screen.getByText('Login panel')).toBeInTheDocument();

    authState = { user: { id: 'auth-user-1', email: 'owner@example.com' }, loading: false };
    rerender(<CustomerApp />);

    expect(screen.getByText('Booking panel for Puppy Tale Lodge')).toBeInTheDocument();
  });

  it('places the booking gate before search results on the bookings route', async () => {
    getBrowserLocation.mockResolvedValueOnce(null);

    render(<CustomerApp initialSection="bookings" />);

    const loginPanel = await screen.findByText('Login panel');
    const nearbyHeading = screen.getByText('Nearby groomers');

    expect(
      loginPanel.compareDocumentPosition(nearbyHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

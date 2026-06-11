import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomerOwnershipPanel } from './CustomerOwnershipPanel.jsx';

const createCustomerForVerifiedUser = vi.fn();
const loadCustomerForVerifiedUser = vi.fn();
const updateCustomerForVerifiedUser = vi.fn();
const loadDogsForCustomer = vi.fn();
const requireSupabaseClient = vi.fn();

vi.mock('../api/customers.js', () => ({
  createCustomerForVerifiedUser: (...args) => createCustomerForVerifiedUser(...args),
  loadCustomerForVerifiedUser: (...args) => loadCustomerForVerifiedUser(...args),
  updateCustomerForVerifiedUser: (...args) => updateCustomerForVerifiedUser(...args),
}));

vi.mock('../api/dogs.js', () => ({
  loadDogsForCustomer: (...args) => loadDogsForCustomer(...args),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => requireSupabaseClient(),
}));

vi.mock('./CustomerDogsPanel.jsx', () => ({
  CustomerDogsPanel: ({ customer, dogs }) => (
    <div>
      Dog panel for {customer.id} with {dogs.length} dogs
    </div>
  ),
}));

vi.mock('./BookingRequestPanel.jsx', () => ({
  BookingRequestPanel: ({ customer, dogs, selectedGroomer, selectedService }) => (
    <div>
      Booking request panel for {customer.id} with {dogs.length} dogs
      {selectedGroomer && selectedService
        ? ` and ${selectedGroomer.name} with ${selectedService.name}`
        : ''}
    </div>
  ),
}));

vi.mock('./BookingsListPanel.jsx', () => ({
  BookingsListPanel: ({ customer }) => <div>Bookings list for {customer.id}</div>,
}));

const supabase = { id: 'supabase-client' };
const customerResult = {
  user: { id: 'auth-user-1', email: 'owner@example.com' },
  customer: {
    id: 'customer-1',
    authUserId: 'auth-user-1',
    name: 'Alex',
    phone: '+12125551212',
    email: 'owner@example.com',
  },
};

describe('CustomerOwnershipPanel sections', () => {
  afterEach(() => {
    createCustomerForVerifiedUser.mockReset();
    loadCustomerForVerifiedUser.mockReset();
    updateCustomerForVerifiedUser.mockReset();
    loadDogsForCustomer.mockReset();
    requireSupabaseClient.mockReset();
  });

  it('shows only the profile and sign-in options on the account section', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    loadCustomerForVerifiedUser.mockResolvedValueOnce(customerResult);
    loadDogsForCustomer.mockResolvedValueOnce([]);

    render(<CustomerOwnershipPanel section="account" />);

    expect(screen.getByText('Loading customer profile...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Customer profile ready')).toBeInTheDocument();
    });
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Optional password sign-in')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.queryByText(/Dog panel for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Booking request panel for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bookings list for/)).not.toBeInTheDocument();
  });

  it('shows the dogs panel with loaded dogs on the dogs section', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    loadCustomerForVerifiedUser.mockResolvedValueOnce(customerResult);
    loadDogsForCustomer.mockResolvedValueOnce([{ id: 'dog-1', name: 'Mochi' }]);

    render(<CustomerOwnershipPanel section="dogs" />);

    await waitFor(() => {
      expect(screen.getByText('Dog panel for customer-1 with 1 dogs')).toBeInTheDocument();
    });
    expect(loadDogsForCustomer).toHaveBeenCalledWith(supabase, customerResult.customer);
    expect(screen.queryByText('Customer profile ready')).not.toBeInTheDocument();
    expect(screen.queryByText(/Booking request panel for/)).not.toBeInTheDocument();
  });

  it('shows booking request, bookings list, and rebook card on the bookings section', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    loadCustomerForVerifiedUser.mockResolvedValueOnce(customerResult);
    loadDogsForCustomer.mockResolvedValueOnce([{ id: 'dog-1', name: 'Mochi' }]);

    render(
      <CustomerOwnershipPanel
        groomers={[{ id: 'groomer-1', name: 'Paw House' }]}
        section="bookings"
        selectedGroomer={{ id: 'groomer-1', name: 'Paw House' }}
        selectedService={{ id: 'full-groom', name: 'Full groom' }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'Booking request panel for customer-1 with 1 dogs and Paw House with Full groom',
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Bookings list for customer-1')).toBeInTheDocument();
    expect(screen.getByText('Your Groomer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rebook Paw House' })).toBeInTheDocument();
    expect(screen.queryByText(/Dog panel for/)).not.toBeInTheDocument();
    expect(screen.queryByText('Customer profile ready')).not.toBeInTheDocument();
    // The display-only waitlist placeholder is gone; real waitlist offers live
    // in the bookings list.
    expect(screen.queryByText('Get Earlier Appointments')).not.toBeInTheDocument();
  });

  it('creates a customer row for the verified signed-in user from any section', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    loadCustomerForVerifiedUser.mockResolvedValueOnce({
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      customer: null,
    });
    createCustomerForVerifiedUser.mockResolvedValueOnce(customerResult);
    loadDogsForCustomer.mockResolvedValueOnce([]);

    render(<CustomerOwnershipPanel section="dogs" />);

    await waitFor(() => {
      expect(screen.getByText('Create your customer profile')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alex' },
    });
    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '+12125551212' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));

    await waitFor(() => {
      expect(createCustomerForVerifiedUser).toHaveBeenCalledWith(supabase, {
        name: 'Alex',
        phone: '+12125551212',
      });
    });
    expect(await screen.findByText('Dog panel for customer-1 with 0 dogs')).toBeInTheDocument();
  });
});

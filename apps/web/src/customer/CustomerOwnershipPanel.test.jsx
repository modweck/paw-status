import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomerOwnershipPanel } from './CustomerOwnershipPanel.jsx';

const createCustomerForVerifiedUser = vi.fn();
const loadCustomerForVerifiedUser = vi.fn();
const updateCustomerForVerifiedUser = vi.fn();
const requireSupabaseClient = vi.fn();

vi.mock('../api/customers.js', () => ({
  createCustomerForVerifiedUser: (...args) => createCustomerForVerifiedUser(...args),
  loadCustomerForVerifiedUser: (...args) => loadCustomerForVerifiedUser(...args),
  updateCustomerForVerifiedUser: (...args) => updateCustomerForVerifiedUser(...args),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => requireSupabaseClient(),
}));

vi.mock('./CustomerDogsPanel.jsx', () => ({
  CustomerDogsPanel: ({ customer }) => <div>Dog panel for {customer.id}</div>,
}));

vi.mock('./BookingRequestPanel.jsx', () => ({
  BookingRequestPanel: ({ customer, selectedGroomer, selectedService }) => (
    <div>
      Booking request panel for {customer.id}
      {selectedGroomer && selectedService
        ? ` and ${selectedGroomer.name} with ${selectedService.name}`
        : ''}
    </div>
  ),
}));

const supabase = { id: 'supabase-client' };

describe('CustomerOwnershipPanel', () => {
  afterEach(() => {
    createCustomerForVerifiedUser.mockReset();
    loadCustomerForVerifiedUser.mockReset();
    updateCustomerForVerifiedUser.mockReset();
    requireSupabaseClient.mockReset();
  });

  it('shows a ready customer profile when the signed-in user already owns a customer row', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    loadCustomerForVerifiedUser.mockResolvedValueOnce({
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      customer: {
        id: 'customer-1',
        authUserId: 'auth-user-1',
        name: 'Alex',
        phone: '+12125551212',
        email: 'owner@example.com',
      },
    });

    render(
      <CustomerOwnershipPanel
        groomers={[{ id: 'groomer-1', name: 'Paw House' }]}
        selectedGroomer={{ id: 'groomer-1', name: 'Paw House' }}
        selectedService={{ id: 'full-groom', name: 'Full groom' }}
      />,
    );

    expect(screen.getByText('Loading customer profile...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Customer profile ready')).toBeInTheDocument();
    });
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Dog panel for customer-1')).toBeInTheDocument();
    expect(
      screen.getByText('Booking request panel for customer-1 and Paw House with Full groom'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your Groomer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rebook Paw House' })).toBeInTheDocument();
    expect(screen.getByText('Get Earlier Appointments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join waitlist' })).toBeDisabled();
    expect(screen.getByText('Optional password sign-in')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('creates a customer row for the verified signed-in user', async () => {
    requireSupabaseClient.mockReturnValue(supabase);
    loadCustomerForVerifiedUser.mockResolvedValueOnce({
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      customer: null,
    });
    createCustomerForVerifiedUser.mockResolvedValueOnce({
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      customer: {
        id: 'customer-1',
        authUserId: 'auth-user-1',
        name: 'Alex',
        phone: '+12125551212',
        email: 'owner@example.com',
      },
    });

    render(<CustomerOwnershipPanel />);

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
    expect(screen.getByText('Customer profile ready')).toBeInTheDocument();
    expect(screen.getByText('Dog panel for customer-1')).toBeInTheDocument();
  });
});

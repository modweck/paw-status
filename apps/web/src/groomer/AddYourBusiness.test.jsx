import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddYourBusiness } from './AddYourBusiness.jsx';
import { linkGroomerBusiness, searchGroomerBusinesses } from '../api/groomerBusiness.js';
import { requestGroomerMembership } from '../api/groomerAccounts.js';

vi.mock('../api/groomerBusiness.js', () => ({
  searchGroomerBusinesses: vi.fn(),
  linkGroomerBusiness: vi.fn(),
}));

vi.mock('../api/groomerAccounts.js', () => ({
  requestGroomerMembership: vi.fn(),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ id: 'supabase' }),
}));

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => ({ session: { access_token: 'tok' } }),
}));

vi.mock('../customer/GooglePlacePhoto.jsx', () => ({
  GooglePlacePhoto: ({ placeId }) => <div>photo:{placeId}</div>,
}));

const account = { id: 'account-1' };
const candidate = { placeId: 'place-1', name: 'Paw House Grooming', address: '123 Main St', rating: 4.8, reviewCount: 120 };

afterEach(() => vi.clearAllMocks());

describe('AddYourBusiness', () => {
  it('searches Google and lists candidates', async () => {
    searchGroomerBusinesses.mockResolvedValueOnce([candidate]);

    render(<AddYourBusiness account={account} setWorkspace={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'paw house' } });
    fireEvent.click(screen.getByRole('button', { name: /search google/i }));

    expect(await screen.findByText('Paw House Grooming')).toBeInTheDocument();
    expect(searchGroomerBusinesses).toHaveBeenCalledWith('tok', 'paw house');
  });

  it('adds a business: links the place then files a pending membership', async () => {
    searchGroomerBusinesses.mockResolvedValueOnce([candidate]);
    linkGroomerBusiness.mockResolvedValueOnce({ id: 'groomer-9', name: 'Paw House Grooming' });
    requestGroomerMembership.mockResolvedValueOnce({ id: 'membership-9', status: 'pending' });
    const setWorkspace = vi.fn();

    render(<AddYourBusiness account={account} setWorkspace={setWorkspace} />);
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'paw house' } });
    fireEvent.click(screen.getByRole('button', { name: /search google/i }));
    await screen.findByText('Paw House Grooming');

    fireEvent.click(screen.getByRole('button', { name: /this is my business/i }));

    await waitFor(() => expect(linkGroomerBusiness).toHaveBeenCalledWith('tok', 'place-1'));
    expect(requestGroomerMembership).toHaveBeenCalledWith({ id: 'supabase' }, account, 'groomer-9');
    expect(setWorkspace).toHaveBeenCalled();
    expect(await screen.findByText(/sent for verification/i)).toBeInTheDocument();
  });

  it('surfaces a link error', async () => {
    searchGroomerBusinesses.mockResolvedValueOnce([candidate]);
    linkGroomerBusiness.mockRejectedValueOnce(new Error('That business is missing a name on Google.'));

    render(<AddYourBusiness account={account} setWorkspace={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'paw house' } });
    fireEvent.click(screen.getByRole('button', { name: /search google/i }));
    await screen.findByText('Paw House Grooming');

    fireEvent.click(screen.getByRole('button', { name: /this is my business/i }));
    expect(await screen.findByText('That business is missing a name on Google.')).toBeInTheDocument();
  });
});

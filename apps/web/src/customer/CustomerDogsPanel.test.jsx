import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomerDogsPanel } from './CustomerDogsPanel.jsx';

const createDogForCustomer = vi.fn();
const requireSupabaseClient = vi.fn();

vi.mock('../api/dogs.js', () => ({
  DOG_SIZE_OPTIONS: [
    { value: 'toy', label: 'Toy' },
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
    { value: 'xlarge', label: 'Extra large' },
  ],
  createDogForCustomer: (...args) => createDogForCustomer(...args),
}));

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => requireSupabaseClient(),
}));

const supabase = { id: 'supabase-client' };
const customer = {
  id: 'customer-1',
  authUserId: 'auth-user-1',
  name: 'Alex',
};

describe('CustomerDogsPanel', () => {
  afterEach(() => {
    createDogForCustomer.mockReset();
    requireSupabaseClient.mockReset();
  });

  it('renders the dog profiles provided by the owning container', () => {
    render(
      <CustomerDogsPanel
        customer={customer}
        dogs={[
          {
            id: 'dog-1',
            customerId: customer.id,
            name: 'Mochi',
            breed: 'Cavapoo',
            size: 'small',
            birthdate: '2022-04-10',
            weightLbs: 18,
            coatType: 'Curly',
            temperament: 'Nervous around dryers',
            allergies: 'Chicken',
            preferredServiceId: 'full-groom',
            preferredGroomerId: 'groomer-1',
            preferredGroomerName: 'Paw House',
            lastGroomedAt: '2026-03-01',
            groomingIntervalWeeks: 6,
            notes: 'Nervous around dryers',
          },
        ]}
      />,
    );

    expect(screen.getByText('Mochi')).toBeInTheDocument();
    expect(screen.getByText('Cavapoo')).toBeInTheDocument();
    const dogProfile = within(screen.getByLabelText('Mochi profile'));
    expect(dogProfile.getByText('Small')).toBeInTheDocument();
    expect(screen.getByText('Mochi Needs Grooming Soon')).toBeInTheDocument();
    expect(dogProfile.getByText('Preferred service')).toBeInTheDocument();
    expect(dogProfile.getByText('Full groom')).toBeInTheDocument();
    expect(dogProfile.getByText('Paw House')).toBeInTheDocument();
    expect(screen.getByText('Last visit: Mar 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Usual cadence: every 6 weeks')).toBeInTheDocument();
  });

  it('shows the loading state while the container is still fetching dogs', () => {
    render(<CustomerDogsPanel customer={customer} dogs={[]} loading />);

    expect(screen.getByText('Loading dog profiles...')).toBeInTheDocument();
  });

  it('shows the empty state when the customer has no dogs yet', () => {
    render(<CustomerDogsPanel customer={customer} dogs={[]} />);

    expect(screen.getByText('No dog profiles yet.')).toBeInTheDocument();
  });

  it('creates a dog profile tied to the verified customer row and reports it upward', async () => {
    const onDogCreated = vi.fn();
    requireSupabaseClient.mockReturnValue(supabase);
    createDogForCustomer.mockResolvedValueOnce({
      id: 'dog-1',
      customerId: customer.id,
      name: 'Mochi',
      breed: 'Cavapoo',
      size: 'small',
      birthdate: '2022-04-10',
      weightLbs: 18,
      coatType: 'Curly',
      temperament: 'Nervous around dryers',
      allergies: 'Chicken',
      preferredServiceId: 'bath-brush',
      preferredGroomerId: 'groomer-2',
      preferredGroomerName: 'SoHo Pups',
      lastGroomedAt: '2026-04-01',
      groomingIntervalWeeks: 6,
      notes: 'Nervous around dryers',
    });

    render(
      <CustomerDogsPanel
        customer={customer}
        dogs={[]}
        groomers={[
          { id: 'groomer-1', name: 'Paw House' },
          { id: 'groomer-2', name: 'SoHo Pups' },
        ]}
        onDogCreated={onDogCreated}
        selectedService={{ id: 'bath-brush', name: 'Bath and brush' }}
      />,
    );

    expect(screen.getByText('No dog profiles yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Dog name'), {
      target: { value: 'Mochi' },
    });
    fireEvent.change(screen.getByLabelText('Breed'), {
      target: { value: 'Cavapoo' },
    });
    fireEvent.change(screen.getByLabelText('Size'), {
      target: { value: 'small' },
    });
    fireEvent.change(screen.getByLabelText('Birthday'), {
      target: { value: '2022-04-10' },
    });
    fireEvent.change(screen.getByLabelText('Weight in pounds'), {
      target: { value: '18' },
    });
    fireEvent.change(screen.getByLabelText('Coat type'), {
      target: { value: 'Curly' },
    });
    fireEvent.change(screen.getByLabelText('Temperament'), {
      target: { value: 'Nervous around dryers' },
    });
    fireEvent.change(screen.getByLabelText('Allergies'), {
      target: { value: 'Chicken' },
    });
    fireEvent.change(screen.getByLabelText('Preferred service'), {
      target: { value: 'bath-brush' },
    });
    fireEvent.change(screen.getByLabelText('Preferred groomer'), {
      target: { value: 'groomer-2' },
    });
    fireEvent.change(screen.getByLabelText('Last groomed'), {
      target: { value: '2026-04-01' },
    });
    fireEvent.change(screen.getByLabelText('Grooming cadence'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Nervous around dryers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add dog' }));

    await waitFor(() => {
      expect(createDogForCustomer).toHaveBeenCalledWith(supabase, customer, {
        name: 'Mochi',
        breed: 'Cavapoo',
        size: 'small',
        birthdate: '2022-04-10',
        weightLbs: '18',
        coatType: 'Curly',
        temperament: 'Nervous around dryers',
        allergies: 'Chicken',
        preferredServiceId: 'bath-brush',
        preferredGroomerId: 'groomer-2',
        preferredGroomerName: 'SoHo Pups',
        lastGroomedAt: '2026-04-01',
        groomingIntervalWeeks: '6',
        notes: 'Nervous around dryers',
      });
    });
    expect(onDogCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dog-1',
        customerId: customer.id,
      }),
    );
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomerDogsPanel } from './CustomerDogsPanel.jsx';

const createDogForCustomer = vi.fn();
const loadDogsForCustomer = vi.fn();
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
  loadDogsForCustomer: (...args) => loadDogsForCustomer(...args),
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
    loadDogsForCustomer.mockReset();
    requireSupabaseClient.mockReset();
  });

  it('loads dog profiles for the verified customer row', async () => {
    const onDogsChange = vi.fn();
    requireSupabaseClient.mockReturnValue(supabase);
    loadDogsForCustomer.mockResolvedValueOnce([
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
    ]);

    render(<CustomerDogsPanel customer={customer} onDogsChange={onDogsChange} />);

    expect(screen.getByText('Loading dog profiles...')).toBeInTheDocument();

    await waitFor(() => {
      expect(loadDogsForCustomer).toHaveBeenCalledWith(supabase, customer);
    });
    await waitFor(() => {
      expect(onDogsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          id: 'dog-1',
          customerId: customer.id,
        }),
      ]);
    });
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

  it('creates a dog profile tied to the verified customer row', async () => {
    const onDogsChange = vi.fn();
    requireSupabaseClient.mockReturnValue(supabase);
    loadDogsForCustomer.mockResolvedValueOnce([]);
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
        groomers={[
          { id: 'groomer-1', name: 'Paw House' },
          { id: 'groomer-2', name: 'SoHo Pups' },
        ]}
        onDogsChange={onDogsChange}
        selectedService={{ id: 'bath-brush', name: 'Bath and brush' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No dog profiles yet.')).toBeInTheDocument();
    });

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
    expect(screen.getByText('Mochi')).toBeInTheDocument();
    expect(onDogsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 'dog-1',
        customerId: customer.id,
      }),
    ]);
  });
});

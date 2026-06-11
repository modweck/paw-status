import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingWizard } from './OnboardingWizard.jsx';

const createOwnedGroomer = vi.fn();
const refreshGroomerServices = vi.fn();
const saveOffering = vi.fn();
const saveAvailabilityBlock = vi.fn();
const setWaitlistOptIn = vi.fn();
const suggestAddresses = vi.fn();
const resolvePlace = vi.fn();

vi.mock('../../api/groomerOnboarding.js', () => ({
  createOwnedGroomer: (...args) => createOwnedGroomer(...args),
  refreshGroomerServices: (...args) => refreshGroomerServices(...args),
  saveOffering: (...args) => saveOffering(...args),
  saveAvailabilityBlock: (...args) => saveAvailabilityBlock(...args),
  setWaitlistOptIn: (...args) => setWaitlistOptIn(...args),
}));

vi.mock('../../api/geocoding.js', () => ({
  suggestAddresses: (...args) => suggestAddresses(...args),
  resolvePlace: (...args) => resolvePlace(...args),
}));

vi.mock('../GbpConnectButton.jsx', () => ({
  GbpConnectButton: ({ groomerId }) => <div>GBP connect for {groomerId}</div>,
}));

const supabase = { id: 'supabase-client' };
const onComplete = vi.fn();

function fillStepOne() {
  fireEvent.change(screen.getByLabelText(/Business Name/), {
    target: { value: 'Happy Paws' },
  });
  fireEvent.change(screen.getByLabelText(/Salon\/Grooming Location/), {
    target: { value: 'Happy Paws Salon' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

async function fillStepTwo() {
  suggestAddresses.mockResolvedValueOnce([
    {
      placeId: 'place-1',
      displayName: '123 Main St, New York, NY 10001',
    },
  ]);
  resolvePlace.mockResolvedValueOnce({
    lat: 40.7484,
    lng: -73.9857,
    displayName: '123 Main St, New York, NY 10001, USA',
  });

  fireEvent.change(screen.getByLabelText(/Address/), {
    target: { value: '123 Main' },
  });

  const suggestion = await screen.findByRole('option', {
    name: '123 Main St, New York, NY 10001',
  });
  fireEvent.click(suggestion);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function fillStepThree() {
  fireEvent.click(screen.getByRole('button', { name: '+ Add service' }));
  fireEvent.change(screen.getByPlaceholderText('e.g., Bath & Haircut'), {
    target: { value: 'Full groom' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function fillStepFour() {
  // The editor's defaults (Sunday 09:00-17:00) are already valid.
  fireEvent.click(screen.getByRole('button', { name: '+ Add availability block' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

describe('OnboardingWizard steps', () => {
  afterEach(() => {
    createOwnedGroomer.mockReset();
    refreshGroomerServices.mockReset();
    saveOffering.mockReset();
    saveAvailabilityBlock.mockReset();
    setWaitlistOptIn.mockReset();
    suggestAddresses.mockReset();
    resolvePlace.mockReset();
    onComplete.mockReset();
  });

  it('renders step 1 (Business) on mount', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    expect(screen.getByText('Business Information')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('disables Next until both Business fields are filled', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Business Name/), {
      target: { value: 'Happy Paws' },
    });
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Salon\/Grooming Location/), {
      target: { value: 'Happy Paws Salon' },
    });
    expect(nextButton).not.toBeDisabled();
  });

  it('goes back to step 1 when clicking Previous on step 2', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    fillStepOne();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Business Information')).toBeInTheDocument();
  });

  it('resolves the salon location from an address suggestion instead of raw coordinates', async () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    fillStepOne();

    // Raw lat/lng/placeId inputs are gone — address search is the only path.
    expect(screen.queryByLabelText(/Latitude/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Longitude/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Place ID/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    suggestAddresses.mockResolvedValueOnce([
      {
        placeId: 'place-1',
        displayName: '123 Main St, New York, NY 10001',
      },
    ]);
    resolvePlace.mockResolvedValueOnce({
      lat: 40.7484,
      lng: -73.9857,
      displayName: '123 Main St, New York, NY 10001, USA',
    });

    fireEvent.change(screen.getByLabelText(/Address/), {
      target: { value: '123 Main' },
    });

    const suggestion = await screen.findByRole('option', {
      name: '123 Main St, New York, NY 10001',
    });
    fireEvent.click(suggestion);

    await waitFor(() => {
      expect(screen.getByLabelText(/Address/)).toHaveValue(
        '123 Main St, New York, NY 10001, USA',
      );
    });
    expect(resolvePlace).toHaveBeenCalledWith('place-1');
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });
});

describe('OnboardingWizard finish flow', () => {
  afterEach(() => {
    createOwnedGroomer.mockReset();
    refreshGroomerServices.mockReset();
    saveOffering.mockReset();
    saveAvailabilityBlock.mockReset();
    setWaitlistOptIn.mockReset();
    suggestAddresses.mockReset();
    resolvePlace.mockReset();
    onComplete.mockReset();
  });

  async function completeWizard() {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);
    fillStepOne();
    await fillStepTwo();
    fillStepThree();
    fillStepFour();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  }

  it('creates the owned groomer with the collected business and location data', async () => {
    createOwnedGroomer.mockResolvedValueOnce({ id: 'new-groomer-1' });
    saveOffering.mockResolvedValue({ id: 'offering-1' });
    saveAvailabilityBlock.mockResolvedValue({ id: 'block-1' });
    setWaitlistOptIn.mockResolvedValue({ id: 'new-groomer-1', acceptsWaitlist: true });
    refreshGroomerServices.mockResolvedValue();

    await completeWizard();

    await waitFor(() => {
      expect(createOwnedGroomer).toHaveBeenCalledWith(supabase, {
        name: 'Happy Paws',
        salon: 'Happy Paws Salon',
        address: '123 Main St, New York, NY 10001, USA',
        lat: 40.7484,
        lng: -73.9857,
      });
    });
    expect(saveOffering).toHaveBeenCalledWith(supabase, 'new-groomer-1', {
      service: 'Full groom',
      durationMinutes: 60,
      basePriceCents: 5000,
    });
    expect(saveAvailabilityBlock).toHaveBeenCalledWith(supabase, 'new-groomer-1', {
      dayOfWeek: 0,
      openTime: '09:00',
      closeTime: '17:00',
    });
    expect(setWaitlistOptIn).toHaveBeenCalledWith(supabase, 'new-groomer-1', true);
    expect(refreshGroomerServices).toHaveBeenCalledWith(supabase, 'new-groomer-1');
  });

  it('shows the live state with GBP connect after finishing, then completes on dashboard click', async () => {
    createOwnedGroomer.mockResolvedValueOnce({ id: 'new-groomer-1' });
    saveOffering.mockResolvedValue({ id: 'offering-1' });
    saveAvailabilityBlock.mockResolvedValue({ id: 'block-1' });
    setWaitlistOptIn.mockResolvedValue({ id: 'new-groomer-1', acceptsWaitlist: true });
    refreshGroomerServices.mockResolvedValue();

    await completeWizard();

    expect(await screen.findByText(/is live/i)).toBeInTheDocument();
    expect(screen.getByText('GBP connect for new-groomer-1')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Go to dashboard/i }));
    expect(onComplete).toHaveBeenCalled();
  });

  it('surfaces an error and stays on the wizard when creation fails', async () => {
    createOwnedGroomer.mockRejectedValueOnce(new Error('caller must have a groomer_accounts row'));

    await completeWizard();

    expect(
      await screen.findByText('caller must have a groomer_accounts row'),
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(saveOffering).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });
});

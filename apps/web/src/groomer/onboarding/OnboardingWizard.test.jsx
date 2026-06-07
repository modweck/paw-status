import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingWizard } from './OnboardingWizard.jsx';

const createOwnedGroomer = vi.fn();
const saveOffering = vi.fn();
const saveAvailabilityBlock = vi.fn();
const setWaitlistOptIn = vi.fn();

vi.mock('../../api/groomerOnboarding.js', () => ({
  createOwnedGroomer: (...args) => createOwnedGroomer(...args),
  saveOffering: (...args) => saveOffering(...args),
  saveAvailabilityBlock: (...args) => saveAvailabilityBlock(...args),
  setWaitlistOptIn: (...args) => setWaitlistOptIn(...args),
}));

const supabase = { id: 'supabase-client' };
const onComplete = vi.fn();

describe('OnboardingWizard', () => {
  afterEach(() => {
    createOwnedGroomer.mockReset();
    saveOffering.mockReset();
    saveAvailabilityBlock.mockReset();
    setWaitlistOptIn.mockReset();
    onComplete.mockReset();
  });

  it('renders step 1 (Business) on mount', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByText('Business Information')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('renders Business Name and Salon fields on step 1', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    expect(screen.getByLabelText(/Business Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Salon\/Grooming Location/)).toBeInTheDocument();
  });

  it('disables Next button when required Business fields are empty', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();
  });

  it('keeps Next button disabled when only Business Name is filled', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });

    expect(nextButton).toBeDisabled();
  });

  it('disables Next button when Business Name is empty but Salon is filled', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(salonInput, { target: { value: 'Downtown' } });

    expect(nextButton).toBeDisabled();
  });

  it('enables Next button when both Business Name and Salon are filled', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });

    expect(nextButton).not.toBeDisabled();
  });

  it('disables Next button when Business Name becomes empty after being filled', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    expect(nextButton).not.toBeDisabled();

    fireEvent.change(nameInput, { target: { value: '' } });
    expect(nextButton).toBeDisabled();
  });

  it('advances to step 2 when clicking enabled Next button', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    fireEvent.click(nextButton);

    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByLabelText(/Address/)).toBeInTheDocument();
  });

  it('shows Previous button on step 2', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    fireEvent.click(nextButton);

    const prevButton = screen.getByRole('button', { name: 'Previous' });
    expect(prevButton).toBeInTheDocument();
  });

  it('goes back to step 1 when clicking Previous button', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    fireEvent.click(nextButton);

    const prevButton = screen.getByRole('button', { name: 'Previous' });
    fireEvent.click(prevButton);

    expect(screen.getByText('Business Information')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });

  it('renders Location fields on step 2', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    const nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    fireEvent.click(nextButton);

    expect(screen.getByLabelText(/Address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Latitude/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Longitude/)).toBeInTheDocument();
  });

  it('disables Next on step 2 when address is empty', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    // Advance to step 2
    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    let nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    fireEvent.click(nextButton);

    // On step 2, Next should be disabled
    nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();
  });

  it('enables Next on step 2 when address and coordinates are filled', () => {
    render(<OnboardingWizard supabase={supabase} onComplete={onComplete} />);

    // Advance to step 2
    const nameInput = screen.getByLabelText(/Business Name/);
    const salonInput = screen.getByLabelText(/Salon\/Grooming Location/);
    let nextButton = screen.getByRole('button', { name: 'Next' });

    fireEvent.change(nameInput, { target: { value: 'Happy Paws' } });
    fireEvent.change(salonInput, { target: { value: 'Downtown' } });
    fireEvent.click(nextButton);

    // Fill location fields
    const addressInput = screen.getByLabelText(/Address/);
    const latInput = screen.getByLabelText(/Latitude/);
    const lngInput = screen.getByLabelText(/Longitude/);

    fireEvent.change(addressInput, { target: { value: '123 Main St' } });
    fireEvent.change(latInput, { target: { value: '40.7128' } });
    fireEvent.change(lngInput, { target: { value: '-74.006' } });

    nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).not.toBeDisabled();
  });
});

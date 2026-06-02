import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroomerProfileManager } from './GroomerProfileManager.jsx';
import { loadGroomerProfile } from '../api/groomerProfile.js';

vi.mock('../lib/supabaseClient.js', () => ({
  requireSupabaseClient: () => ({ id: 'supabase' }),
}));

vi.mock('../api/groomerProfile.js', () => ({
  loadGroomerProfile: vi.fn(async (_c, id) => ({
    id,
    name: id === 'g2' ? 'Shiny Snouts' : 'Paw House',
    salon: '',
    phone: '',
    website: '',
    timezone: 'America/New_York',
    leadTimeHours: 12,
  })),
  updateGroomerBusinessDetails: vi.fn(),
}));

vi.mock('../api/groomerOfferings.js', () => ({
  loadOfferings: vi.fn(async () => []),
  createOffering: vi.fn(),
  updateOffering: vi.fn(),
  deleteOffering: vi.fn(),
}));

vi.mock('../api/groomerAvailability.js', () => ({
  loadWeeklyHours: vi.fn(async () => []),
  loadTimeOff: vi.fn(async () => []),
  createWeeklyHours: vi.fn(),
  updateWeeklyHours: vi.fn(),
  deleteWeeklyHours: vi.fn(),
  createTimeOff: vi.fn(),
  deleteTimeOff: vi.fn(),
}));

const oneProfile = [{ id: 'm1', groomerId: 'g1', groomer: { name: 'Paw House' } }];
const twoProfiles = [
  { id: 'm1', groomerId: 'g1', groomer: { name: 'Paw House' } },
  { id: 'm2', groomerId: 'g2', groomer: { name: 'Shiny Snouts' } },
];

afterEach(() => vi.clearAllMocks());

describe('GroomerProfileManager', () => {
  it('renders nothing without a verified membership', () => {
    const { container } = render(<GroomerProfileManager verifiedMemberships={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads the active profile and renders all editor sections', async () => {
    render(<GroomerProfileManager verifiedMemberships={oneProfile} />);

    expect(await screen.findByText('Business details')).toBeInTheDocument();
    expect(screen.getByText('Services & pricing')).toBeInTheDocument();
    expect(screen.getByText('Weekly hours')).toBeInTheDocument();
    expect(screen.getByText('Time off')).toBeInTheDocument();
    expect(loadGroomerProfile).toHaveBeenCalledWith({ id: 'supabase' }, 'g1');
    // No selector with a single profile.
    expect(screen.queryByLabelText('Active groomer profile')).not.toBeInTheDocument();
  });

  it('shows a profile selector and reloads on switch when multiple profiles exist', async () => {
    render(<GroomerProfileManager verifiedMemberships={twoProfiles} />);

    await screen.findByText('Business details');
    const selector = screen.getByLabelText('Active groomer profile');
    expect(selector).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'g2' } });

    await waitFor(() => expect(loadGroomerProfile).toHaveBeenCalledWith({ id: 'supabase' }, 'g2'));
  });
});

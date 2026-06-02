import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GroomerServiceFields } from './GroomerServiceFields.jsx';
import { chooseServiceForGroomer, serviceOptionsForGroomer } from './groomerServices.js';
import { GROOMING_SERVICES } from '../data/services.js';

const groomers = [
  { id: 'groomer-1', name: 'Paw House' },
  { id: 'groomer-2', name: 'Shiny Snouts' },
];

describe('GroomerServiceFields', () => {
  it('renders an option per groomer and grouped service options', () => {
    render(
      <GroomerServiceFields
        groomers={groomers}
        groomerId="groomer-1"
        onGroomerChange={vi.fn()}
        serviceOptions={GROOMING_SERVICES}
        service="full-groom"
        onServiceChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: 'Paw House' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Shiny Snouts' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Full groom' })).toBeInTheDocument();
  });

  it('reports groomer and service changes', () => {
    const onGroomerChange = vi.fn();
    const onServiceChange = vi.fn();

    render(
      <GroomerServiceFields
        groomers={groomers}
        groomerId="groomer-1"
        onGroomerChange={onGroomerChange}
        serviceOptions={GROOMING_SERVICES}
        service="full-groom"
        onServiceChange={onServiceChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Groomer'), { target: { value: 'groomer-2' } });
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'bath-brush' } });

    expect(onGroomerChange).toHaveBeenCalledWith('groomer-2');
    expect(onServiceChange).toHaveBeenCalledWith('bath-brush');
  });
});

describe('groomerServices helpers', () => {
  it('returns all services when a groomer offers none explicitly', () => {
    expect(serviceOptionsForGroomer({ id: 'g' })).toEqual(GROOMING_SERVICES);
  });

  it('narrows to the groomer offered services when present', () => {
    const options = serviceOptionsForGroomer({ id: 'g', services: ['bath-brush'] });
    expect(options.map((option) => option.id)).toEqual(['bath-brush']);
  });

  it('prefers the dog preferred service, then the selected service, then the first option', () => {
    const groomer = { id: 'g' };
    expect(
      chooseServiceForGroomer(groomer, { dog: { preferredServiceId: 'haircut' } }),
    ).toBe('haircut');
    expect(
      chooseServiceForGroomer(groomer, { selectedService: { id: 'bath-brush' } }),
    ).toBe('bath-brush');
    expect(chooseServiceForGroomer(groomer)).toBe(GROOMING_SERVICES[0].id);
  });
});

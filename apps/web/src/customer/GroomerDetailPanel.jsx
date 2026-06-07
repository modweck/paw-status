import { useMemo, useState } from 'react';

import { createSlotBookingRequest } from '../api/appointments.js';
import { GROOMING_SERVICES, groupGroomingServices } from '../data/services.js';
import { SlotPicker } from './SlotPicker.jsx';

/**
 * Get the services offered by a groomer
 * @param {Object} groomer - Groomer object with services array
 * @returns {Array} Array of service objects offered by this groomer
 */
function getGroomerServices(groomer) {
  const offeredServiceIds = Array.isArray(groomer?.services) ? groomer.services : [];
  if (!offeredServiceIds.length) return GROOMING_SERVICES;

  const matched = GROOMING_SERVICES.filter((service) =>
    offeredServiceIds.includes(service.id),
  );
  return matched.length ? matched : GROOMING_SERVICES;
}

/**
 * GroomerDetailPanel - Allows a customer to book a specific groomer
 * Renders service and dog selectors, then slot picker for booking
 *
 * @param {Object} props
 * @param {Object} props.groomer - The selected groomer
 * @param {Object} props.customer - The logged-in customer
 * @param {Array} props.dogs - Array of customer's dogs
 * @param {Object} props.supabase - Supabase client
 * @param {Function} props.onBooked - Callback when booking is created
 */
export function GroomerDetailPanel({ groomer, customer, dogs, supabase, onBooked }) {
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedDogId, setSelectedDogId] = useState(dogs[0]?.id || '');
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const availableServices = useMemo(
    () => getGroomerServices(groomer),
    [groomer],
  );

  // Initialize service selection
  useMemo(() => {
    if (!selectedServiceId && availableServices.length) {
      setSelectedServiceId(availableServices[0].id);
    }
  }, [selectedServiceId, availableServices]);

  const selectedDog = useMemo(
    () => dogs.find((dog) => dog.id === selectedDogId) || dogs[0] || null,
    [selectedDogId, dogs],
  );

  async function handleSlotPicked(slot) {
    setIsLoading(true);
    setError('');

    try {
      const serviceName = availableServices.find(
        (service) => service.id === selectedServiceId,
      )?.name || selectedServiceId;

      await createSlotBookingRequest(supabase, {
        customerId: customer.id,
        dogId: selectedDogId,
        groomerId: groomer.id,
        service: serviceName,
        preferredWindows: [{ slot: slot.slotId, time: slot.startTime }],
      });

      setShowSlotPicker(false);
      if (typeof onBooked === 'function') {
        onBooked();
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!dogs.length) {
    return (
      <div className="groomer-detail-panel">
        <p>Please add a dog profile before booking.</p>
      </div>
    );
  }

  if (showSlotPicker) {
    return (
      <div className="groomer-detail-panel">
        <button
          className="back-button"
          onClick={() => setShowSlotPicker(false)}
          type="button"
        >
          Back
        </button>
        <SlotPicker
          groomerId={groomer.id}
          serviceId={selectedServiceId}
          supabase={supabase}
          onPick={handleSlotPicked}
        />
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="groomer-detail-panel">
      <form className="groomer-detail-form">
        <label>
          <span>Service</span>
          <select
            aria-label="Service"
            value={selectedServiceId}
            onChange={(event) => setSelectedServiceId(event.target.value)}
          >
            {groupGroomingServices(availableServices).map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label>
          <span>Dog</span>
          <select
            aria-label="Dog"
            value={selectedDogId}
            onChange={(event) => setSelectedDogId(event.target.value)}
          >
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>

        <button
          className="primary-action"
          type="button"
          onClick={() => setShowSlotPicker(true)}
          disabled={isLoading || !selectedServiceId || !selectedDogId}
        >
          {isLoading ? 'Booking...' : 'Choose time slot'}
        </button>

        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </div>
  );
}

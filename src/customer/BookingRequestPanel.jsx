import { CalendarCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  buildPreferredWindows,
  createBookingRequest,
  TIME_OF_DAY_OPTIONS,
} from '../api/bookingRequests.js';
import { DOG_SIZE_OPTIONS } from '../api/dogs.js';
import { GROOMING_SERVICES, groupGroomingServices } from '../data/services.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function findById(items, id) {
  return items.find((item) => item.id === id) || items[0] || null;
}

function findExactById(items, id) {
  return items.find((item) => item.id === id) || null;
}

function serviceOptionsForGroomer(groomer) {
  const offeredServices = Array.isArray(groomer?.services) ? groomer.services : [];
  if (!offeredServices.length) return GROOMING_SERVICES;

  const matchedServices = GROOMING_SERVICES.filter((serviceOption) =>
    offeredServices.includes(serviceOption.id),
  );
  return matchedServices.length ? matchedServices : GROOMING_SERVICES;
}

function chooseServiceForGroomer(groomer, dog, selectedService) {
  const serviceOptions = serviceOptionsForGroomer(groomer);
  if (
    dog?.preferredServiceId &&
    serviceOptions.some((serviceOption) => serviceOption.id === dog.preferredServiceId)
  ) {
    return dog.preferredServiceId;
  }

  if (
    selectedService?.id &&
    serviceOptions.some((serviceOption) => serviceOption.id === selectedService.id)
  ) {
    return selectedService.id;
  }

  return serviceOptions[0]?.id || GROOMING_SERVICES[0].id;
}

function dogSizeLabel(value) {
  return DOG_SIZE_OPTIONS.find((option) => option.value === value)?.label || value || '';
}

function buildCustomerNotes(customerNotes, dog) {
  const dogDetails = [
    dog?.name ? `Dog: ${dog.name}` : '',
    dog?.size ? `Size: ${dogSizeLabel(dog.size)}` : '',
    dog?.breed ? `Breed: ${dog.breed}` : '',
    dog?.temperament ? `Temperament: ${dog.temperament}` : '',
    dog?.notes ? `Dog notes: ${dog.notes}` : '',
  ].filter(Boolean);
  const cleanedCustomerNotes = String(customerNotes || '').trim();

  if (!dogDetails.length) return cleanedCustomerNotes;
  if (!cleanedCustomerNotes) return dogDetails.join('\n');

  return `${cleanedCustomerNotes}\n\n${dogDetails.join('\n')}`;
}

export function BookingRequestPanel({
  customer,
  dogs,
  groomers,
  selectedGroomer,
  selectedService,
}) {
  const initialDog = dogs[0] || null;
  const initialGroomer =
    findExactById(groomers, initialDog?.preferredGroomerId) ||
    selectedGroomer ||
    groomers[0] ||
    null;
  const [dogId, setDogId] = useState(dogs[0]?.id || '');
  const [groomerId, setGroomerId] = useState(initialGroomer?.id || '');
  const [service, setService] = useState(
    chooseServiceForGroomer(initialGroomer, initialDog, selectedService),
  );
  const [dogSize, setDogSize] = useState(initialDog?.size || '');
  const [firstAvailable, setFirstAvailable] = useState(true);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeOfDay, setPreferredTimeOfDay] = useState('morning');
  const [backupDate, setBackupDate] = useState('');
  const [backupTimeOfDay, setBackupTimeOfDay] = useState('afternoon');
  const [customerNotes, setCustomerNotes] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [bookingRequest, setBookingRequest] = useState(null);

  const selectedDog = useMemo(() => findById(dogs, dogId), [dogId, dogs]);
  const activeGroomer = useMemo(() => findById(groomers, groomerId), [groomerId, groomers]);
  const serviceOptions = useMemo(() => serviceOptionsForGroomer(activeGroomer), [activeGroomer]);

  useEffect(() => {
    if (!dogs.some((dog) => dog.id === dogId)) {
      setDogId(dogs[0]?.id || '');
    }
  }, [dogId, dogs]);

  useEffect(() => {
    const preferredGroomer = findExactById(groomers, selectedDog?.preferredGroomerId);
    if (preferredGroomer) {
      setGroomerId(preferredGroomer.id);
    }
    setDogSize(selectedDog?.size || '');
  }, [groomers, selectedDog?.id, selectedDog?.preferredGroomerId]);

  useEffect(() => {
    if (!groomers.some((groomer) => groomer.id === groomerId)) {
      setGroomerId(selectedGroomer?.id || groomers[0]?.id || '');
    }
  }, [groomers, groomerId, selectedGroomer?.id]);

  useEffect(() => {
    if (selectedGroomer?.id && !selectedDog?.preferredGroomerId) {
      setGroomerId(selectedGroomer.id);
    }
  }, [selectedDog?.preferredGroomerId, selectedGroomer?.id]);

  useEffect(() => {
    const preferredService = chooseServiceForGroomer(activeGroomer, selectedDog, selectedService);
    if (
      selectedDog?.preferredServiceId &&
      serviceOptions.some((serviceOption) => serviceOption.id === selectedDog.preferredServiceId)
    ) {
      setService(selectedDog.preferredServiceId);
      return;
    }

    if (!serviceOptions.some((serviceOption) => serviceOption.id === service)) {
      setService(preferredService);
    }
  }, [activeGroomer, selectedDog, selectedService, service, serviceOptions]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setBookingRequest(null);
    setStatus('saving');

    try {
      const request = await createBookingRequest(
        requireSupabaseClient(),
        customer,
        {
          ...selectedDog,
          size: dogSize || selectedDog?.size,
        },
        activeGroomer,
        {
          service,
          preferredWindows: buildPreferredWindows({
            backupDate,
            backupTimeOfDay,
            firstAvailable,
            preferredDate,
            preferredTimeOfDay,
          }),
          customerNotes: buildCustomerNotes(customerNotes, {
            ...selectedDog,
            size: dogSize || selectedDog?.size,
          }),
        },
      );
      setBookingRequest(request);
      setStatus('saved');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  if (!dogs.length) {
    return (
      <section className="signed-in-card booking-request-panel">
        <div className="login-panel__icon">
          <CalendarCheck size={18} />
        </div>
        <div>
          <h2>Booking request</h2>
          <p>Add a dog profile before requesting a booking.</p>
        </div>
      </section>
    );
  }

  if (!groomers.length) {
    return (
      <section className="signed-in-card booking-request-panel">
        <div className="login-panel__icon">
          <CalendarCheck size={18} />
        </div>
        <div>
          <h2>Booking request</h2>
          <p>Search for groomers before requesting a booking.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="signed-in-card booking-request-panel">
      <div className="login-panel__icon">
        <CalendarCheck size={18} />
      </div>
      <div>
        <h2>Booking request</h2>
        <p>Pick preferred times. Confirmation still happens with the groomer.</p>
      </div>

      {bookingRequest ? (
        <div className="request-confirmation">
          <h3>Booking request saved</h3>
          <p>We saved the request under your account.</p>
          {bookingRequest.externalBookingUrl ? (
            <a href={bookingRequest.externalBookingUrl} target="_blank" rel="noreferrer">
              Continue on groomer site
            </a>
          ) : null}
        </div>
      ) : null}

      <form className="booking-request-form" onSubmit={handleSubmit}>
        <div className="booking-request-form__grid">
          <label>
            <span>Dog</span>
            <select aria-label="Dog" value={dogId} onChange={(event) => setDogId(event.target.value)}>
              {dogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  {dog.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Groomer</span>
            <select
              aria-label="Groomer"
              value={groomerId}
              onChange={(event) => setGroomerId(event.target.value)}
            >
              {groomers.map((groomer) => (
                <option key={groomer.id} value={groomer.id}>
                  {groomer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Service</span>
            <select
              aria-label="Service"
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              {groupGroomingServices(serviceOptions).map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.services.map((serviceOption) => (
                    <option key={serviceOption.id} value={serviceOption.id}>
                      {serviceOption.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span>Dog size</span>
            <select
              aria-label="Dog size"
              value={dogSize}
              onChange={(event) => setDogSize(event.target.value)}
            >
              <option value="">Choose size</option>
              {DOG_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Requested timing</legend>
          <label className="window-option">
            <input
              aria-label="First available"
              checked={firstAvailable}
              onChange={(event) => setFirstAvailable(event.target.checked)}
              type="checkbox"
            />
            <span>First available is okay</span>
          </label>
          <div className="booking-request-form__grid">
            <label>
              <span>Preferred date</span>
              <input
                aria-label="Preferred date"
                type="date"
                value={preferredDate}
                onChange={(event) => setPreferredDate(event.target.value)}
              />
            </label>
            <label>
              <span>Preferred time of day</span>
              <select
                aria-label="Preferred time of day"
                value={preferredTimeOfDay}
                onChange={(event) => setPreferredTimeOfDay(event.target.value)}
              >
                {TIME_OF_DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Backup date</span>
              <input
                aria-label="Backup date"
                type="date"
                value={backupDate}
                onChange={(event) => setBackupDate(event.target.value)}
              />
            </label>
            <label>
              <span>Backup time of day</span>
              <select
                aria-label="Backup time of day"
                value={backupTimeOfDay}
                onChange={(event) => setBackupTimeOfDay(event.target.value)}
              >
                {TIME_OF_DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <label>
          <span>Notes</span>
          <textarea
            aria-label="Notes"
            rows="3"
            value={customerNotes}
            onChange={(event) => setCustomerNotes(event.target.value)}
          />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Request booking'}
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

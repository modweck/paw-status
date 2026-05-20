import { CalendarCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { buildPreferredWindows, TIME_OF_DAY_OPTIONS } from '../api/bookingRequests.js';
import { DOG_SIZE_OPTIONS } from '../api/dogs.js';
import {
  createGuestBookingRequest,
  PENDING_GUEST_CLAIM_STORAGE_KEY,
} from '../api/guestBooking.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { GROOMING_SERVICES, groupGroomingServices } from '../data/services.js';

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

function chooseServiceForGroomer(groomer, selectedService) {
  const serviceOptions = serviceOptionsForGroomer(groomer);
  if (
    selectedService?.id &&
    serviceOptions.some((serviceOption) => serviceOption.id === selectedService.id)
  ) {
    return selectedService.id;
  }

  return serviceOptions[0]?.id || GROOMING_SERVICES[0].id;
}

export function GuestBookingPanel({
  groomers = [],
  selectedDogSize = '',
  selectedGroomer = null,
  selectedService = null,
}) {
  const { isConfigured, sendMagicLink } = useAuth();
  const initialGroomer = selectedGroomer || groomers[0] || null;
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    dogName: '',
    dogBreed: '',
    dogSize: selectedDogSize || '',
    dogNotes: '',
    customerNotes: '',
  });
  const [groomerId, setGroomerId] = useState(initialGroomer?.id || '');
  const [service, setService] = useState(chooseServiceForGroomer(initialGroomer, selectedService));
  const [firstAvailable, setFirstAvailable] = useState(true);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeOfDay, setPreferredTimeOfDay] = useState('morning');
  const [backupDate, setBackupDate] = useState('');
  const [backupTimeOfDay, setBackupTimeOfDay] = useState('afternoon');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savedRequest, setSavedRequest] = useState(null);

  const activeGroomer = useMemo(() => findById(groomers, groomerId), [groomerId, groomers]);
  const serviceOptions = useMemo(() => serviceOptionsForGroomer(activeGroomer), [activeGroomer]);

  useEffect(() => {
    if (!groomers.some((groomer) => groomer.id === groomerId)) {
      setGroomerId(selectedGroomer?.id || groomers[0]?.id || '');
    }
  }, [groomerId, groomers, selectedGroomer?.id]);

  useEffect(() => {
    if (selectedGroomer?.id) {
      setGroomerId(selectedGroomer.id);
    }
  }, [selectedGroomer?.id]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      dogSize: current.dogSize || selectedDogSize || '',
    }));
  }, [selectedDogSize]);

  useEffect(() => {
    const nextService = chooseServiceForGroomer(activeGroomer, selectedService);
    if (!serviceOptions.some((serviceOption) => serviceOption.id === service)) {
      setService(nextService);
    }
  }, [activeGroomer, selectedService, service, serviceOptions]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setMessage('');
    setSavedRequest(null);
    setStatus('saving');

    try {
      const result = await createGuestBookingRequest({
        customerEmail: form.customerEmail.trim(),
        customerName: form.customerName.trim(),
        customerNotes: form.customerNotes.trim(),
        customerPhone: form.customerPhone.trim(),
        dogBreed: form.dogBreed.trim(),
        dogName: form.dogName.trim(),
        dogNotes: form.dogNotes.trim(),
        dogSize: form.dogSize,
        groomerId,
        preferredWindows: buildPreferredWindows({
          backupDate,
          backupTimeOfDay,
          firstAvailable,
          preferredDate,
          preferredTimeOfDay,
        }),
        service,
      });
      if (result.claimToken && typeof window !== 'undefined') {
        window.localStorage.setItem(PENDING_GUEST_CLAIM_STORAGE_KEY, result.claimToken);
      }
      setSavedRequest(result);
      setStatus('saved');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  async function handleSaveInfo() {
    if (!savedRequest?.customerEmail || status === 'sending-link') return;

    setError('');
    setMessage('');
    setStatus('sending-link');

    try {
      await sendMagicLink(savedRequest.customerEmail);
      setMessage('Check your email to save this booking under your account.');
      setStatus('saved');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('saved');
    }
  }

  if (!groomers.length) {
    return (
      <section className="signed-in-card booking-request-panel guest-booking-panel">
        <div className="login-panel__icon">
          <CalendarCheck size={18} />
        </div>
        <div>
          <h2>Guest booking request</h2>
          <p>Search for groomers before requesting a booking.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="signed-in-card booking-request-panel guest-booking-panel">
      <div className="login-panel__icon">
        <CalendarCheck size={18} />
      </div>
      <div>
        <h2>Guest booking request</h2>
        <p>Send the request now. You can save the details to an account after it is sent.</p>
      </div>

      {savedRequest ? (
        <div className="request-confirmation">
          <h3>Booking request sent</h3>
          <p>We sent the request with your contact and dog details.</p>
          <button
            className="primary-action"
            type="button"
            disabled={!isConfigured || status === 'sending-link'}
            onClick={handleSaveInfo}
          >
            {status === 'sending-link' ? 'Sending...' : 'Save this info for next time'}
          </button>
        </div>
      ) : null}

      <form className="booking-request-form" onSubmit={handleSubmit}>
        <div className="booking-request-form__grid">
          <label>
            <span>Your name</span>
            <input
              aria-label="Your name"
              autoComplete="name"
              required
              value={form.customerName}
              onChange={(event) => updateForm('customerName', event.target.value)}
            />
          </label>
          <label>
            <span>Email</span>
            <input
              aria-label="Email"
              autoComplete="email"
              required
              type="email"
              value={form.customerEmail}
              onChange={(event) => updateForm('customerEmail', event.target.value)}
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              aria-label="Phone"
              autoComplete="tel"
              required
              value={form.customerPhone}
              onChange={(event) => updateForm('customerPhone', event.target.value)}
            />
          </label>
          <label>
            <span>Dog name</span>
            <input
              aria-label="Dog name"
              required
              value={form.dogName}
              onChange={(event) => updateForm('dogName', event.target.value)}
            />
          </label>
          <label>
            <span>Breed</span>
            <input
              aria-label="Breed"
              value={form.dogBreed}
              onChange={(event) => updateForm('dogBreed', event.target.value)}
            />
          </label>
          <label>
            <span>Groomer</span>
            <select
              aria-label="Groomer"
              required
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
              required
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
              required
              value={form.dogSize}
              onChange={(event) => updateForm('dogSize', event.target.value)}
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
          <span>Dog notes</span>
          <textarea
            aria-label="Dog notes"
            rows="2"
            value={form.dogNotes}
            onChange={(event) => updateForm('dogNotes', event.target.value)}
          />
        </label>
        <label>
          <span>Notes</span>
          <textarea
            aria-label="Notes"
            rows="3"
            value={form.customerNotes}
            onChange={(event) => updateForm('customerNotes', event.target.value)}
          />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Sending...' : 'Request booking as guest'}
        </button>
        {message ? <p className="form-message">{message}</p> : null}
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

import { CalendarCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { buildPreferredWindows, createBookingRequest } from '../api/bookingRequests.js';
import { DOG_SIZE_OPTIONS } from '../api/dogs.js';
import {
  createGuestBookingRequest,
  PENDING_GUEST_CLAIM_STORAGE_KEY,
} from '../api/guestBooking.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { requireSupabaseClient } from '../lib/supabaseClient.js';
import { BookingTimingFieldset } from './BookingTimingFieldset.jsx';
import { GroomerServiceFields } from './GroomerServiceFields.jsx';
import { chooseServiceForGroomer, serviceOptionsForGroomer } from './groomerServices.js';
import { loadGuestPrefill, saveGuestPrefill } from './guestPrefill.js';

const DEFAULT_TIMING = {
  firstAvailable: true,
  preferredDate: '',
  preferredTimeOfDay: 'morning',
  preferredTime: '',
  backupDate: '',
  backupTimeOfDay: 'afternoon',
  backupTime: '',
};

function findById(items, id) {
  return items.find((item) => item.id === id) || items[0] || null;
}

function findExactById(items, id) {
  return items.find((item) => item.id === id) || null;
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

function useBookingTiming() {
  const [timing, setTiming] = useState(DEFAULT_TIMING);
  const onTimingChange = (field, value) => setTiming((current) => ({ ...current, [field]: value }));
  return { timing, onTimingChange };
}

function FormHeader({ title, description }) {
  return (
    <>
      <div className="login-panel__icon">
        <CalendarCheck size={18} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </>
  );
}

// --- Signed-in customer booking -------------------------------------------

function SignedInBooking({ customer, dogs, groomers, onRequestCreated, selectedGroomer, selectedService }) {
  const initialDog = dogs[0] || null;
  const initialGroomer =
    findExactById(groomers, initialDog?.preferredGroomerId) || selectedGroomer || groomers[0] || null;

  const [dogId, setDogId] = useState(dogs[0]?.id || '');
  const [groomerId, setGroomerId] = useState(initialGroomer?.id || '');
  const [service, setService] = useState(
    chooseServiceForGroomer(initialGroomer, { dog: initialDog, selectedService }),
  );
  const [dogSize, setDogSize] = useState(initialDog?.size || '');
  const [customerNotes, setCustomerNotes] = useState('');
  const { timing, onTimingChange } = useBookingTiming();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [bookingRequest, setBookingRequest] = useState(null);

  const selectedDog = useMemo(() => findById(dogs, dogId), [dogId, dogs]);
  const activeGroomer = useMemo(() => findById(groomers, groomerId), [groomerId, groomers]);
  const serviceOptions = useMemo(() => serviceOptionsForGroomer(activeGroomer), [activeGroomer]);

  useEffect(() => {
    if (!dogs.some((dog) => dog.id === dogId)) setDogId(dogs[0]?.id || '');
  }, [dogId, dogs]);

  useEffect(() => {
    const preferredGroomer = findExactById(groomers, selectedDog?.preferredGroomerId);
    if (preferredGroomer) setGroomerId(preferredGroomer.id);
    setDogSize(selectedDog?.size || '');
  }, [groomers, selectedDog?.id, selectedDog?.preferredGroomerId]);

  useEffect(() => {
    if (!groomers.some((groomer) => groomer.id === groomerId)) {
      setGroomerId(selectedGroomer?.id || groomers[0]?.id || '');
    }
  }, [groomers, groomerId, selectedGroomer?.id]);

  useEffect(() => {
    if (selectedGroomer?.id && !selectedDog?.preferredGroomerId) setGroomerId(selectedGroomer.id);
  }, [selectedDog?.preferredGroomerId, selectedGroomer?.id]);

  useEffect(() => {
    if (
      selectedDog?.preferredServiceId &&
      serviceOptions.some((option) => option.id === selectedDog.preferredServiceId)
    ) {
      setService(selectedDog.preferredServiceId);
      return;
    }
    if (!serviceOptions.some((option) => option.id === service)) {
      setService(chooseServiceForGroomer(activeGroomer, { dog: selectedDog, selectedService }));
    }
  }, [activeGroomer, selectedDog, selectedService, service, serviceOptions]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setError('');
    setBookingRequest(null);
    setStatus('saving');

    const dogForRequest = { ...selectedDog, size: dogSize || selectedDog?.size };
    try {
      const request = await createBookingRequest(requireSupabaseClient(), customer, dogForRequest, activeGroomer, {
        service,
        preferredWindows: buildPreferredWindows(timing),
        customerNotes: buildCustomerNotes(customerNotes, dogForRequest),
      });
      setBookingRequest(request);
      setStatus('saved');
      if (typeof onRequestCreated === 'function') onRequestCreated(request);
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  if (!dogs.length) {
    return (
      <section className="signed-in-card booking-request-panel">
        <FormHeader title="Booking request" description="Add a dog profile before requesting a booking." />
      </section>
    );
  }

  if (!groomers.length) {
    return (
      <section className="signed-in-card booking-request-panel">
        <FormHeader title="Booking request" description="Search for groomers before requesting a booking." />
      </section>
    );
  }

  return (
    <section className="signed-in-card booking-request-panel">
      <FormHeader
        title="Booking request"
        description="Pick preferred times. Confirmation still happens with the groomer."
      />

      {bookingRequest ? (
        <div className="request-confirmation">
          <h3>Booking request saved</h3>
          <p>We saved the request under your account.</p>
          {bookingRequest.externalBookingUrl ? (
            <a href={bookingRequest.externalBookingUrl} target="_blank" rel="noreferrer">
              Continue on groomer site
            </a>
          ) : (
            <a href="/bookings">View your bookings</a>
          )}
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
          <GroomerServiceFields
            groomers={groomers}
            groomerId={groomerId}
            onGroomerChange={setGroomerId}
            serviceOptions={serviceOptions}
            service={service}
            onServiceChange={setService}
          />
          <label>
            <span>Dog size</span>
            <select aria-label="Dog size" value={dogSize} onChange={(event) => setDogSize(event.target.value)}>
              <option value="">Choose size</option>
              {DOG_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <BookingTimingFieldset values={timing} onChange={onTimingChange} />
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

// --- Guest booking ---------------------------------------------------------

function GuestBooking({ groomers, selectedDogSize, selectedGroomer, selectedService }) {
  const { isConfigured, sendMagicLink } = useAuth();
  const initialGroomer = selectedGroomer || groomers[0] || null;
  const prefill = useMemo(() => loadGuestPrefill(), []);

  const [form, setForm] = useState({
    customerName: prefill.customerName || '',
    customerEmail: prefill.customerEmail || '',
    customerPhone: prefill.customerPhone || '',
    dogName: prefill.dogName || '',
    dogBreed: prefill.dogBreed || '',
    dogSize: selectedDogSize || prefill.dogSize || '',
    dogNotes: prefill.dogNotes || '',
    customerNotes: '',
  });
  const [groomerId, setGroomerId] = useState(initialGroomer?.id || '');
  const [service, setService] = useState(
    chooseServiceForGroomer(initialGroomer, { selectedService }),
  );
  const { timing, onTimingChange } = useBookingTiming();
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
    if (selectedGroomer?.id) setGroomerId(selectedGroomer.id);
  }, [selectedGroomer?.id]);

  useEffect(() => {
    setForm((current) => ({ ...current, dogSize: current.dogSize || selectedDogSize || '' }));
  }, [selectedDogSize]);

  useEffect(() => {
    if (!serviceOptions.some((option) => option.id === service)) {
      setService(chooseServiceForGroomer(activeGroomer, { selectedService }));
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

    const trimmed = {
      customerEmail: form.customerEmail.trim(),
      customerName: form.customerName.trim(),
      customerNotes: form.customerNotes.trim(),
      customerPhone: form.customerPhone.trim(),
      dogBreed: form.dogBreed.trim(),
      dogName: form.dogName.trim(),
      dogNotes: form.dogNotes.trim(),
      dogSize: form.dogSize,
    };

    try {
      const result = await createGuestBookingRequest({
        ...trimmed,
        groomerId,
        preferredWindows: buildPreferredWindows(timing),
        service,
      });
      // Remember details so a returning guest doesn't retype them.
      saveGuestPrefill(trimmed);
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
        <FormHeader title="Guest booking request" description="Search for groomers before requesting a booking." />
      </section>
    );
  }

  return (
    <section className="signed-in-card booking-request-panel guest-booking-panel">
      <FormHeader
        title="Guest booking request"
        description="Send the request now. You can save the details to an account after it is sent."
      />

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
          <GroomerServiceFields
            groomers={groomers}
            groomerId={groomerId}
            onGroomerChange={setGroomerId}
            serviceOptions={serviceOptions}
            service={service}
            onServiceChange={setService}
            required
          />
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
        <BookingTimingFieldset values={timing} onChange={onTimingChange} />
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

// Single adaptive booking form: signed-in customers (with a profile) get the
// profile-driven form; everyone else gets the guest form.
export function BookingForm({
  customer = null,
  dogs = [],
  groomers = [],
  onRequestCreated,
  selectedDogSize = '',
  selectedGroomer = null,
  selectedService = null,
}) {
  if (customer) {
    return (
      <SignedInBooking
        customer={customer}
        dogs={dogs}
        groomers={groomers}
        onRequestCreated={onRequestCreated}
        selectedGroomer={selectedGroomer}
        selectedService={selectedService}
      />
    );
  }

  return (
    <GuestBooking
      groomers={groomers}
      selectedDogSize={selectedDogSize}
      selectedGroomer={selectedGroomer}
      selectedService={selectedService}
    />
  );
}

import { Clock, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchNextAvailable, joinWaitlist } from '../api/waitlist.js';
import { GROOMING_SERVICES } from '../data/services.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';

function formatSlotTime(slotAt) {
  if (!slotAt) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(slotAt));
  } catch {
    return slotAt;
  }
}

function getServiceName(serviceId) {
  return GROOMING_SERVICES.find((s) => s.id === serviceId)?.name || serviceId || '';
}

function NextAvailableResult({ result, groomerName }) {
  return (
    <article className="next-available-result">
      <div className="next-available-result__header">
        <div>
          <h4>{groomerName || 'Groomer'}</h4>
          <p className="next-available-result__time">{formatSlotTime(result.slotAt)}</p>
        </div>
      </div>
    </article>
  );
}

export function NextAvailablePanel({ customer, location, selectedService }) {
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const [waitlistStatus, setWaitlistStatus] = useState('idle');
  const [waitlistError, setWaitlistError] = useState('');
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  async function handleSearch() {
    if (!location?.lat || !location?.lng) {
      setSearchError('Please provide a location to search.');
      return;
    }

    if (!selectedService?.id) {
      setSearchError('Please select a service.');
      return;
    }

    setSearchStatus('loading');
    setSearchError('');
    setSearchResults([]);

    try {
      const results = await fetchNextAvailable({
        lat: location.lat,
        lng: location.lng,
        radiusM: 8047, // ~5 miles
        serviceId: selectedService.id,
        topN: 5,
      });

      setSearchResults(Array.isArray(results) ? results : []);
      setSearchStatus('ready');
    } catch (caught) {
      setSearchError(caught?.message || 'Could not search for available slots.');
      setSearchStatus('error');
    }
  }

  async function handleJoinWaitlist() {
    if (!customer?.id) {
      setWaitlistError('Please log in to join the waitlist.');
      return;
    }

    if (!selectedService?.id) {
      setWaitlistError('Please select a service.');
      return;
    }

    if (!location?.lat || !location?.lng) {
      setWaitlistError('Please provide a location.');
      return;
    }

    setWaitlistStatus('saving');
    setWaitlistError('');
    setWaitlistSuccess(false);

    let client;
    try {
      client = requireSupabaseClient();
    } catch (caught) {
      setWaitlistError(caught?.message || 'Could not join the waitlist right now.');
      setWaitlistStatus('error');
      return;
    }

    try {
      await joinWaitlist(client, {
        customerId: customer.id,
        serviceId: selectedService.id,
        location: { lat: location.lat, lng: location.lng },
        radiusM: 8047, // ~5 miles
        groomerId: null, // Global waitlist
      });

      setWaitlistSuccess(true);
      setWaitlistStatus('ready');
    } catch (caught) {
      setWaitlistError(caught?.message || 'Could not join the waitlist.');
      setWaitlistStatus('error');
    }
  }

  return (
    <section className="signed-in-card next-available-panel">
      <div className="login-panel__icon">
        <Clock size={18} />
      </div>
      <div className="next-available-panel__heading">
        <h2>Find your next appointment</h2>
        <p>Search for available slots or get notified when one opens up.</p>
      </div>

      <div className="next-available-panel__actions">
        <div className="next-available-panel__action">
          <h3>Search soonest openings</h3>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searchStatus === 'loading'}
            aria-busy={searchStatus === 'loading'}
          >
            {searchStatus === 'loading' ? 'Searching...' : 'Search'}
          </button>
          {searchError ? (
            <p className="form-message form-message--error">{searchError}</p>
          ) : null}

          {searchStatus === 'ready' && searchResults.length > 0 ? (
            <div className="next-available-results">
              {searchResults.map((result, idx) => (
                <NextAvailableResult
                  key={idx}
                  result={result}
                  groomerName={result.groomerName}
                />
              ))}
            </div>
          ) : searchStatus === 'ready' && searchResults.length === 0 ? (
            <p className="empty-state">No available slots found in your area right now.</p>
          ) : null}
        </div>

        <div className="next-available-panel__action">
          <h3>Notify me of the next opening</h3>
          <button
            type="button"
            onClick={handleJoinWaitlist}
            disabled={waitlistStatus === 'saving'}
            aria-busy={waitlistStatus === 'saving'}
          >
            <Bell size={14} aria-hidden="true" />
            {waitlistStatus === 'saving' ? 'Adding...' : 'Notify me'}
          </button>
          {waitlistError ? (
            <p className="form-message form-message--error">{waitlistError}</p>
          ) : null}
          {waitlistSuccess ? (
            <p className="form-message form-message--success">
              You're on the waitlist! We'll notify you when a slot opens up.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

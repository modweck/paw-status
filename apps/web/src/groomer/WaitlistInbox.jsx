import { useCallback, useEffect, useState } from 'react';

import { loadGroomerWaitlist, offerSlot } from '../api/waitlist.js';
import { SlotPicker } from '../customer/SlotPicker.jsx';

/**
 * WaitlistInbox - Display and manage waitlist entries for a groomer
 *
 * @param {Object} props
 * @param {string} props.groomerId - ID of the groomer
 * @param {Object} props.supabase - Supabase client
 */
export function WaitlistInbox({ groomerId, supabase }) {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [offeringInProgress, setOfferingInProgress] = useState(false);
  const [offerError, setOfferError] = useState('');

  const loadWaitlist = useCallback(async () => {
    setStatus('loading');
    setError('');

    try {
      const nextEntries = await loadGroomerWaitlist(supabase, groomerId);
      setEntries(nextEntries);
      setStatus('ready');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('error');
    }
  }, [supabase, groomerId]);

  useEffect(() => {
    loadWaitlist();
  }, [loadWaitlist]);

  const handleOfferSlot = async (entry, slot) => {
    setOfferingInProgress(true);
    setOfferError('');

    try {
      await offerSlot(supabase, groomerId, slot.startTime, entry.serviceId);
      setSelectedEntryId(null);
      // Refresh the waitlist after offering a slot
      await loadWaitlist();
    } catch (nextError) {
      setOfferError(nextError.message);
      setOfferingInProgress(false);
    }
  };

  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(isoString));
    } catch {
      return '';
    }
  }

  if (status === 'loading') {
    return (
      <section className="signed-in-card groomer-panel">
        <p className="empty-state">Loading waitlist...</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="signed-in-card groomer-panel">
        <p className="form-message form-message--error">{error}</p>
      </section>
    );
  }

  const selectedEntry = entries.find((e) => e.id === selectedEntryId);

  if (selectedEntry) {
    return (
      <section className="signed-in-card groomer-panel">
        <button
          className="back-button"
          onClick={() => {
            setSelectedEntryId(null);
            setOfferError('');
          }}
          type="button"
          disabled={offeringInProgress}
        >
          Back
        </button>
        <div>
          <h3>Offer slot to {selectedEntry.customer?.name || 'Customer'}</h3>
          <p>Service: {selectedEntry.service?.name || 'Service'}</p>
        </div>
        <SlotPicker
          groomerId={groomerId}
          serviceId={selectedEntry.serviceId}
          supabase={supabase}
          onPick={(slot) => handleOfferSlot(selectedEntry, slot)}
        />
        {offerError ? <p className="form-message form-message--error">{offerError}</p> : null}
      </section>
    );
  }

  if (!entries.length) {
    return (
      <section className="signed-in-card groomer-panel">
        <p className="empty-state">No active waitlist entries.</p>
      </section>
    );
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div>
        <h2>Waitlist</h2>
        <p>{entries.length} customer{entries.length !== 1 ? 's' : ''} waiting</p>
      </div>
      <div className="waitlist-entries">
        {entries.map((entry) => (
          <article className="waitlist-entry" key={entry.id}>
            <div className="waitlist-entry__info">
              <div>
                <strong>{entry.service?.name || 'Service'}</strong>
                <p>{entry.customer?.name || 'Customer'}</p>
              </div>
              <span>{formatDate(entry.createdAt)}</span>
            </div>
            <button
              className="primary-action"
              onClick={() => setSelectedEntryId(entry.id)}
              type="button"
              disabled={selectedEntryId !== null}
            >
              Offer a slot
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

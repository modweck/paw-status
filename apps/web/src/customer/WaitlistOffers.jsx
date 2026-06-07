import { Gift, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { claimOffer, loadMyOffers } from '../api/waitlist.js';
import { GROOMING_SERVICES } from '../data/services.js';

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

function formatExpiryTime(expiresAt) {
  if (!expiresAt) return '';
  try {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs < 0) return 'Expired';

    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Expires in seconds';
    if (diffMins < 60) return `Expires in ${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Expires in ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `Expires in ${diffDays}d`;
  } catch {
    return '';
  }
}

function getServiceName(serviceId) {
  return GROOMING_SERVICES.find((s) => s.id === serviceId)?.name || serviceId || '';
}

function OfferItem({ offer, groomerName, onClaim }) {
  const [claimStatus, setClaimStatus] = useState('idle');
  const [claimError, setClaimError] = useState('');

  async function handleClaim() {
    setClaimStatus('claiming');
    setClaimError('');

    try {
      await onClaim(offer.id);
      setClaimStatus('claimed');
    } catch (caught) {
      setClaimError(caught?.message || 'Could not claim this offer.');
      setClaimStatus('error');
    }
  }

  if (claimStatus === 'claimed') {
    return null; // Removed from list after successful claim
  }

  return (
    <article className="waitlist-offer">
      <div className="waitlist-offer__header">
        <div>
          <h4>{groomerName || 'Groomer'}</h4>
          <p className="waitlist-offer__service">{getServiceName(offer.serviceId)}</p>
        </div>
        <span className="waitlist-offer__time">{formatSlotTime(offer.slotAt)}</span>
      </div>
      <div className="waitlist-offer__footer">
        <span className="waitlist-offer__expiry">{formatExpiryTime(offer.expiresAt)}</span>
        <button
          type="button"
          onClick={handleClaim}
          disabled={claimStatus === 'claiming'}
          aria-busy={claimStatus === 'claiming'}
          className="button--primary"
        >
          {claimStatus === 'claiming' ? 'Claiming...' : 'Claim'}
        </button>
      </div>
      {claimError ? <p className="form-message form-message--error">{claimError}</p> : null}
    </article>
  );
}

export function WaitlistOffers({ supabase }) {
  const [status, setStatus] = useState('idle');
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState('');
  const [groomers, setGroomers] = useState({});
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!supabase) return undefined;

    let cancelled = false;
    setStatus('loading');
    setError('');

    loadMyOffers(supabase)
      .then((rows) => {
        if (cancelled) return;
        setOffers(rows);
        setStatus('ready');

        // Load groomer names for all offers
        const groomerIds = [...new Set(rows.map((offer) => offer.groomerId))];
        const groomersMap = {};

        Promise.all(
          groomerIds.map((groomerId) =>
            supabase
              .from('groomers')
              .select('id, name')
              .eq('id', groomerId)
              .single()
              .then(({ data }) => {
                if (data) {
                  groomersMap[groomerId] = data.name;
                }
              })
              .catch(() => {
                // Silently handle groomer lookup failures
              }),
          ),
        ).then(() => {
          if (!cancelled) {
            setGroomers(groomersMap);
          }
        });
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught?.message || 'Could not load your offers right now.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, refreshTick]);

  async function handleClaimSuccess(offerId) {
    await claimOffer(supabase, offerId);
    // Remove the claimed offer from the local list
    setOffers((prev) => prev.filter((offer) => offer.id !== offerId));
  }

  return (
    <section className="signed-in-card waitlist-offers-panel">
      <div className="login-panel__icon">
        <Gift size={18} />
      </div>
      <div className="waitlist-offers-panel__heading">
        <div>
          <h2>Waitlist offers</h2>
          <p>
            {status === 'idle' || status === 'loading'
              ? 'Loading your offers...'
              : status === 'error'
                ? 'Could not load your offers.'
                : offers.length
                  ? `${offers.length} offer${offers.length === 1 ? '' : 's'}`
                  : 'No offers yet.'}
          </p>
        </div>
        <button
          aria-busy={status === 'loading'}
          className="admin-refresh-button"
          disabled={status === 'loading'}
          onClick={() => setRefreshTick((tick) => tick + 1)}
          type="button"
        >
          <RotateCw size={14} aria-hidden="true" />
          {status === 'loading' ? 'Loading' : 'Refresh'}
        </button>
      </div>

      {status === 'error' ? (
        <p className="form-message form-message--error">{error}</p>
      ) : null}

      {offers.length ? (
        <div className="waitlist-offers">
          {offers.map((offer) => (
            <OfferItem
              key={offer.id}
              offer={offer}
              groomerName={groomers[offer.groomerId]}
              onClaim={handleClaimSuccess}
            />
          ))}
        </div>
      ) : status === 'ready' ? (
        <p className="empty-state">
          You don't have any waitlist offers yet. Join the waitlist to get started.
        </p>
      ) : null}
    </section>
  );
}

import { CalendarClock, ExternalLink, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { loadCustomerBookingRequests } from '../api/bookingRequests.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';
import { WaitlistOffers } from './WaitlistOffers.jsx';

// Customer-audience copy. Intentionally NOT reusing the groomer-audience
// labels in apps/web/src/groomer/statusLabels.js: "Waiting on customer" and
// similar phrases read as accusatory in the customer's own bookings list.
const CUSTOMER_STATUS_LABELS = Object.freeze({
  requested: {
    label: 'Request sent',
    tone: 'pending',
    help: "We're waiting on the groomer to respond.",
  },
  viewed: {
    label: 'Groomer saw your request',
    tone: 'pending',
    help: "They're reviewing it now.",
  },
  needs_customer_action: {
    label: 'Needs your attention',
    tone: 'attention',
    help: 'The groomer left a note — reach out to keep the request moving.',
  },
  external_handoff: {
    label: "Sent to the groomer's booking page",
    tone: 'info',
    help: "Open the booking link to lock in your slot.",
  },
  confirmed: {
    label: 'Confirmed',
    tone: 'success',
    help: 'See you at your appointment.',
  },
  declined: {
    label: 'Declined',
    tone: 'attention',
    help: "The groomer can't take this one. Try another nearby.",
  },
  expired: {
    label: 'Expired',
    tone: 'muted',
    help: 'No response in time. Try another groomer.',
  },
});

function formatCustomerStatus(status) {
  return (
    CUSTOMER_STATUS_LABELS[status] || {
      label: status || 'Unknown',
      tone: 'muted',
      help: '',
    }
  );
}

function formatBookingDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function groomerLabel(request) {
  const name = request?.groomer?.name || '';
  const salon = request?.groomer?.salon || '';
  if (name && salon && salon !== name) return `${name} at ${salon}`;
  return name || salon || 'Groomer';
}

function BookingItem({ request }) {
  const status = formatCustomerStatus(request.status);
  const date = formatBookingDate(request.createdAt);
  const accessibleLabel = `${groomerLabel(request)} — ${status.label}`;

  return (
    <article className="bookings-list__item" aria-label={accessibleLabel}>
      <header className="bookings-list__item-header">
        <div>
          <h3>{groomerLabel(request)}</h3>
          <p>
            {request.dog?.name || 'Your dog'}
            {request.service ? ` · ${request.service}` : ''}
            {date ? ` · Requested ${date}` : ''}
          </p>
        </div>
        <span className={`bookings-list__status bookings-list__status--${status.tone}`}>
          {status.label}
        </span>
      </header>
      {status.help ? <p className="bookings-list__help">{status.help}</p> : null}
      {request.externalBookingUrl ? (
        <a
          className="bookings-list__external-link"
          href={request.externalBookingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} aria-hidden="true" />
          Open booking link
        </a>
      ) : null}
    </article>
  );
}

export function BookingsListPanel({ customer, refreshKey = 0 }) {
  const [status, setStatus] = useState('idle');
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  // Internal counter for the in-component Refresh button. The optional
  // `refreshKey` prop lets sibling components (e.g. BookingRequestPanel
  // after a successful submit) trigger the same re-fetch.
  const [refreshTick, setRefreshTick] = useState(0);
  const [supabase] = useState(() => {
    try {
      return requireSupabaseClient();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!customer?.id) return undefined;

    let cancelled = false;
    setStatus('loading');
    setError('');

    let client;
    try {
      client = requireSupabaseClient();
    } catch (caught) {
      setError(caught?.message || 'Could not load your bookings right now.');
      setStatus('error');
      return undefined;
    }

    loadCustomerBookingRequests(client, customer)
      .then((rows) => {
        if (cancelled) return;
        setRequests(rows);
        setStatus('ready');
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught?.message || 'Could not load your bookings right now.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // The full `customer` object is intentionally OMITTED from the deps so a
    // new object reference with the same id does not trigger a re-fetch.
    // customer.id, refreshTick, and refreshKey ARE included on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, refreshTick, refreshKey]);

  return (
    <section className="signed-in-card bookings-list-panel">
      <div className="login-panel__icon">
        <CalendarClock size={18} />
      </div>
      <div className="bookings-list-panel__heading">
        <div>
          <h2>Your bookings</h2>
          <p>
            {status === 'idle' || status === 'loading'
              ? 'Loading your requests...'
              : status === 'error'
                ? 'Could not load your bookings.'
                : requests.length
                  ? `${requests.length} request${requests.length === 1 ? '' : 's'}`
                  : 'No booking requests yet.'}
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

      {requests.length ? (
        <div className="bookings-list">
          {requests.map((request) => (
            <BookingItem key={request.id} request={request} />
          ))}
        </div>
      ) : status === 'ready' ? (
        <p className="empty-state">
          You haven't requested any groomings yet. Pick a groomer above to get started.
        </p>
      ) : null}

      {supabase ? <WaitlistOffers supabase={supabase} /> : null}
    </section>
  );
}

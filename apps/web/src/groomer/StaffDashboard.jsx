import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  LockKeyhole,
  RotateCw,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LoginPanel } from '../auth/LoginPanel.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  createGroomerAccountForVerifiedUser,
  loadGroomerWorkspaceForVerifiedUser,
  requestGroomerMembership,
  searchClaimableGroomers,
  updateOwnedAppointmentRequestStatus,
} from '../api/groomerAccounts.js';
import { isStaffDashboardEnabled } from '../config/featureFlags.js';
import { requireSupabaseClient } from '../lib/supabaseClient.js';
import {
  formatAppointmentRequestStatus,
  formatCalendarConnectionStatus,
  formatGroomerMembershipStatus,
} from './statusLabels.js';
import { GroomerProfileManager } from './GroomerProfileManager.jsx';
import { AddYourBusiness } from './AddYourBusiness.jsx';

function formatProvider(provider) {
  return String(provider || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function findExternalBookingUrl(request, bookingChannels) {
  const requestUrl = request.externalBookingUrl || request.groomer?.website;
  if (requestUrl) return requestUrl;

  const channel = bookingChannels.find(
    (candidate) => candidate.groomerId === request.groomerId && candidate.isActive && candidate.url,
  );

  return channel?.url || '';
}

function formatPreferredWindow(window) {
  if (typeof window === 'string') {
    return window.replaceAll('-', ' ');
  }

  if (!window || typeof window !== 'object') return '';

  if (window.type === 'first-available') {
    return 'First available';
  }

  const date = window.date || 'date not set';
  const timeOfDay = window.timeOfDay ? ` ${window.timeOfDay}` : '';

  if (window.type === 'preferred-date') {
    return `Preferred: ${date}${timeOfDay}`;
  }

  if (window.type === 'backup-date') {
    return `Backup: ${date}${timeOfDay}`;
  }

  return '';
}

function formatPreferredWindows(windows = []) {
  return windows.map(formatPreferredWindow).filter(Boolean).join(', ');
}

function replaceRequest(requests, nextRequest) {
  return requests.map((request) => (request.id === nextRequest.id ? nextRequest : request));
}

function StaffGate() {
  return (
    <section className="signed-in-card groomer-panel">
      <div className="staff-locked__icon">
        <LockKeyhole size={28} />
      </div>
      <div>
        <h2>Request handling is gated</h2>
        <p>
          Your groomer account can be created now. Appointment request handling stays closed until the dashboard flag is enabled.
        </p>
      </div>
    </section>
  );
}

function GroomerSignIn() {
  return (
    <section className="staff-screen">
      <div className="signed-in-card groomer-panel">
        <div className="login-panel__icon">
          <UserRound size={18} />
        </div>
        <div>
          <h2>Groomer sign in</h2>
          <p>Use the same magic-link auth before managing request packets.</p>
        </div>
        <LoginPanel compact />
      </div>
    </section>
  );
}

function GroomerAccountForm({ onCreated }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'saving') return;

    setStatus('saving');
    setError('');

    try {
      const account = await createGroomerAccountForVerifiedUser(requireSupabaseClient(), {
        name,
        phone,
      });
      onCreated(account);
      setStatus('saved');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div className="login-panel__icon">
        <UserRound size={18} />
      </div>
      <div>
        <h2>Create groomer account</h2>
        <p>Set up the account that will claim salon profiles and handle requests.</p>
      </div>
      <form className="groomer-form" onSubmit={handleSubmit}>
        <label>
          <span>Name</span>
          <input
            aria-label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Phone</span>
          <input aria-label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Creating...' : 'Create account'}
        </button>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </form>
    </section>
  );
}

function ClaimGroomerProfile({ account, setWorkspace }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handleSearch(event) {
    event.preventDefault();
    if (status === 'searching') return;

    setStatus('searching');
    setError('');

    try {
      const nextResults = await searchClaimableGroomers(requireSupabaseClient(), query);
      setResults(nextResults);
      setStatus('idle');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  async function handleClaim(groomerId) {
    if (status === 'claiming') return;

    setStatus('claiming');
    setError('');

    try {
      const membership = await requestGroomerMembership(requireSupabaseClient(), account, groomerId);
      setWorkspace((current) => ({
        ...current,
        memberships: [...current.memberships, membership],
      }));
      setStatus('idle');
    } catch (nextError) {
      setError(nextError.message);
      setStatus('idle');
    }
  }

  return (
    <>
      <form className="groomer-form" onSubmit={handleSearch}>
        <label>
          <span>Groomer name</span>
          <input
            aria-label="Groomer name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            required
          />
        </label>
        <button className="primary-action" type="submit" disabled={status === 'searching'}>
          {status === 'searching' ? 'Searching...' : 'Search profiles'}
        </button>
      </form>
      {results.length ? (
        <div className="membership-list">
          {results.map((result) => (
            <article className="membership-item" key={result.id}>
              <div>
                <h3>{result.name}</h3>
                <p>{result.address || result.salon || result.website}</p>
              </div>
              <button type="button" disabled={status === 'claiming'} onClick={() => handleClaim(result.id)}>
                Request claim
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </>
  );
}

function SetUpGroomerProfile({ account, setWorkspace }) {
  const [mode, setMode] = useState('search');

  return (
    <>
      <div className="role-toggle" role="group" aria-label="Choose how to set up your profile">
        <button
          type="button"
          className={mode === 'search' ? 'role-toggle__option is-active' : 'role-toggle__option'}
          aria-pressed={mode === 'search'}
          onClick={() => setMode('search')}
        >
          Find on our list
        </button>
        <button
          type="button"
          className={mode === 'google' ? 'role-toggle__option is-active' : 'role-toggle__option'}
          aria-pressed={mode === 'google'}
          onClick={() => setMode('google')}
        >
          Add from Google
        </button>
      </div>
      {mode === 'search' ? (
        <ClaimGroomerProfile account={account} setWorkspace={setWorkspace} />
      ) : (
        <AddYourBusiness account={account} setWorkspace={setWorkspace} />
      )}
    </>
  );
}

function MembershipSummary({ account, memberships, setWorkspace, verifiedMemberships }) {
  if (!memberships.length) {
    return (
      <section className="signed-in-card groomer-panel">
        <div className="login-panel__icon">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <h2>Set up your groomer profile</h2>
          <p>Find your salon in our list, or add it from Google if it isn&apos;t there yet.</p>
        </div>
        <SetUpGroomerProfile account={account} setWorkspace={setWorkspace} />
      </section>
    );
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div className="login-panel__icon">
        <CheckCircle2 size={18} />
      </div>
      <div>
        <h2>Groomer profiles</h2>
        <p>{verifiedMemberships.length} verified</p>
      </div>
      <div className="membership-list">
        {memberships.map((membership) => (
          <article className="membership-item" key={membership.id}>
            <div>
              <h3>{membership.groomer?.name || 'Groomer profile'}</h3>
              <p>
                {membership.groomer?.salon && membership.groomer.salon !== membership.groomer?.name
                  ? membership.groomer.salon
                  : membership.role}
              </p>
            </div>
            <span>{formatGroomerMembershipStatus(membership.status)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatRequestedDate(value) {
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

function RequestPacket({ bookingChannels, onUpdateStatus, request, updatingRequestId }) {
  const externalBookingUrl = findExternalBookingUrl(request, bookingChannels);
  const disabled = updatingRequestId === request.id;
  const requestedDate = formatRequestedDate(request.createdAt);

  return (
    <article className="request-packet">
      <div className="request-packet__header">
        <div>
          <h3>{request.dog.name || 'Dog'}</h3>
          <p>
            {request.service}
            {requestedDate ? ` · Requested ${requestedDate}` : ''}
          </p>
        </div>
        <span>{formatAppointmentRequestStatus(request.status)}</span>
      </div>
      <div className="request-packet__grid">
        <div>
          <span>Customer</span>
          <strong>{request.customer.name || 'Customer'}</strong>
          <p>{request.customer.phone || request.customer.email || 'No contact saved'}</p>
        </div>
        <div>
          <span>Dog</span>
          <strong>{[request.dog.breed, request.dog.size].filter(Boolean).join(' / ') || 'Profile saved'}</strong>
          <p>{request.dog.notes || 'No dog notes'}</p>
        </div>
      </div>
      <div className="request-packet__notes">
        <span>Requested timing</span>
        <p>{formatPreferredWindows(request.preferredWindows) || 'None selected'}</p>
      </div>
      {request.customerNotes ? (
        <div className="request-packet__notes">
          <span>Notes</span>
          <p>{request.customerNotes}</p>
        </div>
      ) : null}
      <div className="request-actions">
        <button type="button" disabled={disabled} onClick={() => onUpdateStatus(request, 'viewed')}>
          Mark viewed
        </button>
        <button type="button" disabled={disabled} onClick={() => onUpdateStatus(request, 'needs_customer_action')}>
          Need customer action
        </button>
        <button type="button" disabled={disabled} onClick={() => onUpdateStatus(request, 'declined')}>
          Decline
        </button>
        {externalBookingUrl ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onUpdateStatus(request, 'external_handoff', {
                externalBookingUrl,
              })
            }
          >
            Send booking link
          </button>
        ) : null}
      </div>
      {externalBookingUrl ? (
        <a className="external-booking-link" href={externalBookingUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} />
          Open booking link
        </a>
      ) : null}
    </article>
  );
}

function RequestList({ bookingChannels, onRefresh, refreshing, requests, setWorkspace }) {
  const [updatingRequestId, setUpdatingRequestId] = useState('');
  const [error, setError] = useState('');

  async function handleUpdateStatus(request, status, options) {
    if (updatingRequestId) return;

    setUpdatingRequestId(request.id);
    setError('');

    try {
      const updateArgs = [requireSupabaseClient(), request, status];
      if (options) updateArgs.push(options);
      const nextRequest = await updateOwnedAppointmentRequestStatus(...updateArgs);
      setWorkspace((current) => ({
        ...current,
        requests: replaceRequest(current.requests, nextRequest),
      }));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setUpdatingRequestId('');
    }
  }

  return (
    <section className="signed-in-card groomer-panel">
      <div className="login-panel__icon">
        <ClipboardList size={18} />
      </div>
      <div className="bookings-list-panel__heading">
        <div>
          <h2>Appointment requests</h2>
          <p>{requests.length} open request packets</p>
        </div>
        {onRefresh ? (
          <button
            aria-busy={refreshing}
            className="admin-refresh-button"
            disabled={refreshing}
            onClick={onRefresh}
            type="button"
          >
            <RotateCw size={14} aria-hidden="true" />
            {refreshing ? 'Loading' : 'Refresh'}
          </button>
        ) : null}
      </div>
      {requests.length ? (
        <div className="request-list">
          {requests.map((request) => (
            <RequestPacket
              bookingChannels={bookingChannels}
              key={request.id}
              onUpdateStatus={handleUpdateStatus}
              request={request}
              updatingRequestId={updatingRequestId}
            />
          ))}
        </div>
      ) : (
        <p className="empty-state">No customer requests for verified groomer profiles.</p>
      )}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </section>
  );
}

function BookingChannels({ channels }) {
  if (!channels.length) return null;

  return (
    <section className="signed-in-card groomer-panel">
      <div className="login-panel__icon">
        <ExternalLink size={18} />
      </div>
      <div>
        <h2>Booking channels</h2>
        <p>{channels.length} active handoff path</p>
      </div>
      <div className="metadata-list">
        {channels.map((channel) => (
          <div className="metadata-row" key={channel.id}>
            <div>
              <strong>{channel.label || formatProvider(channel.provider)}</strong>
              <span>{channel.url || channel.phone || channel.email}</span>
            </div>
            <span>{formatProvider(channel.provider)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CalendarConnections({ connections }) {
  return (
    <section className="signed-in-card groomer-panel">
      <div className="login-panel__icon">
        <CalendarClock size={18} />
      </div>
      <div>
        <h2>Calendar connections</h2>
        <p>{connections.length ? `${connections.length} connected source` : 'No calendar connected'}</p>
      </div>
      {connections.length ? (
        <div className="metadata-list">
          {connections.map((connection) => (
            <div className="metadata-row" key={connection.id}>
              <div>
                <strong>{formatProvider(connection.provider)}</strong>
                <span>
                  {connection.externalAccountLabel
                    ? `${connection.externalAccountLabel} calendar`
                    : formatCalendarConnectionStatus(connection.status)}
                </span>
              </div>
              <span>{formatCalendarConnectionStatus(connection.status)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function GroomerWorkspace({ requestHandlingEnabled = true }) {
  const [workspace, setWorkspace] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by the Refresh button so the loader effect re-runs without
  // having to duplicate the load logic in a separate handler.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    const isInitialLoad = refreshTick === 0;

    async function loadWorkspace() {
      if (isInitialLoad) {
        setStatus('loading');
      } else {
        setRefreshing(true);
      }
      setError('');

      try {
        const nextWorkspace = await loadGroomerWorkspaceForVerifiedUser(requireSupabaseClient(), {
          includeRequestHandling: requestHandlingEnabled,
        });
        if (!mounted) return;
        setWorkspace(nextWorkspace);
        setStatus('ready');
      } catch (nextError) {
        if (!mounted) return;
        setError(nextError.message);
        setStatus('error');
      } finally {
        if (mounted) setRefreshing(false);
      }
    }

    loadWorkspace();

    return () => {
      mounted = false;
    };
  }, [requestHandlingEnabled, refreshTick]);

  const refreshWorkspace = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  const accountCreatedWorkspace = useMemo(
    () => ({
      user: workspace?.user || null,
      account: null,
      memberships: [],
      verifiedMemberships: [],
      requests: [],
      bookingChannels: [],
      calendarConnections: [],
    }),
    [workspace?.user],
  );

  function handleAccountCreated(account) {
    setWorkspace({
      ...accountCreatedWorkspace,
      account,
    });
    setStatus('ready');
  }

  if (status === 'loading') {
    return (
      <section className="staff-screen">
        <p className="empty-state">Loading groomer workspace...</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="staff-screen">
        <p className="form-message form-message--error">{error}</p>
      </section>
    );
  }

  if (!workspace?.account) {
    return (
      <section className="staff-screen">
        <GroomerAccountForm onCreated={handleAccountCreated} />
      </section>
    );
  }

  return (
    <section className="staff-screen">
      <div className="section-heading">
        <div>
          <h2>{workspace.account.name}</h2>
          <p>{workspace.account.email}</p>
        </div>
      </div>
      <MembershipSummary
        account={workspace.account}
        memberships={workspace.memberships}
        setWorkspace={setWorkspace}
        verifiedMemberships={workspace.verifiedMemberships}
      />
      {workspace.verifiedMemberships.length ? (
        <GroomerProfileManager verifiedMemberships={workspace.verifiedMemberships} />
      ) : null}
      {workspace.verifiedMemberships.length && !requestHandlingEnabled ? <StaffGate /> : null}
      {workspace.verifiedMemberships.length && requestHandlingEnabled ? (
        <>
          <RequestList
            bookingChannels={workspace.bookingChannels}
            onRefresh={refreshWorkspace}
            refreshing={refreshing}
            requests={workspace.requests}
            setWorkspace={setWorkspace}
          />
          <BookingChannels channels={workspace.bookingChannels} />
          <CalendarConnections connections={workspace.calendarConnections} />
        </>
      ) : null}
    </section>
  );
}

export function StaffDashboard() {
  const { user } = useAuth();
  const requestHandlingEnabled = isStaffDashboardEnabled();

  if (!user) {
    return <GroomerSignIn />;
  }

  return <GroomerWorkspace requestHandlingEnabled={requestHandlingEnabled} />;
}
